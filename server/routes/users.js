import { Router } from 'express';
import db from '../db.js';
import { requireAuth, optionalAuth } from '../auth.js';

const router = Router();

// GET /api/users/:username — profile with counts + posts.
router.get('/:username', optionalAuth, (req, res) => {
  const viewerId = req.user?.id || '';
  const user = db
    .prepare('SELECT id, username, full_name, bio, avatar, created_at FROM users WHERE username = ?')
    .get(req.params.username);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const counts = {
    posts: db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(user.id).c,
    followers: db.prepare('SELECT COUNT(*) AS c FROM follows WHERE following_id = ?').get(user.id).c,
    following: db.prepare('SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?').get(user.id).c,
  };
  const isFollowing = viewerId
    ? !!db
        .prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?')
        .get(viewerId, user.id)
    : false;

  const posts = db
    .prepare(
      `SELECT p.id, p.image, p.caption, p.created_at,
              (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
       FROM posts p WHERE p.user_id = ? ORDER BY p.created_at DESC`
    )
    .all(user.id)
    .map((p) => ({
      id: p.id,
      image: p.image,
      caption: p.caption,
      createdAt: p.created_at,
      likeCount: p.like_count,
      commentCount: p.comment_count,
    }));

  res.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      bio: user.bio,
      avatar: user.avatar,
      createdAt: user.created_at,
    },
    counts,
    isFollowing,
    isMe: viewerId === user.id,
    posts,
  });
});

// PATCH /api/users/me — update own profile (full name + bio).
router.patch('/me', requireAuth, (req, res) => {
  const { fullName, bio } = req.body || {};
  db.prepare('UPDATE users SET full_name = ?, bio = ? WHERE id = ?').run(
    (fullName ?? '').slice(0, 80),
    (bio ?? '').slice(0, 200),
    req.user.id
  );
  const user = db
    .prepare('SELECT id, username, full_name, bio, avatar, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      bio: user.bio,
      avatar: user.avatar,
      createdAt: user.created_at,
    },
  });
});

// POST /api/users/:username/follow  &  DELETE — toggle following.
router.post('/:username/follow', requireAuth, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'user not found' });
  if (target.id === req.user.id) {
    return res.status(400).json({ error: "you can't follow yourself" });
  }
  db.prepare(
    'INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)'
  ).run(req.user.id, target.id, Date.now());
  res.json({ isFollowing: true });
});

router.delete('/:username/follow', requireAuth, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'user not found' });
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(
    req.user.id,
    target.id
  );
  res.json({ isFollowing: false });
});

export default router;
