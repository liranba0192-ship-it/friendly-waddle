import { useState } from 'react';

// מסך התחברות/הרשמה (מוצג רק כש-Supabase מוגדר).
export default function Login({ onSignIn, onSignUp }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    const fn = mode === 'signin' ? onSignIn : onSignUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error.message || 'אירעה שגיאה. בדוק את הפרטים ונסה שוב.');
    } else if (mode === 'signup') {
      setInfo('נשלח אליך אימייל לאישור (אם נדרש). אפשר להתחבר.');
      setMode('signin');
    }
  }

  return (
    <div className="page center" style={{ minHeight: '100%' }}>
      <form className="card col" style={{ width: '100%', maxWidth: 380, padding: 24 }} onSubmit={submit}>
        <div className="logo center" style={{ fontSize: 26 }}>תכנון מיזוג</div>
        <p className="muted center" style={{ marginTop: -4 }}>
          {mode === 'signin' ? 'התחברות לחשבון' : 'יצירת חשבון חדש'}
        </p>
        <div>
          <label>אימייל</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
        </div>
        <div>
          <label>סיסמה</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        {info && <div style={{ color: 'var(--drain)' }}>{info}</div>}
        <button className="primary big full" type="submit" disabled={busy}>
          {busy ? 'רגע…' : mode === 'signin' ? 'התחברות' : 'הרשמה'}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError('');
            setInfo('');
          }}
        >
          {mode === 'signin' ? 'אין לך חשבון? הרשמה' : 'יש לך חשבון? התחברות'}
        </button>
      </form>
    </div>
  );
}
