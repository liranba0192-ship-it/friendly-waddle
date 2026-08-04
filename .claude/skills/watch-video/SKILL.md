---
name: watch-video
description: >
  Give Claude "eyes" for video. Use whenever the user shares a video — an uploaded
  video/audio file, a direct media URL, or a YouTube/TikTok/Instagram/Reels link — and
  wants Claude to watch it, summarize it, answer questions about it, transcribe it, pull
  key moments, or otherwise understand its contents. Triggers on requests like
  "summarize this video", "what happens in this clip", "watch this", "transcribe this",
  "מה יש בסרטון", "תסכם לי את הסרטון", "תראה את הסרטון הזה".
---

# watch-video — עיניים לוידאו 👁️

Claude cannot play a video, but it CAN read images and text. This skill converts a
video into two things Claude perceives directly:

- **Frames** (sampled still images) → Claude *sees* what is on screen.
- **Transcript / subtitles** (text) → Claude *reads* what is said.

## Workflow

### 0. (Optional) Preflight check
Before working on a URL, it's cheap to check what's actually usable in this session:
```bash
python3 "$CLAUDE_PROJECT_DIR"/.claude/skills/watch-video/scripts/process_video.py --check
```
Reports ffmpeg, yt-dlp, network reachability to huggingface.co, and whether the
transcription model loads. Use this to set expectations before promising a link-based
workflow to the user.

### 1. Get the media to a local path
- **Uploaded file** (recommended, always works): use the file the user provided.
- **URL**: pass it directly; the script uses `yt-dlp`. NOTE: many sandboxes block
  YouTube/TikTok by default — if download fails, ask the user to upload the file instead,
  or see [Network access](#network-access-for-url-downloads--transcription) below.

### 2. Run the processor
```bash
python3 "$CLAUDE_PROJECT_DIR"/.claude/skills/watch-video/scripts/process_video.py "<file-or-URL>" --outdir /tmp/watchvideo_run
```
Useful flags:
- `--interval 3` — a frame every 3 seconds (default: adaptive, capped at `--max-frames`, default 40).
- `--max-frames 60` — raise the frame cap for longer/denser videos.
- `--model small` — larger, more accurate transcription model (default `base`).
- `--no-transcribe` — frames only (fast; good for purely visual clips).
- `--cookies <file>` — a cookies.txt for yt-dlp. Needed if YouTube shows a bot-check to
  this session's IP (see below); ask the user to export one from a signed-in browser
  (e.g. the "Get cookies.txt" extension) if a download keeps failing that way.

The script prints a **manifest JSON** listing every artifact. Key fields:
`frames` (list of image paths), `frame_timestamps_sec` (parallel list of approx timestamps),
`transcript`, `subtitles`, `transcript_status`, `duration_sec`.

### 3. Perceive the content
- **Read the frames**: use the Read tool on the paths in `frames`. Read them in order —
  index `i` corresponds to `frame_timestamps_sec[i]` seconds into the video. For long
  videos, read a representative spread first, then zoom into the region the user asks about.
- **Read the text**: Read `transcript` (spoken words with `[Ns]` timestamps) and/or
  `subtitles` (`.srt`) if present.
- Cross-reference: map what you *see* in a frame to what is *said* around that timestamp.

### 4. Answer the user
Produce exactly what they asked for — a bullet summary, an answer to a specific question,
a full transcript, or a timestamped list of key moments. Cite timestamps (e.g. "at ~0:45")
so the user can jump to the moment. Reason from BOTH the frames and the transcript.

## Important: transcription may be unavailable
Speech-to-text needs a model that downloads from the network. If the sandbox blocks the
model host, `transcript_status` will say `unavailable: ...`. That is expected and fine —
**do not treat it as a failure.** Fall back to:
1. `subtitles` (`.srt`) if the file had an embedded/downloaded subtitle track (no model needed).
2. Reading on-screen / burned-in captions directly **from the frames** — common in social clips.
Tell the user plainly that spoken audio wasn't transcribed and what you based the answer on.

## First-run setup
The processor needs these tools. Install once if missing (checks are cheap; skip if present):
```bash
which ffmpeg || apt-get install -y ffmpeg
pip install -q yt-dlp faster-whisper
```
- `ffmpeg` does all frame/audio/subtitle extraction (the Playwright-bundled ffmpeg is
  too limited — install the full one via apt).
- `faster-whisper` handles transcription **when** its model can be downloaded. To enable
  transcription in a network-restricted sandbox, either open the network policy to
  `huggingface.co`, or pre-seed a model into the faster-whisper cache.

## Network access for URL downloads + transcription
By default, Claude Code cloud environments run at **Trusted** network access — package
registries only. That blocks both YouTube-style downloads and the transcription model
download. Both need the environment's network access set to **Custom** with these
domains allowed (`claude.ai/code` → environment selector → edit environment →
**Network access**):
```
youtube.com
*.youtube.com
youtu.be
*.googlevideo.com
i.ytimg.com
*.ggpht.com
huggingface.co
*.huggingface.co
*.hf.co
```
Check **"Also include default list of common package managers"** — otherwise PyPI/apt
get blocked too and `pip install` / `apt-get install` in the setup script fail.

A setup script that installs everything once and pre-downloads the model (so every
session after the first starts ready, via the environment's disk cache) is:
```bash
#!/bin/bash
apt-get update -qq && apt-get install -y ffmpeg || true
pip install -q yt-dlp faster-whisper || true
python3 -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')" || true
exit 0
```
(Every line ends in `|| true` and the script exits 0 — a setup script that exits
non-zero blocks the session from starting.)

Even with the network open, YouTube sometimes shows a bot-check to cloud/datacenter
IPs ("Sign in to confirm you're not a bot"). `fetch_url()` already retries a few
internal player clients to work around this; if it still fails, use `--cookies`
(see above) or fall back to asking the user to upload the file.

## Scope notes
- Audio-only files (mp3/wav/…) skip frames and go straight to transcript.
- Frame width defaults to 640px to stay light; raise `--scale-width` for fine on-screen text.
