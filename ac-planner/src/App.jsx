import { useState, useEffect } from 'react';
import { useAuth } from './auth/useAuth.js';
import Login from './auth/Login.jsx';
import ProjectList from './projects/ProjectList.jsx';
import Editor from './editor/Editor.jsx';
import { pullAll } from './db/projectRepo.js';

export default function App() {
  const { user, loading, signIn, signUp, signOut, cloudEnabled } = useAuth();
  const [openProjectId, setOpenProjectId] = useState(null);

  // סנכרון ראשוני מהענן בכניסה.
  useEffect(() => {
    if (user) pullAll(user.id);
  }, [user]);

  if (loading) {
    return <div className="page center" style={{ minHeight: '100%' }}>טוען…</div>;
  }

  if (cloudEnabled && !user) {
    return <Login onSignIn={signIn} onSignUp={signUp} />;
  }

  if (openProjectId) {
    return <Editor projectId={openProjectId} onBack={() => setOpenProjectId(null)} />;
  }

  return (
    <ProjectList
      user={user}
      cloudEnabled={cloudEnabled}
      onOpenProject={(p) => setOpenProjectId(p.id)}
      onSignOut={signOut}
    />
  );
}
