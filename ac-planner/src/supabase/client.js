// Supabase client — אופציונלי. אם אין משתני סביבה, האפליקציה רצה במצב מקומי בלבד.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// האם הענן מוגדר? אם לא — נעבוד מקומית בלבד (Dexie), בלי התחברות וסנכרון.
export const cloudEnabled = Boolean(url && anonKey);

export const supabase = cloudEnabled ? createClient(url, anonKey) : null;
