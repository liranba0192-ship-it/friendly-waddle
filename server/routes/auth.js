import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import db from '../db.js';
import { signToken, requireAuth } from '../auth.js';

const router = Router();

function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

router.post('/register', (req, res) => {
  const { username, password, fullName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    return res.status(400).json({
      error: 'username must be 3-30 chars (letters, numbers, _ or .)',
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'username already taken' });

  const user = {
    id: nanoid(),
    username,
    password: bcrypt.hashSync(password, 10),
    full_name: fullName || '',
    bio: '',
    avatar: null,
    created_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO users (id, username, password, full_name, bio, avatar, created_at)
     VALUES (@id, @username, @password, @full_name, @bio, @avatar, @created_at)`
  ).run(user);

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json({ user: publicUser(user) });
});

export default router;
