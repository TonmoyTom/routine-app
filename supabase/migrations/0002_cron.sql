-- Notification dispatch. Run this ONLY after:
--   1. Database > Extensions: enable `pg_cron` and `pg_net`
--   2. the Edge Function `dispatch` is deployed
--   3. the two vault secrets below exist
--
-- Create the secrets first, with your own values:
--
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<sb_secret_...>',           'service_role_key');
--
-- The secret key lives in Vault, never in the client bundle.

create or replace function public.dispatch_notifications()
returns void language plpgsql security definer set search_path = '' as $$
declare
  url text;
  key text;
begin
  select decrypted_secret into url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into key
    from vault.decrypted_secrets where name = 'service_role_key';

  if url is null or key is null then
    raise notice 'vault secrets project_url / service_role_key are not set';
    return;
  end if;

  perform net.http_post(
    url     := url || '/functions/v1/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;

-- every five minutes; the function itself decides what is actually due.
-- pg_cron runs on UTC — all local-time reasoning happens inside the function.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'routine-dispatch') then
    perform cron.unschedule('routine-dispatch');
  end if;
  if exists (select 1 from cron.job where jobname = 'routine-prune') then
    perform cron.unschedule('routine-prune');
  end if;
end $$;

select cron.schedule(
  'routine-dispatch',
  '*/5 * * * *',
  $$ select public.dispatch_notifications(); $$
);

select cron.schedule(
  'routine-prune',
  '30 3 * * *',
  $$ select public.prune_notification_log(); $$
);
