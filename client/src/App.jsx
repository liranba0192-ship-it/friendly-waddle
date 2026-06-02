import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import Feed from './pages/Feed.jsx';
import Auth from './pages/Auth.jsx';
import Create from './pages/Create.jsx';
import Profile from './pages/Profile.jsx';
import PostPage from './pages/PostPage.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <>
      {user && <Navbar />}
      <main className="container">
        <Routes>
          <Route
            path="/login"
            element={loading ? null : user ? <Navigate to="/" replace /> : <Auth />}
          />
          <Route path="/" element={<Protected><Feed /></Protected>} />
          <Route path="/create" element={<Protected><Create /></Protected>} />
          <Route path="/p/:id" element={<Protected><PostPage /></Protected>} />
          <Route path="/u/:username" element={<Protected><Profile /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
