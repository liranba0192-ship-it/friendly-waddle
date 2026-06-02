import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Auth() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ username: '', password: '', fullName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(form.username, form.password);
      else await register(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="card auth-card">
        <h1 className="brand auth-brand">Waddlegram</h1>
        <p className="muted auth-sub">
          {mode === 'login' ? 'Sign in to see photos from your friends.' : 'Create an account to get started.'}
        </p>

        <form onSubmit={submit} className="form">
          {mode === 'register' && (
            <input placeholder="Full name" value={form.fullName} onChange={update('fullName')} />
          )}
          <input placeholder="Username" value={form.username} onChange={update('username')} autoCapitalize="none" />
          <input type="password" placeholder="Password" value={form.password} onChange={update('password')} />
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <p className="muted switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>

        <p className="muted demo-hint">Demo: <code>alice</code> / <code>password123</code></p>
      </div>
    </div>
  );
}
