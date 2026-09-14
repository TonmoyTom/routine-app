-- Routine — schema, row level security, realtime, notification dispatch.
-- Safe to run more than once.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- a row appears the moment someone signs up, so the dispatcher can see them
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------- day logs

create table if not exists public.day_logs (
  user_id    uuid not null references auth.users on delete cascade,
  log_date   date not null,
  -- three a day is the target; a fourth is refused here as well as in the UI,
  -- because an overworked pelvic floor becomes hypertonic
  sessions   smallint not null default 0 check (sessions between 0 and 3),
  med        boolean not null default false,
  leg        boolean not null default false,
  cardio     jsonb,
  breaks     int[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

alter table public.day_logs enable row level security;

drop policy if exists "own logs" on public.day_logs;
create policy "own logs" on public.day_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists day_logs_user_date
  on public.day_logs (user_id, log_date desc);

-- ------------------------------------------------------ push subscriptions

create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------- notification log

-- the unique key is the dedupe: overlapping cron ticks cannot double-send
create table if not exists public.notification_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users on delete cascade,
  kind          text not null,
  scheduled_for timestamptz not null,
  sent_at       timestamptz not null default now(),
  unique (user_id, kind, scheduled_for)
);

alter table public.notification_log enable row level security;

drop policy if exists "own notification log" on public.notification_log;
create policy "own notification log" on public.notification_log
  for select using (auth.uid() = user_id);

create index if not exists notification_log_recent
  on public.notification_log (user_id, sent_at desc);

create or replace function public.prune_notification_log()
returns void language sql security definer set search_path = '' as $$
  delete from public.notification_log where sent_at < now() - interval '30 days';
$$;

-- --------------------------------------------------------------- realtime

-- Live sync between devices. RLS applies to realtime too, so a client only
-- ever receives rows it could already have read.
-- `add table` errors if the table is already published, hence the guard.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'day_logs'
  ) then
    alter publication supabase_realtime add table public.day_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- realtime needs the old row on updates to evaluate the policy
alter table public.day_logs replica identity full;
alter table public.profiles replica identity full;
