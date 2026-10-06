-- שבוע ניסיון למשתמשים חדשים (במקום 14 יום) — מריצים אחרי subscriptions.sql.
-- בטוח להרצה חוזרת. לא נוגע במשתמשים קיימים.

alter table public.subscriptions
  alter column paid_until set default (now() + interval '7 days');

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, email, status, paid_until, consented_at)
  values (
    new.id, new.email, 'trial', now() + interval '7 days',
    nullif(new.raw_user_meta_data ->> 'consented_at', '')::timestamptz
  ) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- אישור משתמש כשילם: מנוי פעיל לשנה מהיום (או מסוף התקופה הנוכחית, מה שמאוחר יותר)
create or replace function public.admin_approve(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.subscriptions
     set status = 'active', paid_until = greatest(now(), paid_until) + interval '365 days'
   where user_id = target;
end;
$$;
revoke all on function public.admin_approve(uuid) from public, anon;
grant execute on function public.admin_approve(uuid) to authenticated;
