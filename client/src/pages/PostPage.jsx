import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import PostCard from '../components/PostCard.jsx';

export default function PostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.post(id).then(({ post }) => setPost(post)).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="center error">{error}</div>;
  if (!post) return <div className="center muted">Loading…</div>;

  return (
    <div className="feed">
      <PostCard post={post} onDelete={() => navigate('/')} />
    </div>
  );
}
