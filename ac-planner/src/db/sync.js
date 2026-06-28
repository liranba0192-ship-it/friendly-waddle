// סנכרון ענן (Supabase) — אופציונלי. אופליין-פירסט: Dexie הוא מקור האמת המקומי,
// וכאן דוחפים/מושכים לענן כש-cloudEnabled. סנכרון last-write-wins לפי updated_at.
import { supabase, cloudEnabled } from '../supabase/client.js';
import { db } from './db.js';

const BUCKET = 'plan-images';

// ---- פרויקטים ----

// דוחף פרויקט יחיד לענן (fire-and-forget מהקריאה).
export async function pushProject(project) {
  if (!cloudEnabled || !project || project.user_id === 'local') return;
  const { id, user_id, client_name, address, date, pixels_per_meter, routes, image_path, updated_at } = project;
  const { error } = await supabase
    .from('projects')
    .upsert({ id, user_id, client_name, address, date, pixels_per_meter, routes, image_path, updated_at });
  if (error) console.warn('pushProject failed:', error.message);
}

export async function deleteProjectCloud(id, userId) {
  if (!cloudEnabled || userId === 'local') return;
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) console.warn('deleteProjectCloud failed:', error.message);
}

// מושך את כל הפרויקטים של המשתמש מהענן וממזג ל-Dexie (last-write-wins).
export async function pullAll(userId) {
  if (!cloudEnabled || !userId || userId === 'local') return;
  const { data, error } = await supabase.from('projects').select('*').eq('user_id', userId);
  if (error) {
    console.warn('pullAll failed:', error.message);
    return;
  }
  for (const remote of data) {
    const local = await db.projects.get(remote.id);
    // last-write-wins: השורה החדשה יותר מנצחת
    if (!local || (remote.updated_at || 0) >= (local.updated_at || 0)) {
      await db.projects.put(remote);
    }
  }
}

// ---- תמונות ----

export async function uploadImage(project, blob) {
  if (!cloudEnabled || project.user_id === 'local') return null;
  const path = `${project.user_id}/${project.id}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
  if (error) {
    console.warn('uploadImage failed:', error.message);
    return null;
  }
  return path;
}

// מוריד תמונה מהענן (אם אין מקומית). מחזיר Blob או null.
export async function downloadImage(imagePath) {
  if (!cloudEnabled || !imagePath) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(imagePath);
  if (error) {
    console.warn('downloadImage failed:', error.message);
    return null;
  }
  return data;
}

export { cloudEnabled };
