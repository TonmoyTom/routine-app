-- Routine — one-shot health check.
-- Paste the whole thing into the SQL editor and Run. Every row is a check
-- with an ok / FAIL verdict, so nothing has to be read between the lines.

-- counts a table that may not exist yet
create or replace function public.health_count(tbl text, cond text default 'true')
returns text language plpgsql as $fn$
declare n bigint;
begin
  if to_regclass('public.' || tbl) is null then
    return 'table missing';
  end if;
  execute format('select count(*) from public.%I where %s', tbl, cond) into n;
  return n::text;
end;
$fn$;

with checks as (

  -- extensions -------------------------------------------------------
  -- `check` is a reserved word in Postgres, so the column is `item`
  select 1 as ord, 'pg_cron installed' as item,
         case when exists (select 1 from pg_extension where extname = 'pg_cron')
              then 'ok' else 'FAIL — enable it in Database > Extensions' end as result

  union all
  select 2, 'pg_net installed',
         case when exists (select 1 from pg_extension where extname = 'pg_net')
              then 'ok' else 'FAIL — enable it in Database > Extensions' end

  -- vault ------------------------------------------------------------
  union all
  select 3, 'vault: project_url',
         coalesce((select decrypted_secret from vault.decrypted_secrets
                   where name = 'project_url'),
                  'FAIL — secret missing')

  union all
  select 4, 'vault: service_role_key',
         case when exists (select 1 from vault.decrypted_secrets
                           where name = 'service_role_key')
              then 'ok — set (value hidden)' else 'FAIL — secret missing' end

  -- cron jobs --------------------------------------------------------
  union all
  select 5, 'cron job scheduled',
         coalesce((select 'ok — ' || schedule from cron.job
                   where jobname = 'routine-dispatch' and active),
                  'FAIL — run 0002_cron.sql')

  union all
  select 6, 'last cron run',
         coalesce((select d.status || ' at ' || to_char(d.start_time, 'HH24:MI:SS')
                   from cron.job_run_details d
                   join cron.job j on j.jobid = d.jobid
                   where j.jobname = 'routine-dispatch'
                   order by d.start_time desc limit 1),
                  'no run yet — cron fires every 5 min')

  union all
  select 7, 'cron runs, last hour',
         (select count(*)::text from cron.job_run_details d
          join cron.job j on j.jobid = d.jobid
          where j.jobname = 'routine-dispatch'
            and d.start_time > now() - interval '1 hour')

  union all
  select 8, 'failed runs, last hour',
         coalesce((select count(*)::text || ' — ' ||
                          coalesce(max(d.return_message), '')
                   from cron.job_run_details d
                   join cron.job j on j.jobid = d.jobid
                   where j.jobname = 'routine-dispatch'
                     and d.status <> 'succeeded'
                     and d.start_time > now() - interval '1 hour'
                   having count(*) > 0),
                  '0')

  -- did the http call actually leave -----------------------------------
  union all
  select 9, 'last http response',
         coalesce((select 'HTTP ' || status_code || ' — ' ||
                          left(coalesce(content, ''), 120)
                   from net._http_response
                   order by created desc limit 1),
                  'no response yet — pg_net keeps these ~6 hours')

  -- app side -----------------------------------------------------------
  -- counted through a helper rather than inline, so a missing table reports
  -- as a failed check instead of aborting the whole query
  union all
  select 10, 'tables created',
         case when to_regclass('public.profiles') is not null
               and to_regclass('public.day_logs') is not null
               and to_regclass('public.push_subscriptions') is not null
               and to_regclass('public.notification_log') is not null
              then 'ok' else 'FAIL — run 0001_init.sql first' end

  union all
  select 11, 'profiles', public.health_count('profiles') || ' signed-in user(s)'

  union all
  select 12, 'push subscriptions',
         public.health_count('push_subscriptions') || ' device(s) subscribed'

  union all
  select 13, 'notifications sent, last 24h',
         public.health_count('notification_log', 'sent_at > now() - interval ''24 hours''')

  union all
  select 14, 'day logs', public.health_count('day_logs') || ' day(s) recorded'
)
select item, result from checks order by ord;
