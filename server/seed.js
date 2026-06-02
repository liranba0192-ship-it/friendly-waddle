import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(__dirname, 'uploads');
mkdirSync(uploadsDir, { recursive: true });

// Generate a colorful gradient SVG so we have demo images without any network.
function makeImage(name, [c1, c2], label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <text x="50%" y="52%" font-family="Arial, sans-serif" font-size="64"
    fill="rgba(255,255,255,0.9)" text-anchor="middle" font-weight="bold">${label}</text>
</svg>`;
  writeFileSync(join(uploadsDir, name), svg);
  return `/uploads/${name}`;
}

console.log('Resetting database...');
db.exec(`DELETE FROM comments; DELETE FROM likes; DELETE FROM follows; DELETE FROM posts; DELETE FROM users;`);

const now = Date.now();
const pw = bcrypt.hashSync('password123', 10);

const usersData = [
  { username: 'alice', full_name: 'Alice Adventures', bio: '📷 Travel & coffee' },
  { username: 'bob', full_name: 'Bob the Builder', bio: 'Building cool things 🔨' },
  { username: 'carol', full_name: 'Carol Codes', bio: 'Dev by day, baker by night 🍞' },
];

const users = usersData.map((u, i) => {
  const user = { id: nanoid(), password: pw, avatar: null, created_at: now - i * 1000, ...u };
  db.prepare(
    `INSERT INTO users (id, username, password, full_name, bio, avatar, created_at)
     VALUES (@id, @username, @password, @full_name, @bio, @avatar, @created_at)`
  ).run(user);
  return user;
});

const palettes = [
  ['#ff6a00', '#ee0979'],
  ['#36d1dc', '#5b86e5'],
  ['#11998e', '#38ef7d'],
  ['#fc466b', '#3f5efb'],
  ['#c471f5', '#fa71cd'],
  ['#f7971e', '#ffd200'],
];
const captions = [
  'Golden hour vibes ✨',
  'Weekend project done! 🔨',
  'Fresh bake out of the oven 🍪',
  'City lights never get old 🌃',
  'Morning coffee ritual ☕',
  'Nature therapy 🌿',
];

const posts = [];
captions.forEach((caption, i) => {
  const author = users[i % users.length];
  const image = makeImage(`seed-${i}.svg`, palettes[i], `#${i + 1}`);
  const post = {
    id: nanoid(),
    user_id: author.id,
    image,
    caption,
    created_at: now - i * 3600 * 1000,
  };
  db.prepare(
    `INSERT INTO posts (id, user_id, image, caption, created_at)
     VALUES (@id, @user_id, @image, @caption, @created_at)`
  ).run(post);
  posts.push(post);
});

// Follows: everyone follows everyone else.
users.forEach((a) =>
  users.forEach((b) => {
    if (a.id !== b.id) {
      db.prepare(
        'INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)'
      ).run(a.id, b.id, now);
    }
  })
);

// Some likes and comments.
posts.forEach((post, i) => {
  users.forEach((u, j) => {
    if ((i + j) % 2 === 0) {
      db.prepare(
        'INSERT OR IGNORE INTO likes (post_id, user_id, created_at) VALUES (?, ?, ?)'
      ).run(post.id, u.id, now);
    }
  });
  const commenter = users[(i + 1) % users.length];
  db.prepare(
    'INSERT INTO comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(nanoid(), post.id, commenter.id, 'Love this! 😍', now + 1000);
});

console.log(`Seeded ${users.length} users and ${posts.length} posts.`);
console.log('Demo login → username: alice (or bob/carol), password: password123');
process.exit(0);
