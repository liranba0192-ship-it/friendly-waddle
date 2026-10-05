-- מנויים וניהול חברים — מריצים ב-Supabase: SQL Editor → New query → Run.
-- בטוח להריץ שוב (idempotent). קראו את ההערות לפני ההרצה.

-- 1. מנהלים: מוסיפים את המשתמש שלכם אחרי שנרשמתם באפליקציה:
--    insert into public.admins (user_id) select id from auth.users where email = 'YOUR@EMAIL';
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admin reads self" on public.admins;
create policy "admin reads self" on public.admins for select using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 2. מנויים
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  status text not null default 'trial' check (status in ('trial', 'active', 'blocked')),
  paid_until timestamptz not null default (now() + interval '14 days'),
  note text,
  consented_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admin writes subscriptions" on public.subscriptions;
create policy "admin writes subscriptions" on public.subscriptions for all
  using (public.is_admin()) with check (public.is_admin());
-- משתמש רגיל לא יכול לכתוב לטבלה (אין לו policy לכתיבה).

-- 3. משתמש חדש מקבל ניסיון של 14 יום (עדכנו את הערך גם ב-app/js/config.js)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, email, status, paid_until, consented_at)
  values (
    new.id, new.email, 'trial', now() + interval '14 days',
    nullif(new.raw_user_meta_data ->> 'consented_at', '')::timestamptz
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. משתמשים קיימים (החברים שכבר מחוברים): מנוי פעיל עד התאריך שתבחרו — שנו אותו!
insert into public.subscriptions (user_id, email, status, paid_until)
select id, email, 'active', timestamptz '2027-01-01'
from auth.users
on conflict (user_id) do nothing;

-- 5. פעולות מנהל
create or replace function public.admin_extend(target uuid, days int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.subscriptions
     set status = 'active', paid_until = greatest(now(), paid_until) + make_interval(days => days)
   where user_id = target;
end;
$$;

create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if target = auth.uid() then raise exception 'cannot delete yourself'; end if;
  delete from public.user_data where user_id = target;
  delete from auth.users where id = target;
end;
$$;

revoke all on function public.admin_extend(uuid, int) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_extend(uuid, int) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- 6. אכיפה בענן — מריצים רק כשמוכנים להפעיל תשלום (אותו רגע שבו billing.enforce=true).
--    מי שהמנוי שלו פג לא יוכל יותר לסנכרן או לגבות. מדיניות "restrictive" מתווספת
--    למדיניות הקיימת ב-user_data בלי לשנות אותה. לביטול: drop policy "require active subscription" on public.user_data;
-- create or replace function public.has_access() returns boolean
-- language sql stable security definer set search_path = public as $$
--   select exists (select 1 from public.subscriptions
--     where user_id = auth.uid() and status <> 'blocked' and paid_until > now());
-- $$;
-- create policy "require active subscription" on public.user_data
--   as restrictive for all using (public.has_access()) with check (public.has_access());
