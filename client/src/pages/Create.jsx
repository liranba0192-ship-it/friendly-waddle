import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Create() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) return setError('Please choose an image.');
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('caption', caption);
      const { post } = await api.createPost(fd);
      navigate(`/p/${post.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card create">
      <h2>New post</h2>
      <form onSubmit={submit} className="form">
        <label className={`dropzone ${preview ? 'has-preview' : ''}`}>
          {preview ? (
            <img src={preview} alt="preview" />
          ) : (
            <span className="muted">📷 Click to choose a photo</span>
          )}
          <input type="file" accept="image/*" onChange={pick} hidden />
        </label>

        <textarea
          placeholder="Write a caption…"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={2200}
          rows={3}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sharing…' : 'Share'}</button>
      </form>
    </div>
  );
}
