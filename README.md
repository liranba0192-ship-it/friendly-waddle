# 🦆 Waddlegram

An Instagram-like photo-sharing app — full-stack, runs locally with no external services.

![stack](https://img.shields.io/badge/stack-React%20%2B%20Express%20%2B%20SQLite-blue)

## Features

- 🔐 **Auth** — register / login with hashed passwords (bcrypt) + JWT sessions
- 📸 **Posts** — upload a photo with a caption, delete your own posts
- 📰 **Feed** — chronological global feed of all posts
- ❤️ **Likes** — like / unlike with optimistic UI and live counts
- 💬 **Comments** — view and add comments inline
- 👤 **Profiles** — bio, post grid, follower/following counts, editable own profile
- 🔗 **Follow / unfollow** other users
- 📱 Responsive, Instagram-inspired UI

## Tech stack

| Layer    | Tech                                            |
| -------- | ----------------------------------------------- |
| Frontend | React 18, React Router, Vite                    |
| Backend  | Node + Express, JWT, Multer (uploads)           |
| Database | SQLite (better-sqlite3)                          |

## Quick start

```bash
# 1. Install everything (root + server + client)
npm run install:all

# 2. Seed demo users and posts (optional but recommended)
npm run seed

# 3. Run backend (:4000) and frontend (:5173) together
npm run dev
```

Then open **http://localhost:5173**.

**Demo account:** `alice` / `password123` (also `bob`, `carol`).

## Production / single-server mode

```bash
npm run build   # builds the client into client/dist
npm start       # Express serves the API + the built frontend on :4000
```

Open **http://localhost:4000**.

## Project structure

```
friendly-waddle/
├── server/                 # Express API + SQLite
│   ├── index.js            # app entry, static + SPA fallback
│   ├── db.js               # schema & connection
│   ├── auth.js             # JWT helpers + middleware
│   ├── seed.js             # demo data generator
│   └── routes/             # auth, posts, users
└── client/                 # React + Vite SPA
    └── src/
        ├── pages/          # Auth, Feed, Create, Profile, PostPage
        ├── components/     # Navbar, PostCard, Avatar
        ├── context/        # AuthContext
        └── api.js          # fetch wrapper
```

## API overview

| Method | Endpoint                       | Description                 |
| ------ | ------------------------------ | --------------------------- |
| POST   | `/api/auth/register`           | Create account              |
| POST   | `/api/auth/login`              | Log in                      |
| GET    | `/api/auth/me`                 | Current user                |
| GET    | `/api/posts`                   | Feed                        |
| POST   | `/api/posts`                   | Create post (multipart)     |
| DELETE | `/api/posts/:id`               | Delete own post             |
| POST   | `/api/posts/:id/like`          | Like (DELETE to unlike)     |
| GET    | `/api/posts/:id/comments`      | List comments               |
| POST   | `/api/posts/:id/comments`      | Add comment                 |
| GET    | `/api/users/:username`         | Profile + posts             |
| PATCH  | `/api/users/me`                | Update own profile          |
| POST   | `/api/users/:username/follow`  | Follow (DELETE to unfollow) |

## Notes

- Uploaded images are stored on disk under `server/uploads/` and the SQLite
  database under `server/data/` — both are git-ignored.
- Set `JWT_SECRET` and `PORT` via environment variables in production.
