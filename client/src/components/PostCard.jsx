import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { timeAgo } from '../helpers.js';
import Avatar from './Avatar.jsx';

export default function PostCard({ post, onDelete }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [comments, setComments] = useState(null); // null = not loaded yet
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    // Optimistic update.
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const res = next ? await api.like(post.id) : await api.unlike(post.id);
      setLiked(res.likedByMe);
      setLikeCount(res.likeCount);
    } catch {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }

  async function loadComments() {
    if (comments) return setComments(null); // toggle closed
    const { comments } = await api.comments(post.id);
    setComments(comments);
  }

  async function submitComment(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const { comment } = await api.addComment(post.id, body);
      setComments((c) => [...(c || []), comment]);
      setCommentCount((c) => c + 1);
      setDraft('');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this post?')) return;
    await api.deletePost(post.id);
    onDelete?.(post.id);
  }

  return (
    <article className="card post">
      <header className="post-head">
        <Link to={`/u/${post.author.username}`} className="post-author">
          <Avatar user={post.author} size={36} />
          <span className="username">{post.author.username}</span>
        </Link>
        <span className="muted post-time">{timeAgo(post.createdAt)}</span>
        {user?.id === post.author.id && (
          <button className="btn btn-ghost btn-sm danger" onClick={remove}>Delete</button>
        )}
      </header>

      <Link to={`/p/${post.id}`}>
        <img className="post-image" src={post.image} alt={post.caption || 'post'} />
      </Link>

      <div className="post-actions">
        <button className={`icon-btn ${liked ? 'liked' : ''}`} onClick={toggleLike} aria-label="Like">
          {liked ? '❤️' : '🤍'}
        </button>
        <button className="icon-btn" onClick={loadComments} aria-label="Comments">💬</button>
      </div>

      <div className="post-body">
        <strong>{likeCount} {likeCount === 1 ? 'like' : 'likes'}</strong>
        {post.caption && (
          <p className="caption">
            <Link to={`/u/${post.author.username}`} className="username">{post.author.username}</Link>{' '}
            {post.caption}
          </p>
        )}
        {commentCount > 0 && (
          <button className="link-btn muted" onClick={loadComments}>
            {comments ? 'Hide comments' : `View all ${commentCount} comments`}
          </button>
        )}

        {comments && (
          <ul className="comments">
            {comments.map((c) => (
              <li key={c.id}>
                <Link to={`/u/${c.author.username}`} className="username">{c.author.username}</Link>{' '}
                {c.body}
              </li>
            ))}
          </ul>
        )}

        <form className="comment-form" onSubmit={submitComment}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            maxLength={1000}
          />
          <button className="link-btn" disabled={busy || !draft.trim()}>Post</button>
        </form>
      </div>
    </article>
  );
}
