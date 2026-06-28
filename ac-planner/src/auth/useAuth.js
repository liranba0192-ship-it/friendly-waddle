// ניהול התחברות. שני מצבים:
//  - cloud (Supabase מוגדר): התחברות אמיתית, כל מתקין רואה רק את שלו.
//  - local (Supabase לא מוגדר): משתמש מקומי קבוע, בלי מסך התחברות.
import { useEffect, useState, useCallback } from 'react';
import { supabase, cloudEnabled } from '../supabase/client.js';

const LOCAL_USER = { id: 'local', email: null, local: true };

export function useAuth() {
  // במצב מקומי — מחוברים מיד כמשתמש המקומי.
  const [user, setUser] = useState(cloudEnabled ? null : LOCAL_USER);
  const [loading, setLoading] = useState(cloudEnabled);

  useEffect(() => {
    if (!cloudEnabled) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!cloudEnabled) return { error: null };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email, password) => {
    if (!cloudEnabled) return { error: null };
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    if (!cloudEnabled) return;
    await supabase.auth.signOut();
  }, []);

  return { user, loading, signIn, signUp, signOut, cloudEnabled };
}
