import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from './Avatar.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">Waddlegram</Link>
        <nav className="nav-links">
          <Link to="/create" className="btn btn-primary btn-sm">+ New post</Link>
          <Link to={`/u/${user.username}`} className="nav-avatar" title="Profile">
            <Avatar user={user} size={32} />
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
