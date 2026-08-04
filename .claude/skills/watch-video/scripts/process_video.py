#!/usr/bin/env python3
"""
process_video.py — Turn a video into things Claude can perceive.

Given a local video/audio file OR a URL, this produces a working directory with:
  - frames/f_XXXX.jpg   : sampled still frames (Claude "sees" these via Read)
  - transcript.txt      : spoken words, if transcription is available
  - transcript.json     : transcript with per-segment timestamps
  - subs.srt            : embedded subtitle track, if the file has one (no model needed)
  - audio.wav           : extracted 16kHz mono audio (input to transcription)
  - manifest.json       : index of everything above + metadata

It prints the manifest as JSON to stdout so the caller knows what was produced.

Design notes:
  * Vision (frames) always works — it only needs ffmpeg, which is local.
  * Transcription needs a speech model. If the model can't be obtained (e.g. the
    sandbox blocks HuggingFace / model CDNs) the script DEGRADES GRACEFULLY:
    it still produces frames + subtitles and records why transcription was skipped.
  * URL download uses yt-dlp; it only works when the network reaches the host.
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".flv", ".m4v", ".wmv", ".mpg", ".mpeg", ".ts"}
AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".opus", ".wma"}


def log(msg):
    print(f"[process_video] {msg}", file=sys.stderr, flush=True)


def find_ffmpeg():
    """Prefer a full system ffmpeg; fall back to the Playwright-bundled binary."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import glob
    for cand in glob.glob("/opt/pw-browsers/ffmpeg-*/ffmpeg-linux"):
        if os.path.exists(cand):
            os.chmod(cand, 0o755)
            return cand
    raise RuntimeError("ffmpeg not found. Install it: apt-get install -y ffmpeg")


def find_ffprobe():
    return shutil.which("ffprobe")  # may be None with bundled ffmpeg


def run(cmd, **kw):
    log("$ " + " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, **kw)


def is_url(s):
    return s.startswith("http://") or s.startswith("https://")


# YouTube periodically shows "Sign in to confirm you're not a bot" to datacenter/cloud
# IPs. Different internal "player clients" are affected unevenly, so trying a few in
# order recovers many cases without any user action.
YT_PLAYER_CLIENTS = ["android", "ios", "tv", "web"]


def fetch_url(url, workdir, cookies=None):
    """Download a URL to a local file using yt-dlp. Raises with guidance on failure."""
    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        raise RuntimeError("yt-dlp not installed. Run: pip install yt-dlp")
    out_tmpl = str(workdir / "download.%(ext)s")
    base_cmd = [
        sys.executable, "-m", "yt_dlp",
        "-f", "mp4/best",
        "-o", out_tmpl,
        "--no-playlist",
        # grab subtitles if the platform offers them — saves us the model entirely
        "--write-subs", "--write-auto-subs", "--sub-langs", "en.*,he.*,all",
        "--convert-subs", "srt",
    ]
    if cookies:
        base_cmd += ["--cookies", str(cookies)]

    attempts = []
    last_stderr = ""
    is_bot_check = False
    for client in YT_PLAYER_CLIENTS:
        for f in workdir.glob("download.*"):
            f.unlink()  # clear a partial download from a previous attempt
        cmd = base_cmd + ["--extractor-args", f"youtube:player_client={client}", url]
        res = run(cmd, capture_output=True, text=True)
        attempts.append(client)
        if res.returncode == 0:
            break
        last_stderr = res.stderr or ""
        if "sign in to confirm" in last_stderr.lower() or "not a bot" in last_stderr.lower():
            is_bot_check = True
        # non-YouTube URLs won't benefit from retrying player clients — one try is enough
        if "youtube" not in url and "youtu.be" not in url:
            break
    if res.returncode != 0:
        tail = last_stderr.strip().splitlines()[-5:]
        if is_bot_check:
            hint = (
                "YouTube is showing a bot-check to this sandbox's IP (common for cloud "
                f"IPs), even after trying player clients {attempts}. Fix: export cookies "
                "from a signed-in browser session (e.g. the 'Get cookies.txt' extension) "
                "and pass --cookies <file>. Reliable fallback: ask the user to upload the "
                "video file directly instead."
            )
        else:
            hint = (
                "Download failed. Either the network policy still blocks this host, or "
                "the URL/platform isn't supported. Ask the user to UPLOAD the file instead."
            )
        raise RuntimeError(hint + "\n--- yt-dlp said ---\n" + "\n".join(tail))
    files = [p for p in workdir.iterdir() if p.suffix.lower() in VIDEO_EXTS | AUDIO_EXTS]
    if not files:
        raise RuntimeError("Download produced no media file.")
    return max(files, key=lambda p: p.stat().st_size)


def probe_duration(ffprobe, media):
    if not ffprobe:
        return None
    res = run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(media)],
        capture_output=True, text=True,
    )
    try:
        return float(res.stdout.strip())
    except ValueError:
        return None


def has_subtitle_stream(ffprobe, media):
    if not ffprobe:
        return False
    res = run(
        [ffprobe, "-v", "error", "-select_streams", "s",
         "-show_entries", "stream=index", "-of", "csv=p=0", str(media)],
        capture_output=True, text=True,
    )
    return bool(res.stdout.strip())


def extract_subs(ffmpeg, media, out):
    res = run([ffmpeg, "-y", "-i", str(media), "-map", "0:s:0", str(out),
               "-hide_banner", "-loglevel", "error"], capture_output=True, text=True)
    return out.exists() and out.stat().st_size > 0


def extract_frames(ffmpeg, media, frames_dir, interval, scale_w):
    frames_dir.mkdir(parents=True, exist_ok=True)
    vf = f"fps=1/{interval},scale={scale_w}:-2"
    res = run([ffmpeg, "-y", "-i", str(media), "-vf", vf, "-qscale:v", "3",
               str(frames_dir / "f_%04d.jpg"), "-hide_banner", "-loglevel", "error"],
              capture_output=True, text=True)
    frames = sorted(frames_dir.glob("f_*.jpg"))
    if not frames and res.returncode != 0:
        log("frame extraction stderr: " + (res.stderr or "")[-500:])
    return frames


def extract_audio(ffmpeg, media, out):
    res = run([ffmpeg, "-y", "-i", str(media), "-vn", "-ac", "1", "-ar", "16000",
               str(out), "-hide_banner", "-loglevel", "error"],
              capture_output=True, text=True)
    return out.exists() and out.stat().st_size > 0


def load_whisper_model(model_size):
    """Load a faster-whisper model, preferring an already-cached copy so a
    network-restricted sandbox still works once a setup script has pre-downloaded it."""
    from faster_whisper import WhisperModel
    try:
        # If the weights are already on disk (e.g. downloaded by the environment's
        # setup script), this avoids ever touching the network.
        return WhisperModel(model_size, device="cpu", compute_type="int8", local_files_only=True)
    except Exception:
        pass
    # Fall back to a normal load, which will attempt a download if needed.
    return WhisperModel(model_size, device="cpu", compute_type="int8")


def transcribe(audio, model_size):
    """Try faster-whisper. Returns (segments, None) or (None, reason_skipped)."""
    try:
        from faster_whisper import WhisperModel  # noqa: F401
    except ImportError:
        return None, "faster-whisper not installed (pip install faster-whisper)"
    try:
        model = load_whisper_model(model_size)
    except Exception as e:  # network blocked, model missing, etc.
        return None, f"could not load model '{model_size}': {e}"
    try:
        segments, info = model.transcribe(str(audio), vad_filter=True)
        out = [{"start": round(s.start, 2), "end": round(s.end, 2),
                "text": s.text.strip()} for s in segments]
        return {"language": info.language, "segments": out}, None
    except Exception as e:
        return None, f"transcription error: {e}"


def check_environment(model_size):
    """Preflight: report what's usable without doing any real work. Human-readable."""
    lines = []
    ok = True

    try:
        ffmpeg = find_ffmpeg()
        lines.append(f"ffmpeg: ok ({ffmpeg})")
    except Exception as e:
        ok = False
        lines.append(f"ffmpeg: MISSING ({e})")

    try:
        import yt_dlp  # noqa: F401
        lines.append("yt-dlp: installed")
    except ImportError:
        ok = False
        lines.append("yt-dlp: MISSING (pip install yt-dlp)")

    import socket
    try:
        socket.create_connection(("huggingface.co", 443), timeout=5).close()
        lines.append("network to huggingface.co: reachable")
    except Exception as e:
        lines.append(f"network to huggingface.co: unreachable ({e}) "
                      "— transcription will only work if the model is pre-cached")

    try:
        from faster_whisper import WhisperModel  # noqa: F401
        try:
            load_whisper_model(model_size)
            lines.append(f"whisper model '{model_size}': ok (loads, cached or downloadable)")
        except Exception as e:
            lines.append(f"whisper model '{model_size}': NOT AVAILABLE ({e}) "
                          "— frames + subtitles still work, transcription will be skipped")
    except ImportError:
        lines.append("faster-whisper: MISSING (pip install faster-whisper)")

    print("\n".join(lines))
    return ok


def main():
    ap = argparse.ArgumentParser(description="Turn a video into frames + transcript for Claude.")
    ap.add_argument("input", nargs="?", default=None,
                    help="Path to a local video/audio file, or a URL")
    ap.add_argument("--outdir", default=None, help="Output dir (default: temp dir)")
    ap.add_argument("--interval", type=float, default=None,
                    help="Seconds between sampled frames (default: adaptive)")
    ap.add_argument("--max-frames", type=int, default=40, help="Cap on number of frames")
    ap.add_argument("--scale-width", type=int, default=640, help="Frame width in px")
    ap.add_argument("--model", default="base", help="Whisper model size (tiny/base/small/medium)")
    ap.add_argument("--no-transcribe", action="store_true", help="Skip audio transcription")
    ap.add_argument("--cookies", default=None,
                    help="Path to a cookies.txt for yt-dlp, needed when a platform "
                         "shows a bot-check to this sandbox's IP")
    ap.add_argument("--check", action="store_true",
                    help="Preflight only: report what's usable and exit (no input needed)")
    args = ap.parse_args()

    if args.check:
        ok = check_environment(args.model)
        sys.exit(0 if ok else 1)

    if not args.input:
        ap.error("input is required unless --check is given")

    ffmpeg = find_ffmpeg()
    ffprobe = find_ffprobe()

    outdir = Path(args.outdir) if args.outdir else Path(tempfile.mkdtemp(prefix="watchvideo_"))
    outdir.mkdir(parents=True, exist_ok=True)
    dl_dir = outdir / "dl"; dl_dir.mkdir(exist_ok=True)

    # 1. Resolve media to a local file
    if is_url(args.input):
        log(f"Fetching URL: {args.input}")
        media = fetch_url(args.input, dl_dir, cookies=args.cookies)
    else:
        media = Path(args.input).expanduser().resolve()
        if not media.exists():
            print(json.dumps({"error": f"File not found: {media}"}))
            sys.exit(1)

    is_audio_only = media.suffix.lower() in AUDIO_EXTS

    # 2. Metadata
    duration = probe_duration(ffprobe, media)

    # 3. Pick a frame interval that respects max_frames
    if args.interval:
        interval = args.interval
    elif duration:
        interval = max(1.0, duration / args.max_frames)
    else:
        interval = 5.0
    if duration:
        interval = max(interval, duration / args.max_frames)

    manifest = {
        "input": str(args.input),
        "media_file": str(media),
        "outdir": str(outdir),
        "duration_sec": round(duration, 2) if duration else None,
        "frame_interval_sec": round(interval, 2),
        "is_audio_only": is_audio_only,
        "ffmpeg": ffmpeg,
    }

    # 4. Frames (skip for audio-only)
    frames = []
    if not is_audio_only:
        frames = extract_frames(ffmpeg, media, outdir / "frames", interval, args.scale_width)
    manifest["frames"] = [str(p) for p in frames]
    manifest["n_frames"] = len(frames)
    # map each frame to an approximate timestamp
    manifest["frame_timestamps_sec"] = [round(i * interval, 1) for i in range(len(frames))]

    # 5. Embedded subtitles (free, no model)
    subs_path = outdir / "subs.srt"
    manifest["subtitles"] = None
    if has_subtitle_stream(ffprobe, media):
        if extract_subs(ffmpeg, media, subs_path):
            manifest["subtitles"] = str(subs_path)
    # yt-dlp may also have dropped .srt files in dl_dir
    if manifest["subtitles"] is None:
        for srt in dl_dir.glob("*.srt"):
            shutil.copy(srt, subs_path)
            manifest["subtitles"] = str(subs_path)
            break

    # 6. Audio + transcription
    manifest["transcript"] = None
    manifest["transcript_json"] = None
    manifest["transcript_status"] = "skipped (--no-transcribe)" if args.no_transcribe else None
    if not args.no_transcribe:
        audio_path = outdir / "audio.wav"
        if extract_audio(ffmpeg, media, audio_path):
            manifest["audio"] = str(audio_path)
            result, reason = transcribe(audio_path, args.model)
            if result:
                (outdir / "transcript.json").write_text(
                    json.dumps(result, ensure_ascii=False, indent=2))
                lines = [f"[{s['start']:.0f}s] {s['text']}" for s in result["segments"]]
                (outdir / "transcript.txt").write_text("\n".join(lines), encoding="utf-8")
                manifest["transcript"] = str(outdir / "transcript.txt")
                manifest["transcript_json"] = str(outdir / "transcript.json")
                manifest["transcript_status"] = f"ok (language={result.get('language')})"
            else:
                manifest["transcript_status"] = f"unavailable: {reason}"
        else:
            manifest["transcript_status"] = "no audio track / audio extraction failed"

    (outdir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
