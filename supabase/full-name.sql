-- שם מלא לכל משתמש — מריצים פעם אחת. בטוח להרצה חוזרת.
alter table public.subscriptions add column if not exists full_name text;

-- משתמש חדש: השם נלקח מהנתונים שנשלחים בהרשמה
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, email, status, paid_until, consented_at, full_name)
  values (
    new.id, new.email, 'trial', now() + interval '7 days',
    nullif(new.raw_user_meta_data ->> 'consented_at', '')::timestamptz,
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 60), '')
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- משתמש מעדכן רק את השם של עצמו (הוא לא יכול לשנות תוקף או סטטוס)
create or replace function public.set_my_full_name(name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.subscriptions set full_name = nullif(left(trim(name), 60), '') where user_id = auth.uid();
end;
$$;
revoke all on function public.set_my_full_name(text) from public, anon;
grant execute on function public.set_my_full_name(text) to authenticated;
