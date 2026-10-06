-- איפוס: מוחק את כל המשתמשים והנתונים שלהם, חוץ מהמנהלים. בלתי הפיך!
-- מריצים שלב אחרי שלב, לפי הסדר.

-- 1. תצוגה מקדימה (לא משנה כלום): מי יימחק ומי יישאר. ודא שרק אתה מופיע עם stays_admin = true.
select u.email, (a.user_id is not null) as stays_admin
from auth.users u left join public.admins a on a.user_id = u.id
order by stays_admin desc, u.created_at;

-- 2. גיבוי (ידני): Table Editor ← user_data ← Export CSV.

-- 3. המחיקה. נעצרת בשגיאה אם אין אף מנהל, כדי שלא תימחק גם אתה.
do $$
begin
  if (select count(*) from public.admins) = 0 then
    raise exception 'No admins found - aborting so nobody locks themselves out';
  end if;
  delete from public.user_data where user_id not in (select user_id from public.admins);
  delete from public.subscriptions where user_id not in (select user_id from public.admins);
  delete from auth.users where id not in (select user_id from public.admins);
end $$;

-- 4. אימות: אמור להחזיר רק את מספר המנהלים.
select (select count(*) from auth.users) as users,
       (select count(*) from public.subscriptions) as subscriptions,
       (select count(*) from public.user_data) as user_data,
       (select count(*) from public.admins) as admins;

-- 5. המנהל נשאר פעיל לתמיד (לא ננעל החוצה).
update public.subscriptions set status = 'active', paid_until = timestamptz '2099-01-01'
where user_id in (select user_id from public.admins);
