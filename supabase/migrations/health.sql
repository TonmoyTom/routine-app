-- Routine — one-shot health check.
-- Paste the whole thing into the SQL editor and Run. Every row is a check
-- with an ok / FAIL verdict, so nothing has to be read between the lines.

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

  -- app side ------------------------------------------------------------
  union all
  select 10, 'profiles',
         (select count(*)::text || ' signed-in user(s)' from public.profiles)

  union all
  select 11, 'push subscriptions',
         (select count(*)::text || ' device(s) subscribed'
          from public.push_subscriptions)

  union all
  select 12, 'notifications sent, last 24h',
         (select count(*)::text from public.notification_log
          where sent_at > now() - interval '24 hours')

  union all
  select 13, 'day logs',
         (select count(*)::text || ' day(s) recorded' from public.day_logs)
)
select item, result from checks order by ord;