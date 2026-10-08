-- ============================================================
-- Concours de fléchettes V and B Montpellier Lattes — schéma MVP
-- Base Supabase (Postgres 15+), région UE (ex. eu-west-3 Paris)
-- ============================================================

create extension if not exists pgcrypto;

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

-- ---------- Staff ----------
create table public.staff (
  email text primary key check (email = lower(email)),
  name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where email = lower(coalesce(auth.jwt() ->> 'email', '')));
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
  phase text check (phase in ('pools','bracket')),
  pools jsonb,
  podium_photo_url text,
  announced_at timestamptz,
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
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^[0-9 +().-]{6,20}$'),
  level text not null default 'occasionnel' check (level in ('debutant','occasionnel','confirme')),
  dartslive_rating smallint check (dartslive_rating between 1 and 18),
  consent_reminders boolean not null default false,
  consent_news boolean not null default false,
  adult_confirmed boolean not null default false,
  unsub_token uuid not null default gen_random_uuid(),
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
  cancel_token uuid not null default gen_random_uuid(),
  confirmation_sent_at timestamptz,
  promotion_sent_at timestamptz,
  reminder_eve_at timestamptz,
  reminder_day_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.registrations (contest_id, status, created_at);

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

-- Inscription d'une équipe (ou d'un joueur solo) en moins d'une minute
create or replace function public.register_team(
  p_contest uuid, p_team_name text, p_captain text, p_email text, p_phone text,
  p_captain_level text, p_mate text, p_mate_level text,
  p_consent_reminders boolean, p_consent_news boolean, p_adult boolean,
  p_source text default 'en_ligne'
) returns table (registration_id uuid, status text, cancel_token uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare k record; n_conf int; v_cap uuid; v_mate uuid; v_team uuid; v_name text; v_status text; v_reg record; v_now timestamp;
begin
  if not p_adult then raise exception 'Le concours est réservé aux majeurs'; end if;
  if coalesce(trim(p_captain),'') = '' then raise exception 'Prénom du capitaine manquant'; end if;
  if p_source = 'sur_place' and not public.is_staff() then raise exception 'Réservé au staff'; end if;
  if p_source <> 'sur_place' and coalesce(trim(p_email),'') = '' and coalesce(trim(p_phone),'') = '' then
    raise exception 'Indiquez un e-mail ou un téléphone pour recevoir la confirmation';
  end if;

  select * into k from public.contests where id = p_contest for update;   -- verrou : pas de surréservation
  if not found or k.status <> 'ouvert' then raise exception 'Les inscriptions ne sont pas ouvertes pour ce concours'; end if;
  v_now := now() at time zone 'Europe/Paris';
  if not public.is_staff() and v_now > (k.date + k.deadline_time) then raise exception 'Les inscriptions en ligne sont closes'; end if;

  v_name := coalesce(nullif(trim(p_team_name),''), case when coalesce(trim(p_mate),'') = '' then 'Solo · ' || trim(p_captain) else trim(p_captain) || ' & ' || trim(p_mate) end);
  if exists (select 1 from public.registrations r join public.teams t on t.id = r.team_id
             where r.contest_id = p_contest and r.status <> 'annulee' and lower(t.name) = lower(v_name)) then
    raise exception 'Ce nom d''équipe est déjà pris pour ce concours';
  end if;
  if coalesce(trim(p_email),'') <> '' and (select count(*) from public.registrations r join public.teams t on t.id = r.team_id join public.players p on p.id = t.captain_id
      where r.contest_id = p_contest and r.status <> 'annulee' and lower(p.email) = lower(trim(p_email))) >= 2 then
    raise exception 'Cette adresse a déjà inscrit deux équipes';
  end if;

  insert into public.players (first_name, email, phone, level, consent_reminders, consent_news, adult_confirmed)
    values (trim(p_captain), nullif(lower(trim(p_email)),''), nullif(trim(p_phone),''), coalesce(p_captain_level,'occasionnel'), p_consent_reminders, p_consent_news, true)
    returning id into v_cap;
  if coalesce(trim(p_mate),'') <> '' then
    insert into public.players (first_name, level, adult_confirmed) values (trim(p_mate), coalesce(p_mate_level,'occasionnel'), true) returning id into v_mate;
  end if;
  insert into public.teams (name, captain_id, mate_id) values (v_name, v_cap, v_mate) returning id into v_team;

  select count(*) into n_conf from public.registrations where contest_id = p_contest and registrations.status = 'confirmee';
  v_status := case when n_conf >= k.max_teams then 'attente' else 'confirmee' end;
  insert into public.registrations (contest_id, team_id, status, source, was_waitlisted)
    values (p_contest, v_team, v_status, coalesce(p_source,'en_ligne'), v_status = 'attente')
    returning * into v_reg;
  return query select v_reg.id, v_reg.status, v_reg.cancel_token;
end $$;

-- Lecture d'une inscription depuis le lien reçu
create or replace function public.get_registration(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', r.id, 'status', r.status, 'team', t.name, 'captain', c.first_name, 'mate', m.first_name,
    'consent_reminders', c.consent_reminders, 'consent_news', c.consent_news,
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
  update public.players set first_name = 'Joueur', nickname = null, email = null, phone = null,
    consent_reminders = false, consent_news = false, erased_at = now()
    where id in (t.captain_id, t.mate_id);
  update public.teams set name = 'Équipe ' || left(t.id::text, 4) where id = t.id;
end $$;

-- Désabonnement des annonces
create or replace function public.unsubscribe_news(p_token uuid) returns boolean
language sql security definer set search_path = public as $$
  update public.players set consent_news = false where unsub_token = p_token returning true;
$$;

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

grant execute on function public.register_team, public.get_registration, public.cancel_registration, public.erase_my_data, public.unsubscribe_news to anon, authenticated;
grant execute on function public.pair_solos, public.is_staff to authenticated;

-- ============================================================
-- Sécurité au niveau des lignes
-- ============================================================
alter table public.venues enable row level security;
alter table public.staff enable row level security;
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

create policy "soi-même" on public.staff for select to authenticated using (email = lower(auth.jwt() ->> 'email') or public.is_staff());

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
create policy "staff dépose des photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_staff());
create policy "staff gère les photos" on storage.objects for update to authenticated using (bucket_id = 'photos' and public.is_staff());
create policy "staff supprime des photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_staff());
