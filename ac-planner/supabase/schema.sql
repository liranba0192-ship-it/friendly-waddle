-- הרצה ב-Supabase: SQL Editor → הדבק → Run.
-- יוצר את טבלת הפרויקטים, מדיניות RLS לבידוד נתונים, ו-bucket לתמונות.

-- ===== טבלת פרויקטים =====
create table if not exists public.projects (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_name text not null default 'לקוח חדש',
  address text default '',
  date text default '',
  pixels_per_meter double precision,
  routes jsonb not null default '[]'::jsonb,
  image_path text,
  updated_at bigint not null default 0
);

create index if not exists projects_user_id_idx on public.projects (user_id);

-- ===== RLS: כל משתמש רואה/עורך רק את הפרויקטים שלו =====
alter table public.projects enable row level security;

drop policy if exists "own projects - select" on public.projects;
create policy "own projects - select" on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists "own projects - insert" on public.projects;
create policy "own projects - insert" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "own projects - update" on public.projects;
create policy "own projects - update" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own projects - delete" on public.projects;
create policy "own projects - delete" on public.projects
  for delete using (auth.uid() = user_id);

-- ===== Storage: bucket לתמונות תוכנית =====
insert into storage.buckets (id, name, public)
values ('plan-images', 'plan-images', false)
on conflict (id) do nothing;

-- מדיניות: כל משתמש ניגש רק לתיקייה שלו ({user_id}/...)
drop policy if exists "plan-images own - select" on storage.objects;
create policy "plan-images own - select" on storage.objects
  for select using (
    bucket_id = 'plan-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "plan-images own - insert" on storage.objects;
create policy "plan-images own - insert" on storage.objects
  for insert with check (
    bucket_id = 'plan-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "plan-images own - update" on storage.objects;
create policy "plan-images own - update" on storage.objects
  for update using (
    bucket_id = 'plan-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "plan-images own - delete" on storage.objects;
create policy "plan-images own - delete" on storage.objects
  for delete using (
    bucket_id = 'plan-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
