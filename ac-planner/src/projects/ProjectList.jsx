import { useState } from 'react';
import { useProjects } from '../hooks/useProjects.js';
import { createProject, updateProject, deleteProject } from '../db/projectRepo.js';
import ProjectCard from './ProjectCard.jsx';
import NewProjectDialog from './NewProjectDialog.jsx';

export default function ProjectList({ user, onOpenProject, onSignOut, cloudEnabled }) {
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const projects = useProjects(user.id, query) || [];

  async function handleCreate(fields) {
    const p = await createProject(user.id, fields);
    setShowNew(false);
    onOpenProject(p);
  }

  async function handleRename(project) {
    const name = window.prompt('שם הלקוח:', project.client_name);
    if (name && name.trim()) await updateProject(project.id, { client_name: name.trim() });
  }

  async function handleDelete(project) {
    if (window.confirm(`למחוק את הפרויקט של "${project.client_name}"? פעולה זו אינה הפיכה.`)) {
      await deleteProject(project.id);
    }
  }

  return (
    <>
      <header className="app-header">
        <span className="logo">תכנון מיזוג</span>
        <div className="spacer" />
        {cloudEnabled && (
          <button className="ghost" onClick={onSignOut} title={user.email || ''}>יציאה</button>
        )}
      </header>

      <div className="page">
        <div className="row">
          <input
            type="text"
            placeholder="חיפוש לפי לקוח או כתובת…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="primary" onClick={() => setShowNew(true)}>+ פרויקט</button>
        </div>

        {projects.length === 0 ? (
          <div className="empty">
            {query ? 'לא נמצאו פרויקטים.' : 'אין עדיין פרויקטים. צור פרויקט ראשון עם הכפתור “+ פרויקט”.'}
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={onOpenProject}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showNew && <NewProjectDialog onCreate={handleCreate} onClose={() => setShowNew(false)} />}
    </>
  );
}
