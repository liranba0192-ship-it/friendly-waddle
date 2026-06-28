// שכבת גישה לנתוני פרויקט — Dexie כמקור אמת מקומי, עם דחיפה אופציונלית לענן.
import { db } from './db.js';
import { newId } from '../lib/id.js';
import * as sync from './sync.js';

function now() {
  return Date.now();
}

export async function listProjects(userId) {
  const all = await db.projects.where('user_id').equals(userId).toArray();
  return all.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
}

export async function getProject(id) {
  return db.projects.get(id);
}

export async function createProject(userId, { client_name, address = '', date = '' }) {
  const project = {
    id: newId(),
    user_id: userId,
    client_name: client_name?.trim() || 'לקוח חדש',
    address: address.trim(),
    date,
    pixels_per_meter: null,
    routes: [],
    image_path: null,
    updated_at: now(),
  };
  await db.projects.put(project);
  sync.pushProject(project); // fire-and-forget
  return project;
}

export async function updateProject(id, patch) {
  const current = await db.projects.get(id);
  if (!current) return null;
  const updated = { ...current, ...patch, updated_at: now() };
  await db.projects.put(updated);
  sync.pushProject(updated);
  return updated;
}

export async function deleteProject(id) {
  const project = await db.projects.get(id);
  await db.projects.delete(id);
  await db.images.delete(id);
  if (project) sync.deleteProjectCloud(id, project.user_id);
}

// ---- תמונות ----

export async function saveImage(project, blob) {
  await db.images.put({ projectId: project.id, blob });
  const path = await sync.uploadImage(project, blob);
  await updateProject(project.id, { image_path: path || project.image_path || `local:${project.id}` });
  return path;
}

// מחזיר Blob של תמונת הפרויקט (מקומי, ואם אין — מהענן).
export async function getImageBlob(project) {
  const local = await db.images.get(project.id);
  if (local?.blob) return local.blob;
  if (project.image_path && !project.image_path.startsWith('local:')) {
    const blob = await sync.downloadImage(project.image_path);
    if (blob) {
      await db.images.put({ projectId: project.id, blob });
      return blob;
    }
  }
  return null;
}

// סנכרון ראשוני בכניסה.
export async function pullAll(userId) {
  return sync.pullAll(userId);
}
