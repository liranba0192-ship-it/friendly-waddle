// כרטיס פרויקט ברשימה.
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export default function ProjectCard({ project, onOpen, onRename, onDelete }) {
  return (
    <div className="card project-card" onClick={() => onOpen(project)}>
      <h3>{project.client_name}</h3>
      {project.address && <div className="meta">{project.address}</div>}
      <div className="meta">עודכן: {formatDate(project.updated_at)}</div>
      <div className="actions" onClick={(e) => e.stopPropagation()}>
        <button className="ghost" onClick={() => onRename(project)}>שינוי שם</button>
        <div className="spacer" />
        <button className="ghost danger" onClick={() => onDelete(project)}>מחיקה</button>
      </div>
    </div>
  );
}
