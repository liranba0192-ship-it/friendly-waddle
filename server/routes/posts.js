import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import db from '../db.js';
import { requireAuth, optionalAuth } from '../auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = Router();

// Builds the SELECT used everywhere a post is returned, including aggregated
// like/comment counts and whether the current viewer liked it.
function postQuery(viewerId) {
  return db.prepare(`
    SELECT
      p.id, p.image, p.caption, p.created_at,
      u.id AS author_id, u.username, u.full_name, u.avatar,
      (SELECT COUNT(*) FROM likes    l WHERE l.post_id = p.id) AS like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
      EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked_by_me
    FROM posts p
    JOIN users u ON u.id = p.user_id
  `);
}

function shapePost(row) {
  return {
    id: row.id,
    image: row.image,
    caption: row.caption,
    createdAt: row.created_at,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    likedByMe: !!row.liked_by_me,
    author: {
      id: row.author_id,
      username: row.username,
      fullName: row.full_name,
      avatar: row.avatar,
    },
  };
}

// GET /api/posts — global feed, newest first.
router.get('/', optionalAuth, (req, res) => {
  const viewerId = req.user?.id || '';
  const rows = db
    .prepare(`${postQuery(viewerId).source} ORDER BY p.created_at DESC LIMIT 100`)
    .all(viewerId);
  res.json({ posts: rows.map(shapePost) });
});

// GET /api/posts/:id
router.get('/:id', optionalAuth, (req, res) => {
  const viewerId = req.user?.id || '';
  const row = db
    .prepare(`${postQuery(viewerId).source} WHERE p.id = ?`)
    .get(viewerId, req.params.id);
  if (!row) return res.status(404).json({ error: 'post not found' });
  res.json({ post: shapePost(row) });
});

// POST /api/posts — create a post with an uploaded image.
router.post('/', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'an image file is required' });
  const post = {
    id: nanoid(),
    user_id: req.user.id,
    image: `/uploads/${req.file.filename}`,
    caption: (req.body.caption || '').slice(0, 2200),
    created_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO posts (id, user_id, image, caption, created_at)
     VALUES (@id, @user_id, @image, @caption, @created_at)`
  ).run(post);

  const row = db
    .prepare(`${postQuery(req.user.id).source} WHERE p.id = ?`)
    .get(req.user.id, post.id);
  res.status(201).json({ post: shapePost(row) });
});

// DELETE /api/posts/:id — only the author may delete.
router.delete('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'post not found' });
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: 'you can only delete your own posts' });
  }
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/posts/:id/like  &  DELETE .../like — toggle a like.
router.post('/:id/like', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'post not found' });
  db.prepare(
    `INSERT OR IGNORE INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)`
  ).run(req.params.id, req.user.id, Date.now());
  const { c } = db
    .prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?')
    .get(req.params.id);
  res.json({ likeCount: c, likedByMe: true });
});

router.delete('/:id/like', requireAuth, (req, res) => {
  db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(
    req.params.id,
    req.user.id
  );
  const { c } = db
    .prepare('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?')
    .get(req.params.id);
  res.json({ likeCount: c, likedByMe: false });
});

// GET /api/posts/:id/comments
router.get('/:id/comments', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.body, c.created_at, u.id AS user_id, u.username, u.avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at ASC`
    )
    .all(req.params.id);
  res.json({
    comments: rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      author: { id: r.user_id, username: r.username, avatar: r.avatar },
    })),
  });
});

// POST /api/posts/:id/comments
router.post('/:id/comments', requireAuth, (req, res) => {
  const body = (req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'comment body is required' });
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'post not found' });

  const comment = {
    id: nanoid(),
    post_id: req.params.id,
    user_id: req.user.id,
    body: body.slice(0, 1000),
    created_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO comments (id, post_id, user_id, body, created_at)
     VALUES (@id, @post_id, @user_id, @body, @created_at)`
  ).run(comment);

  const u = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(req.user.id);
  res.status(201).json({
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      author: { id: req.user.id, username: u.username, avatar: u.avatar },
    },
  });
});

export default router;
