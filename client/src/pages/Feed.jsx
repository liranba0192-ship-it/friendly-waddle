import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import PostCard from '../components/PostCard.jsx';

export default function Feed() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.feed().then(({ posts }) => setPosts(posts)).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="center error">{error}</div>;
  if (!posts) return <div className="center muted">Loading feed…</div>;

  if (posts.length === 0) {
    return (
      <div className="center empty">
        <p>No posts yet.</p>
        <Link to="/create" className="btn btn-primary">Share your first photo</Link>
      </div>
    );
  }

  return (
    <div className="feed">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onDelete={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} />
      ))}
    </div>
  );
}
