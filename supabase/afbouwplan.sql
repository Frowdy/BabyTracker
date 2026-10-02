-- =====================================================================
-- AFBOUWPLAN — alleen nieuwe tabellen; baby_events en baby_metingen
-- worden niet aangeraakt. Eén keer draaien in de Supabase SQL Editor.
-- =====================================================================

-- Het plan. Er is steeds één plan dat jullie delen: de app leest de
-- nieuwste rij. De fase schuift alleen door als iemand op een knop drukt.
create table public.afbouwplan (
  id          uuid primary key default gen_random_uuid(),
  gebruiker   uuid default auth.uid() references auth.users(id),
  startdatum  date not null default current_date,
  actief      boolean not null default true,
  fase        int  not null default 1,
  fase_start  date not null default current_date,
  extra_dagen int  not null default 0,          -- "Fase verlengen" telt hier op
  aangemaakt  timestamptz not null default now()
);

-- De dagelijkse check: één rij per dag, alles optioneel.
create table public.afbouw_signalen (
  datum      date primary key,
  gespannen  boolean not null default false,
  hard_plek  boolean not null default false,
  roodheid   boolean not null default false,
  koorts     boolean not null default false,
  notitie    text,
  gebruiker  uuid default auth.uid() references auth.users(id),
  bijgewerkt timestamptz not null default now()
);

-- Zelfde beveiliging als baby_events en baby_metingen: ingelogd mag alles.
alter table public.afbouwplan      enable row level security;
alter table public.afbouw_signalen enable row level security;

create policy ingelogd on public.afbouwplan
  for all to authenticated using (true) with check (true);
create policy ingelogd on public.afbouw_signalen
  for all to authenticated using (true) with check (true);

-- Realtime, zodat een wijziging op de andere telefoon meteen zichtbaar is.
alter publication supabase_realtime add table public.afbouwplan, public.afbouw_signalen;


-- ---------------------------------------------------------------------
-- TERUGDRAAIEN (alleen als je het afbouwplan helemaal kwijt wilt):
--   drop table public.afbouw_signalen;
--   drop table public.afbouwplan;
-- ---------------------------------------------------------------------
