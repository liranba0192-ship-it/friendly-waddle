// Tiny fetch wrapper that attaches the JWT and parses JSON / errors.
const TOKEN_KEY = 'waddlegram_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path, { method = 'GET', body, isForm } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: () => request('/auth/me'),

  feed: () => request('/posts'),
  post: (id) => request(`/posts/${id}`),
  createPost: (formData) => request('/posts', { method: 'POST', body: formData, isForm: true }),
  deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  like: (id) => request(`/posts/${id}/like`, { method: 'POST' }),
  unlike: (id) => request(`/posts/${id}/like`, { method: 'DELETE' }),
  comments: (id) => request(`/posts/${id}/comments`),
  addComment: (id, body) => request(`/posts/${id}/comments`, { method: 'POST', body: { body } }),

  profile: (username) => request(`/users/${username}`),
  updateProfile: (body) => request('/users/me', { method: 'PATCH', body }),
  follow: (username) => request(`/users/${username}/follow`, { method: 'POST' }),
  unfollow: (username) => request(`/users/${username}/follow`, { method: 'DELETE' }),
};
