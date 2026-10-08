-- Rappels automatiques (la veille et le jour même), une fois par jour à 9h45 heure de Paris.
-- À exécuter une seule fois dans l'éditeur SQL de Supabase, APRÈS avoir déployé la fonction "reminders".
-- Remplacez <PROJECT_REF> et <CRON_SECRET> (la même valeur que le secret CRON_SECRET des fonctions).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'rappels-concours',
  '45 7 * * *',   -- 7h45 UTC = 9h45 l'été à Paris, 8h45 l'hiver
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
