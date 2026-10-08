-- ============================================================
-- Concours de fléchettes V and B Montpellier Lattes — schéma MVP
-- Base Supabase (Postgres 15+), région UE (ex. eu-west-3 Paris)
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Établissement ----------
create table public.venues (
  id smallint primary key default 1 check (id = 1),
  name text not null,
  address text not null,
  -- clés ISO : 1 = lundi … 6 = samedi ; absent = fermé
  hours jsonb not null,
  closures date[] not null default '{}',
  instagram text,
  facebook text,
  settings jsonb not null default '{}'::jsonb
);

insert into public.venues (name, address, hours, closures, settings) values (
  'V and B Montpellier Lattes',
  '9 allée du Levant, 34970 Lattes',
  '{"1":["14:00","20:00"],"2":["10:00","21:00"],"3":["10:00","21:00"],"4":["10:00","22:00"],"5":["10:00","22:00"],"6":["10:00","21:00"]}',
  '{2026-11-01,2026-11-11,2026-12-25,2027-01-01,2027-03-29}',
  '{"machines":2,"changeMin":2,"happyHour":["17:00","19:00"],"durations":{"301":6,"501":10,"701":14,"Standard Cricket":12,"Select-a-Cricket":10,"Medley 3 manches":25,"Lucky Balloon":5,"Castle Bomber":6,"Survivor":6,"Sevens Heaven":6,"Under the Hat":6}}'
);

-- ---------- Staff : accès par appareil (ni e-mail, ni mot de passe) ----------
-- Chaque tablette ou téléphone du staff ouvre une session Supabase anonyme, puis est autorisé
-- par un lien d'invitation (QR code affiché sur un appareil déjà autorisé, valable 30 minutes, usage unique).
-- Le tout premier appareil est autorisé avec le lien d'installation (clé STAFF_KEY des secrets GitHub).
create table public.staff_devices (
  user_id uuid primary key,                 -- auth.uid() de la session anonyme de l'appareil
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  revoked_at timestamptz
);
create table public.staff_invites (
  token_hash text primary key,              -- sha256 du jeton ; le jeton lui-même n'est jamais stocké
  kind text not null default 'invite' check (kind in ('invite','setup')),
  expires_at timestamptz,                   -- null = lien d'installation (sans expiration, remplaçable par le déploiement)
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_devices where user_id = auth.uid() and revoked_at is null);
$$;

-- ---------- Saisons ----------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  points jsonb not null default '{"part":1,"win":1,"p3":3,"p2":5,"p1":8,"rec":2}'
);
insert into public.seasons (name, starts_on, ends_on) values ('Saison 2026-2027', '2026-09-01', '2027-07-31');

-- ---------- Concours ----------
create table public.contests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id),
  date date not null,
  start_time time not null,
  deadline_time time not null,
  max_teams int not null default 16 check (max_teams between 2 and 64),
  team_size int not null default 2 check (team_size = 2),
  format text not null default 'elim' check (format in ('elim','poules')),
  game text not null default '301',
  final_game text not null default 'Medley 3 manches',
  conso_game text not null default 'Lucky Balloon',
  prizes jsonb not null default '{"podium":["","",""],"conso":[]}',
  status text not null default 'brouillon' check (status in ('brouillon','ouvert','en_cours','termine')),
  version int not null default 0,   -- incrémenté à chaque mise à jour du tableau (évite que deux saisies simultanées s'écrasent)
  phase text check (phase in ('pools','bracket')),
  pools jsonb,
  podium_photo_url text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.contests (date);

-- Le créneau doit tenir dans les horaires du bar (contrainte non négociable du cahier des charges)
create or replace function public.check_contest_slot() returns trigger
language plpgsql as $$
declare v record; h jsonb; d int;
begin
  select * into v from public.venues where id = 1;
  if new.date = any (v.closures) then
    raise exception 'Fermeture exceptionnelle du bar le %', to_char(new.date, 'DD/MM/YYYY');
  end if;
  d := extract(isodow from new.date);
  h := v.hours -> d::text;
  if h is null then raise exception 'Le bar est fermé ce jour-là (dimanche)'; end if;
  if new.start_time < (h ->> 0)::time or new.start_time >= (h ->> 1)::time then
    raise exception 'Le bar est ouvert de % à % ce jour-là', h ->> 0, h ->> 1;
  end if;
  if new.season_id is null then
    select id into new.season_id from public.seasons where new.date between starts_on and ends_on order by starts_on desc limit 1;
  end if;
  return new;
end $$;
create trigger contests_slot before insert or update of date, start_time on public.contests
  for each row execute function public.check_contest_slot();

-- ---------- Autres animations (conflits) ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  label text not null
);

-- ---------- Joueurs, équipes, inscriptions ----------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 25),
  nickname text check (char_length(nickname) <= 25),
  phone text check (phone is null or phone ~ '^\+?[0-9]{9,15}$'),   -- numéro du capitaine, chiffres seuls (ex. 0612345678)
  level text not null default 'occasionnel' check (level in ('debutant','occasionnel','confirme')),
  dartslive_rating smallint check (dartslive_rating between 1 and 18),
  adult_confirmed boolean not null default false,
  erased_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  captain_id uuid not null references public.players(id),
  mate_id uuid references public.players(id),
  created_at timestamptz not null default now()
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  status text not null default 'confirmee' check (status in ('confirmee','attente','annulee')),
  present boolean not null default false,
  source text not null default 'en_ligne' check (source in ('en_ligne','sur_place')),
  was_waitlisted boolean not null default false,
  pin text not null default lpad((floor(random() * 10000))::int::text, 4, '0'),  -- code d'équipe pour déclarer ses résultats depuis le téléphone
  cancel_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index on public.registrations (contest_id, status, created_at);

-- ---------- Notifications sur le téléphone des joueurs (Web Push, sans e-mail ni SMS) ----------
-- Un téléphone qui accepte les notifications enregistre ici son abonnement, rattaché à l'inscription.
create table public.push_subscriptions (
  endpoint text not null check (endpoint ~ '^https://'),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  primary key (registration_id, endpoint)   -- un même téléphone peut suivre plusieurs inscriptions
);
create index on public.push_subscriptions (endpoint);
-- Messages à envoyer (place libérée, match lancé) : remplis par la base, vidés par la fonction « push »
create table public.push_outbox (
  id bigint generated always as identity primary key,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  title text not null,
  body text not null,
  url text,
  tag text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.push_outbox (created_at) where sent_at is null;
-- Clés VAPID du serveur d'envoi, créées automatiquement au premier envoi (jamais lisibles depuis les pages)
create table public.push_keys (
  id smallint primary key default 1 check (id = 1),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- Matchs (une ligne par match du tableau) ----------
create table public.matches (
  contest_id uuid not null references public.contests(id) on delete cascade,
  id text not null,
  ph text not null check (ph in ('pool','main','conso','p3')),
  r int not null,
  slot int not null,
  grp int,
  a text, b text,               -- id d'inscription, '-' = exempt, null = à déterminer
  a_from jsonb, b_from jsonb,   -- {"m": id du match source, "t": "w"|"l"}
  winner text, loser text,
  score text,
  status text not null default 'wait' check (status in ('wait','ready','live','done')),
  bye boolean not null default false,
  machine smallint check (machine between 1 and 4),   -- machine DARTSLIVE utilisée quand le match est en cours
  live_at timestamptz,                                 -- heure de lancement sur la machine
  played_at timestamptz,
  reported_by text check (reported_by in ('staff','joueurs')),
  primary key (contest_id, id)
);

-- ---------- Résultats et records ----------
create table public.results (
  contest_id uuid not null references public.contests(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  place int,
  wins int not null default 0,
  points int not null default 0,
  primary key (contest_id, registration_id)
);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  game text not null check (game in ('Count-Up','Big Bull')),
  player_name text not null check (char_length(player_name) between 1 and 30),
  score int not null check (score between 0 and 2000),
  photo_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Vues publiques (aucune donnée de contact)
-- ============================================================
create view public.public_teams as
select r.id as registration_id, r.contest_id, r.status, r.present, r.created_at,
       t.name as team_name,
       coalesce(nullif(c.nickname,''), c.first_name) as captain_name, c.level as captain_level,
       coalesce(nullif(m.nickname,''), m.first_name) as mate_name, m.level as mate_level
from public.registrations r
join public.teams t on t.id = r.team_id
join public.players c on c.id = t.captain_id
left join public.players m on m.id = t.mate_id
join public.contests k on k.id = r.contest_id
where r.status <> 'annulee' and k.status <> 'brouillon';

create view public.season_team_standings as
select s.id as season_id, lower(t.name) as team_key, max(t.name) as team_name,
       sum(res.points)::int as points, sum(res.wins)::int as wins, count(*)::int as contests
from public.results res
join public.registrations r on r.id = res.registration_id
join public.teams t on t.id = r.team_id
join public.contests k on k.id = res.contest_id
join public.seasons s on s.id = k.season_id
group by s.id, lower(t.name);

create view public.season_player_standings as
with base as (
  select k.season_id, p.id as pid, coalesce(nullif(p.nickname,''), p.first_name) as name, res.points, res.wins
  from public.results res
  join public.registrations r on r.id = res.registration_id
  join public.teams t on t.id = r.team_id
  join public.players p on p.id in (t.captain_id, t.mate_id)
  join public.contests k on k.id = res.contest_id
  where p.erased_at is null
), weekly as (
  select distinct on (week_start, game) week_start, game, player_name, score from public.records
  where week_start < date_trunc('week', now() at time zone 'Europe/Paris')::date
  order by week_start, game, score desc
)
select season_id, lower(name) as player_key, max(name) as player_name, sum(points)::int as points, sum(wins)::int as wins, count(*)::int as contests
from (
  select season_id, name, points, wins from base
  union all
  select s.id, w.player_name, (s.points->>'rec')::int, 0 from weekly w join public.seasons s on w.week_start between s.starts_on and s.ends_on
) x group by season_id, lower(name);

-- ============================================================
-- Fonctions appelées par le public (sans compte)
-- ============================================================

-- Numéro de téléphone normalisé : chiffres seuls, +33 6… devient 06…
create or replace function public.norm_phone(p text) returns text
language sql immutable as $$
  select case when d ~ '^33[1-9][0-9]{8}$' then '0' || substr(d, 3) else nullif(d, '') end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- Inscription d'une équipe (ou d'un joueur solo) en moins d'une minute, avec le numéro de téléphone du capitaine
create or replace function public.register_team(
  p_contest uuid, p_team_name text, p_captain text, p_phone text,
  p_captain_level text, p_mate text, p_mate_level text, p_adult boolean,
  p_source text default 'en_ligne'
) returns table (registration_id uuid, status text, cancel_token uuid, pin text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare k record; n_conf int; v_cap uuid; v_mate uuid; v_team uuid; v_name text; v_status text; v_reg record; v_now timestamp; v_phone text; v_last text;
begin
  if not p_adult then raise exception 'Le concours est réservé aux majeurs'; end if;
  if coalesce(trim(p_captain),'') = '' then raise exception 'Prénom du capitaine manquant'; end if;
  if p_source = 'sur_place' and not public.is_staff() then raise exception 'Réservé au staff'; end if;
  v_phone := public.norm_phone(p_phone);
  if v_phone is not null and v_phone !~ '^\+?[0-9]{9,15}$' then raise exception 'Numéro de téléphone invalide'; end if;
  if v_phone is null and p_source <> 'sur_place' then raise exception 'Indiquez votre numéro de téléphone'; end if;

  select * into k from public.contests where id = p_contest for update;   -- verrou : pas de surréservation
  if not found or k.status <> 'ouvert' then raise exception 'Les inscriptions ne sont pas ouvertes pour ce concours'; end if;
  v_now := now() at time zone 'Europe/Paris';
  if not public.is_staff() and v_now > (k.date + k.deadline_time) then raise exception 'Les inscriptions en ligne sont closes'; end if;

  -- le numéro de téléphone identifie le joueur d'un concours à l'autre : même fiche, même nom d'équipe par défaut
  if v_phone is not null then
    select id into v_cap from public.players where phone = v_phone and erased_at is null order by created_at desc limit 1;
    if v_cap is not null then
      select t.name into v_last from public.teams t join public.registrations r on r.team_id = t.id
        where t.captain_id = v_cap and t.name not like '% (test)' and t.name not like 'Solo · %' order by r.created_at desc limit 1;
    end if;
  end if;
  v_name := coalesce(nullif(trim(p_team_name),''), v_last, case when coalesce(trim(p_mate),'') = '' then 'Solo · ' || trim(p_captain) else trim(p_captain) || ' & ' || trim(p_mate) end);
  if exists (select 1 from public.registrations r join public.teams t on t.id = r.team_id
             where r.contest_id = p_contest and r.status <> 'annulee' and lower(t.name) = lower(v_name)) then
    raise exception 'Ce nom d''équipe est déjà pris pour ce concours';
  end if;
  -- un nom d'équipe appartient au numéro qui l'a utilisé en premier (suivi des scores sur la saison)
  if v_phone is not null and exists (select 1 from public.teams t join public.players p on p.id = t.captain_id
      where lower(t.name) = lower(v_name) and p.phone is not null and p.phone <> v_phone and p.erased_at is null and t.name not like 'Solo · %') then
    raise exception 'Ce nom d''équipe est déjà utilisé par une autre équipe (autre numéro de téléphone). Choisissez-en un autre.';
  end if;
  if v_phone is not null and exists (select 1 from public.registrations r join public.teams t on t.id = r.team_id join public.players p on p.id = t.captain_id
      where r.contest_id = p_contest and r.status <> 'annulee' and p.phone = v_phone) then
    raise exception 'Ce numéro a déjà inscrit une équipe à ce concours';
  end if;

  if v_cap is null then
    insert into public.players (first_name, phone, level, adult_confirmed)
      values (trim(p_captain), v_phone, coalesce(p_captain_level,'occasionnel'), true)
      returning id into v_cap;
  else
    update public.players set first_name = trim(p_captain), level = coalesce(p_captain_level, level), adult_confirmed = true where id = v_cap;
  end if;
  if coalesce(trim(p_mate),'') <> '' then
    insert into public.players (first_name, level, adult_confirmed) values (trim(p_mate), coalesce(p_mate_level,'occasionnel'), true) returning id into v_mate;
  end if;
  insert into public.teams (name, captain_id, mate_id) values (v_name, v_cap, v_mate) returning id into v_team;

  select count(*) into n_conf from public.registrations where contest_id = p_contest and registrations.status = 'confirmee';
  v_status := case when n_conf >= k.max_teams then 'attente' else 'confirmee' end;
  insert into public.registrations (contest_id, team_id, status, source, was_waitlisted)
    values (p_contest, v_team, v_status, coalesce(p_source,'en_ligne'), v_status = 'attente')
    returning * into v_reg;
  -- pas de code d'équipe en liste d'attente : il n'est donné qu'une fois la place confirmée
  return query select v_reg.id, v_reg.status, v_reg.cancel_token, case when v_reg.status = 'confirmee' then v_reg.pin end;
end $$;

-- Suivi des scores du joueur : tous les concours joués avec le même numéro de téléphone.
-- Le téléphone prouve qui il est avec le jeton d'une de ses inscriptions (gardé dans l'application).
create or replace function public.my_scores(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  with me as (
    select p.phone from public.registrations r join public.teams t on t.id = r.team_id join public.players p on p.id = t.captain_id
    where r.cancel_token = p_token and p.phone is not null and p.erased_at is null
  ), regs as (
    select r.id, r.status, r.present, t.name as team, k.id as contest_id, k.date, k.status as contest_status, k.season_id, k.game,
           res.place, coalesce(res.wins, 0) as wins, coalesce(res.points, 0) as points
    from public.registrations r join public.teams t on t.id = r.team_id join public.players p on p.id = t.captain_id
    join public.contests k on k.id = r.contest_id
    left join public.results res on res.registration_id = r.id
    where p.phone = (select phone from me) and r.status <> 'annulee' and k.status <> 'brouillon'
  ), games as (
    select g.id as reg_id, m.played_at, m.ph, m.score, m.winner = g.id::text as won, ot.name as opponent
    from regs g join public.matches m on m.contest_id = g.contest_id and (m.a = g.id::text or m.b = g.id::text)
    left join public.registrations o on o.id::text = case when m.a = g.id::text then m.b else m.a end
    left join public.teams ot on ot.id = o.team_id
    where m.status = 'done' and not m.bye
  )
  select case when (select phone from me) is null then null else json_build_object(
    'phone', '•• •• •• ' || right((select phone from me), 4),
    'teams', (select coalesce(json_agg(distinct team), '[]') from regs where team not like '% (test)'),
    'totals', json_build_object(
      'contests', (select count(*) from regs where contest_status = 'termine' and season_id is not null),
      'wins', (select count(*) from games x join regs g on g.id = x.reg_id where x.won and g.season_id is not null),
      'losses', (select count(*) from games x join regs g on g.id = x.reg_id where not x.won and g.season_id is not null),
      'points', (select coalesce(sum(points), 0) from regs where season_id is not null),
      'podiums', (select count(*) from regs where place between 1 and 3 and season_id is not null)),
    'contests', (select coalesce(json_agg(json_build_object(
        'contest_id', g.contest_id, 'date', g.date, 'team', g.team, 'status', g.status, 'contest_status', g.contest_status, 'game', g.game,
        'test', g.season_id is null, 'place', g.place, 'points', g.points,
        'matches', (select coalesce(json_agg(json_build_object('opponent', x.opponent, 'won', x.won, 'score', x.score, 'phase', x.ph) order by x.played_at), '[]') from games x where x.reg_id = g.id)
      ) order by g.date desc), '[]') from regs g)
  ) end;
$$;
grant execute on function public.my_scores to anon, authenticated;

-- Lecture d'une inscription depuis le lien reçu
create or replace function public.get_registration(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', r.id, 'status', r.status, 'team', t.name, 'captain', c.first_name, 'mate', m.first_name,
    'pin', case when r.status = 'confirmee' then r.pin end, 'phone', case when c.phone is not null then '•• •• •• ' || right(c.phone, 4) end,
    'push', exists (select 1 from public.push_subscriptions s where s.registration_id = r.id),
    'contest', json_build_object('id', k.id, 'date', k.date, 'start', to_char(k.start_time,'HH24:MI'), 'status', k.status, 'game', k.game, 'format', k.format))
  from public.registrations r join public.teams t on t.id = r.team_id join public.players c on c.id = t.captain_id
  left join public.players m on m.id = t.mate_id join public.contests k on k.id = r.contest_id
  where r.cancel_token = p_token;
$$;

-- Désinscription en un clic : libère la place pour la liste d'attente
create or replace function public.cancel_registration(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r record; k record; promoted uuid;
begin
  select * into r from public.registrations where cancel_token = p_token;
  if not found then raise exception 'Lien invalide'; end if;
  select * into k from public.contests where id = r.contest_id for update;
  if k.status in ('en_cours','termine') then raise exception 'Le concours a déjà commencé'; end if;
  if r.status = 'annulee' then return null; end if;
  update public.registrations set status = 'annulee' where id = r.id;
  if r.status = 'confirmee' then
    select id into promoted from public.registrations where contest_id = r.contest_id and status = 'attente' order by created_at limit 1;
    if promoted is not null then update public.registrations set status = 'confirmee' where id = promoted; end if;
  end if;
  return promoted;
end $$;

-- Droit à l'effacement depuis le lien reçu
create or replace function public.erase_my_data(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; t record;
begin
  select * into r from public.registrations where cancel_token = p_token;
  if not found then raise exception 'Lien invalide'; end if;
  select * into t from public.teams where id = r.team_id;
  if exists (select 1 from public.contests where id = r.contest_id and status = 'ouvert') then
    perform public.cancel_registration(p_token);
  end if;
  delete from public.push_subscriptions where registration_id = r.id;
  update public.players set first_name = 'Joueur', nickname = null, phone = null, erased_at = now()
    where id in (t.captain_id, t.mate_id);
  update public.teams set name = 'Équipe ' || left(t.id::text, 4) where id = t.id;
end $$;

-- Staff : associer les joueurs solo (un confirmé avec un débutant si possible)
create or replace function public.pair_solos(p_contest uuid) returns int
language plpgsql security definer set search_path = public as $$
declare solos uuid[]; a record; b record; n int := 0;
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  select array_agg(r.id order by case p.level when 'confirme' then 0 when 'occasionnel' then 1 else 2 end, r.created_at)
    into solos
    from public.registrations r join public.teams t on t.id = r.team_id join public.players p on p.id = t.captain_id
    where r.contest_id = p_contest and r.status in ('confirmee','attente') and t.mate_id is null;
  while coalesce(array_length(solos,1),0) >= 2 loop
    select r.*, t.captain_id, t.name as tname into a from public.registrations r join public.teams t on t.id = r.team_id where r.id = solos[1];
    select r.*, t.captain_id into b from public.registrations r join public.teams t on t.id = r.team_id where r.id = solos[array_length(solos,1)];
    update public.teams set mate_id = b.captain_id,
      name = case when a.tname like 'Solo · %' then (select first_name from players where id = a.captain_id) || ' & ' || (select first_name from players where id = b.captain_id) else a.tname end
      where id = a.team_id;
    update public.registrations set status = 'annulee' where id = b.id;
    if b.status = 'confirmee' then update public.registrations set status = 'confirmee' where id = a.id; end if;
    solos := solos[2:array_length(solos,1)-1];
    n := n + 1;
  end loop;
  -- les places libérées profitent à la liste d'attente
  update public.registrations set status = 'confirmee' where id in (
    select id from public.registrations where contest_id = p_contest and status = 'attente' order by created_at
    limit greatest(0, (select max_teams from contests where id = p_contest) - (select count(*) from registrations where contest_id = p_contest and status = 'confirmee')));
  return n;
end $$;

-- Code d'équipe : retrouve l'équipe à partir de son code (page joueurs, onglet « Mon match »)
create or replace function public.team_by_pin(p_contest uuid, p_pin text) returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if p_pin !~ '^[0-9]{4}$' then return null; end if;
  select json_build_object('registration_id', g.id, 'team', t.name) into r
    from public.registrations g join public.teams t on t.id = g.team_id
    where g.contest_id = p_contest and g.status = 'confirmee' and g.pin = p_pin limit 1;
  if r is null then perform pg_sleep(1); end if;   -- freine les essais au hasard
  return r;
end $$;

-- Mise à jour atomique du tableau : refuse si quelqu'un a écrit entre-temps (version différente)
create or replace function public.apply_bracket(p_contest uuid, p_version int, p_matches jsonb, p_patch jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not (public.is_staff() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Réservé au staff'; end if;
  select version into v from public.contests where id = p_contest for update;
  if v is distinct from p_version then raise exception 'conflict'; end if;
  insert into public.matches (contest_id, id, ph, r, slot, grp, a, b, a_from, b_from, winner, loser, score, status, bye, machine, live_at, played_at, reported_by)
  select p_contest, x.id, x.ph, x.r, x.slot, x.grp, x.a, x.b, x.a_from, x.b_from, x.winner, x.loser, x.score, x.status, coalesce(x.bye, false), x.machine, x.live_at, x.played_at, x.reported_by
    from jsonb_to_recordset(p_matches) as x(id text, ph text, r int, slot int, grp int, a text, b text, a_from jsonb, b_from jsonb, winner text, loser text, score text, status text, bye boolean, machine smallint, live_at timestamptz, played_at timestamptz, reported_by text)
  on conflict (contest_id, id) do update set ph = excluded.ph, r = excluded.r, slot = excluded.slot, grp = excluded.grp, a = excluded.a, b = excluded.b,
    a_from = excluded.a_from, b_from = excluded.b_from, winner = excluded.winner, loser = excluded.loser, score = excluded.score, status = excluded.status,
    bye = excluded.bye, machine = excluded.machine, live_at = excluded.live_at, played_at = excluded.played_at, reported_by = excluded.reported_by;
  update public.contests set version = version + 1,
    status = coalesce(p_patch->>'status', status), phase = case when p_patch ? 'phase' then p_patch->>'phase' else phase end,
    pools = case when p_patch ? 'pools' then p_patch->'pools' else pools end,
    finished_at = case when p_patch ? 'finished_at' then (p_patch->>'finished_at')::timestamptz else finished_at end
  where id = p_contest;
  return v + 1;
end $$;
grant execute on function public.team_by_pin to anon, authenticated;
grant execute on function public.apply_bracket to authenticated, service_role;

grant execute on function public.register_team, public.get_registration, public.cancel_registration, public.erase_my_data to anon, authenticated;
grant execute on function public.pair_solos, public.is_staff to authenticated;

-- ============================================================
-- Sécurité au niveau des lignes
-- ============================================================
alter table public.venues enable row level security;
alter table public.staff_devices enable row level security;
alter table public.staff_invites enable row level security;
alter table public.seasons enable row level security;
alter table public.contests enable row level security;
alter table public.events enable row level security;
alter table public.players enable row level security;
alter table public.teams enable row level security;
alter table public.registrations enable row level security;
alter table public.matches enable row level security;
alter table public.results enable row level security;
alter table public.records enable row level security;

create policy "lecture publique" on public.venues for select using (true);
create policy "staff écrit" on public.venues for update using (public.is_staff());

create policy "staff" on public.staff_devices for select to authenticated using (public.is_staff());
-- staff_invites : aucune politique, accès uniquement par les fonctions ci-dessous

create policy "lecture publique" on public.seasons for select using (true);
create policy "staff écrit" on public.seasons for all using (public.is_staff()) with check (public.is_staff());

create policy "publiés ou staff" on public.contests for select using (status <> 'brouillon' or public.is_staff());
create policy "staff écrit" on public.contests for all using (public.is_staff()) with check (public.is_staff());

create policy "lecture publique" on public.events for select using (true);
create policy "staff écrit" on public.events for all using (public.is_staff()) with check (public.is_staff());

-- Données personnelles : staff uniquement (le public passe par les vues et fonctions ci-dessus)
create policy "staff" on public.players for all using (public.is_staff()) with check (public.is_staff());
create policy "staff" on public.teams for all using (public.is_staff()) with check (public.is_staff());
create policy "staff" on public.registrations for all using (public.is_staff()) with check (public.is_staff());

create policy "lecture publique" on public.matches for select using (exists (select 1 from public.contests k where k.id = contest_id and k.status <> 'brouillon') or public.is_staff());
create policy "staff écrit" on public.matches for all using (public.is_staff()) with check (public.is_staff());

create policy "lecture publique" on public.results for select using (true);
create policy "staff écrit" on public.results for all using (public.is_staff()) with check (public.is_staff());

create policy "lecture publique" on public.records for select using (true);
create policy "staff écrit" on public.records for all using (public.is_staff()) with check (public.is_staff());

grant select on public.public_teams, public.season_team_standings, public.season_player_standings to anon, authenticated;

-- Temps réel pour le tableau et le mode bar
alter publication supabase_realtime add table public.matches, public.contests, public.registrations;  -- registrations : visible du staff seulement (RLS)

-- Photos (podium, écran du record) : lecture publique, écriture staff
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict do nothing;
-- Fichiers volumineux du site (logo, images, vidéos pour l'écran du bar) : hors du dépôt GitHub
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', true, 52428800, array['image/png','image/jpeg','image/webp','image/svg+xml','image/gif','video/mp4','video/webm','font/woff2','application/pdf'])
on conflict do nothing;
create policy "staff dépose des photos" on storage.objects for insert to authenticated with check (bucket_id in ('photos','assets') and public.is_staff());
create policy "staff gère les photos" on storage.objects for update to authenticated using (bucket_id in ('photos','assets') and public.is_staff());
create policy "staff supprime des photos" on storage.objects for delete to authenticated using (bucket_id in ('photos','assets') and public.is_staff());
-- le staff liste les fichiers (la lecture publique passe par l'URL publique du bucket)
create policy "staff liste les fichiers" on storage.objects for select to authenticated using (bucket_id in ('photos','assets') and public.is_staff());

-- ============================================================
-- Notifications : déclencheurs
-- ============================================================
-- Demande à la fonction « push » d'envoyer tout de suite (pg_net, asynchrone, après validation de la transaction)
create extension if not exists pg_net;
create or replace function public.push_kick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'https://ifjiysdhxmidiswcsiuq.supabase.co/functions/v1/push',
                        body := '{"action":"flush"}'::jsonb,
                        headers := '{"Content-Type":"application/json"}'::jsonb);
exception when others then null;   -- jamais bloquant : la tâche planifiée rattrape les envois en retard
end $$;
revoke execute on function public.push_kick from public, anon, authenticated;

-- Place libérée : une équipe passe de la liste d'attente aux inscrits
create or replace function public.on_registration_promoted() returns trigger
language plpgsql security definer set search_path = public as $$
declare k record;
begin
  if old.status = 'attente' and new.status = 'confirmee'
     and exists (select 1 from public.push_subscriptions where registration_id = new.id) then
    select * into k from public.contests where id = new.contest_id;
    insert into public.push_outbox (registration_id, title, body, url, tag) values (new.id,
      'Une place s''est libérée !',
      'Votre équipe est inscrite au concours du ' || to_char(k.date, 'DD/MM') || ' à ' || replace(to_char(k.start_time, 'HH24:MI'), ':', 'h') || '. Votre code d''équipe vous attend dans l''application.',
      './?c=' || new.contest_id || '&tab=monmatch', 'place-' || new.id);
    perform public.push_kick();
  end if;
  return new;
end $$;
create trigger registrations_promoted after update of status on public.registrations
  for each row execute function public.on_registration_promoted();

-- Match lancé sur une machine : les deux équipes sont appelées
create or replace function public.on_match_live() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int := 0; side text; other text; oname text;
begin
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    foreach side in array array[new.a, new.b] loop
      continue when side is null or side = '-' or side !~ '^[0-9a-f-]{36}$';
      continue when not exists (select 1 from public.push_subscriptions where registration_id = side::uuid);
      other := case when side = new.a then new.b else new.a end;
      select t.name into oname from public.registrations r join public.teams t on t.id = r.team_id where r.id::text = other;
      insert into public.push_outbox (registration_id, title, body, url, tag) values (side::uuid,
        'À vous de jouer : machine ' || coalesce(new.machine, 1),
        'Votre match contre ' || coalesce(oname, 'vos adversaires') || ' commence sur la machine ' || coalesce(new.machine, 1) || '. Déclarez le résultat dans « Mon match ».',
        './?c=' || new.contest_id || '&tab=monmatch', 'match-' || new.contest_id || '-' || new.id);
      n := n + 1;
    end loop;
    if n > 0 then perform public.push_kick(); end if;
  end if;
  return new;
end $$;
create trigger matches_live after insert or update of status on public.matches
  for each row execute function public.on_match_live();

-- Le téléphone qui a fait l'inscription enregistre son abonnement aux notifications
create or replace function public.save_push_subscription(p_token uuid, p_endpoint text, p_p256dh text, p_auth text) returns boolean
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.registrations where cancel_token = p_token;
  if not found or r.status = 'annulee' then raise exception 'Inscription introuvable'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then raise exception 'Abonnement invalide'; end if;
  if (select count(*) from public.push_subscriptions where registration_id = r.id) >= 5 then
    delete from public.push_subscriptions where registration_id = r.id and endpoint = (select endpoint from public.push_subscriptions where registration_id = r.id order by created_at limit 1);
  end if;
  insert into public.push_subscriptions (endpoint, registration_id, p256dh, auth) values (p_endpoint, r.id, p_p256dh, p_auth)
    on conflict (registration_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
  return true;
end $$;
create or replace function public.delete_push_subscription(p_token uuid, p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions s using public.registrations r
  where s.registration_id = r.id and r.cancel_token = p_token and s.endpoint = p_endpoint;
$$;
grant execute on function public.save_push_subscription, public.delete_push_subscription to anon, authenticated;

alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
alter table public.push_keys enable row level security;
-- aucune politique : ces tables ne sont lues que par la fonction « push » (clé service)

-- ============================================================
-- Staff : autoriser un appareil, inviter, retirer
-- ============================================================
-- Appelée par un appareil qui a ouvert une session anonyme, avec le jeton du lien (installation ou invitation)
create or replace function public.join_staff(p_token text, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v record; h text;
begin
  if auth.uid() is null then raise exception 'Session manquante'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Donnez un nom à cet appareil'; end if;
  h := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  select * into v from public.staff_invites where token_hash = h for update;
  if not found or (v.kind = 'invite' and (v.used_at is not null or v.expires_at < now())) then
    perform pg_sleep(1);
    raise exception 'Lien d''accès invalide ou expiré. Demandez un nouveau QR code à un appareil du staff.';
  end if;
  if v.kind = 'invite' then update public.staff_invites set used_at = now() where token_hash = h; end if;
  insert into public.staff_devices (user_id, name) values (auth.uid(), left(trim(p_name), 40))
    on conflict (user_id) do update set name = excluded.name, revoked_at = null, last_seen = now();
  return true;
end $$;

-- Ouverture de l'espace staff : vérifie l'appareil et note sa dernière visite
create or replace function public.staff_hello() returns json
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  update public.staff_devices set last_seen = now() where user_id = auth.uid() and revoked_at is null returning * into d;
  if not found then return null; end if;
  return json_build_object('name', d.name, 'since', d.created_at);
end $$;

-- QR code « Ajouter un appareil » : lien valable 30 minutes, utilisable une seule fois
create or replace function public.create_staff_invite() returns text
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  t := encode(extensions.gen_random_bytes(18), 'hex');
  delete from public.staff_invites where kind = 'invite' and (used_at is not null or expires_at < now());
  insert into public.staff_invites (token_hash, kind, expires_at) values (encode(extensions.digest(t, 'sha256'), 'hex'), 'invite', now() + interval '30 minutes');
  return t;
end $$;

create or replace function public.revoke_staff_device(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  update public.staff_devices set revoked_at = now() where user_id = p_user;
end $$;

revoke execute on function public.join_staff, public.staff_hello, public.create_staff_invite, public.revoke_staff_device from public, anon;
grant execute on function public.join_staff, public.staff_hello, public.create_staff_invite, public.revoke_staff_device to authenticated;

-- ============================================================
-- Concours de test (créé et effacé depuis l'espace staff, onglet Réglages)
-- ============================================================
create or replace function public.create_test_contest() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k uuid := '7e570000-0000-4000-8000-000000000001';
  names text[] := array['Les Flèches','Bull Busters','Triple 20','Les Cricketeurs','Double Out','Les Pointus','Team Tungstène','Les Plumes','Cible Folle','Les Barons','Les Volées','180 Club'];
  p1 text[] := array['Léa','Karim','Sofia','Nina','Inès','Chloé','Emma','Sarah','Camille','Manon','Jade','Lina'];
  p2 text[] := array['Tom','Julie','Hugo','Paul','Max','Yanis','Lucas','Noah','Adam','Enzo','Théo','Rayan'];
  lv text[] := array['confirme','occasionnel','debutant'];
  i int; cap uuid; mate uuid; tm uuid; d date := (now() at time zone 'Europe/Paris')::date; h jsonb;
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  perform public.delete_test_contest();
  -- prochain jour d'ouverture du bar
  loop
    select hours -> extract(isodow from d)::int::text into h from public.venues where id = 1;
    exit when h is not null and not exists (select 1 from public.venues where id = 1 and d = any (closures));
    d := d + 1;
  end loop;
  insert into public.contests (id, date, start_time, deadline_time, max_teams, format, status, prizes)
  values (k, d, greatest((h ->> 0)::time + interval '1 hour', least('18:00'::time, (h ->> 1)::time - interval '3 hours'))::time,
          ((h ->> 1)::time - interval '15 minutes')::time, 13, 'elim', 'ouvert',
    '{"podium":["Lot du 1er (test)","Lot du 2e (test)","Lot du 3e (test)"],"conso":[{"id":"k1","label":"Vainqueur de la consolante","rule":"consolante","winner":null}]}');
  for i in 1..12 loop
    insert into public.players (first_name, level, adult_confirmed) values (p1[i], lv[1 + (i - 1) % 3], true) returning id into cap;
    insert into public.players (first_name, level, adult_confirmed) values (p2[i], lv[1 + i % 3], true) returning id into mate;
    insert into public.teams (name, captain_id, mate_id) values (names[i] || ' (test)', cap, mate) returning id into tm;
    insert into public.registrations (contest_id, team_id, status, present, source, pin) values (k, tm, 'confirmee', i <= 10, 'sur_place', (1000 + i)::text);
  end loop;
  update public.contests set season_id = null where id = k;   -- jamais compté dans le classement de la saison
  return k;
end $$;
create or replace function public.delete_test_contest() returns void
language plpgsql security definer set search_path = public as $$
declare k uuid := '7e570000-0000-4000-8000-000000000001'; tm uuid[]; pl uuid[];
begin
  if not public.is_staff() then raise exception 'Réservé au staff'; end if;
  select array_agg(team_id) into tm from public.registrations where contest_id = k;
  select array_agg(x) into pl from (select captain_id x from public.teams where id = any (tm) union select mate_id from public.teams where id = any (tm)) q where x is not null;
  delete from public.contests where id = k;
  delete from public.teams where id = any (tm) and not exists (select 1 from public.registrations r where r.team_id = teams.id);
  delete from public.players where id = any (pl) and not exists (select 1 from public.teams t where t.captain_id = players.id or t.mate_id = players.id);
end $$;
revoke execute on function public.create_test_contest, public.delete_test_contest from public, anon;
grant execute on function public.create_test_contest, public.delete_test_contest to authenticated;

-- ============================================================
-- Tâches planifiées (aucune clé secrète : ces fonctions ne font rien de sensible)
-- ============================================================
create extension if not exists pg_cron;
-- Horaires et coordonnées repris de la fiche vandb.fr chaque matin (4h10 UTC = 6h10 à Paris l'été)
select cron.schedule('synchro-fiche-magasin', '10 4 * * *',
  $$ select net.http_post(url := 'https://ifjiysdhxmidiswcsiuq.supabase.co/functions/v1/sync-store', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb) $$);
-- Filet de sécurité : renvoie les notifications restées en attente
select cron.schedule('notifications-en-attente', '*/5 * * * *',
  $$ select public.push_kick() where exists (select 1 from public.push_outbox where sent_at is null and created_at > now() - interval '1 hour') $$);
