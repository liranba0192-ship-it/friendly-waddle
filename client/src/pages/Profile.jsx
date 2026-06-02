import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user, setUser } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: '', bio: '' });

  function load() {
    setData(null);
    api.profile(username).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [username]);

  async function toggleFollow() {
    const fn = data.isFollowing ? api.unfollow : api.follow;
    const { isFollowing } = await fn(username);
    setData((d) => ({
      ...d,
      isFollowing,
      counts: { ...d.counts, followers: d.counts.followers + (isFollowing ? 1 : -1) },
    }));
  }

  function startEdit() {
    setForm({ fullName: data.user.fullName, bio: data.user.bio });
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    const { user: updated } = await api.updateProfile(form);
    setUser({ ...user, full_name: updated.fullName, bio: updated.bio });
    setData((d) => ({ ...d, user: { ...d.user, fullName: updated.fullName, bio: updated.bio } }));
    setEditing(false);
  }

  if (error) return <div className="center error">{error}</div>;
  if (!data) return <div className="center muted">Loading…</div>;

  const { user: profile, counts, isFollowing, isMe, posts } = data;

  return (
    <div className="profile">
      <header className="profile-head card">
        <Avatar user={profile} size={88} />
        <div className="profile-meta">
          <div className="profile-top">
            <h2>{profile.username}</h2>
            {isMe ? (
              <button className="btn btn-ghost btn-sm" onClick={startEdit}>Edit profile</button>
            ) : (
              <button className={`btn btn-sm ${isFollowing ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleFollow}>
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
          <div className="stats">
            <span><strong>{counts.posts}</strong> posts</span>
            <span><strong>{counts.followers}</strong> followers</span>
            <span><strong>{counts.following}</strong> following</span>
          </div>
          {profile.fullName && <div className="full-name">{profile.fullName}</div>}
          {profile.bio && <div className="bio">{profile.bio}</div>}
        </div>
      </header>

      {editing && (
        <form className="card form edit-form" onSubmit={saveEdit}>
          <input placeholder="Full name" value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })} maxLength={80} />
          <textarea placeholder="Bio" value={form.bio} rows={2}
            onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={200} />
          <div className="row">
            <button className="btn btn-primary btn-sm">Save</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}

      {posts.length === 0 ? (
        <div className="center empty muted">No posts yet.</div>
      ) : (
        <div className="grid">
          {posts.map((p) => (
            <Link key={p.id} to={`/p/${p.id}`} className="grid-item">
              <img src={p.image} alt={p.caption || 'post'} />
              <div className="grid-overlay">❤️ {p.likeCount} · 💬 {p.commentCount}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
