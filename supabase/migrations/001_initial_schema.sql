create extension if not exists pg_cron;

create table public.handicap_tiers (
  name text primary key,
  baseline_elo integer not null,
  sort_order integer not null unique
);

insert into public.handicap_tiers (name, baseline_elo, sort_order) values
  ('Pro', 2000, 1),
  ('A+', 1800, 2),
  ('A1', 1700, 3),
  ('A2', 1600, 4),
  ('A3', 1500, 5),
  ('B1', 1400, 6),
  ('B2', 1300, 7),
  ('B3', 1200, 8),
  ('B-', 1100, 9)
on conflict (name) do update set baseline_elo = excluded.baseline_elo, sort_order = excluded.sort_order;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  visible_tier text not null references public.handicap_tiers(name),
  background_elo numeric(8, 2) not null,
  tournament_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null default now(),
  player_a_id uuid not null references public.players(id),
  player_b_id uuid not null references public.players(id),
  winner_id uuid not null references public.players(id),
  player_a_old_elo numeric(8, 2) not null,
  player_b_old_elo numeric(8, 2) not null,
  player_a_new_elo numeric(8, 2) not null,
  player_b_new_elo numeric(8, 2) not null,
  expected_a numeric(8, 6) not null,
  expected_b numeric(8, 6) not null,
  check (player_a_id <> player_b_id),
  check (winner_id in (player_a_id, player_b_id))
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue text,
  played_on date not null,
  created_at timestamptz not null default now()
);

create table public.tournament_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.players(id),
  placement integer not null check (placement > 0),
  points_awarded integer not null default 0,
  unique (tournament_id, player_id)
);

create table public.tier_change_log (
  id uuid primary key default gen_random_uuid(),
  processed_at timestamptz not null default now(),
  player_id uuid not null references public.players(id),
  old_tier text not null references public.handicap_tiers(name),
  new_tier text not null references public.handicap_tiers(name),
  elo_at_processing numeric(8, 2) not null
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_touch_updated_at
before update on public.players
for each row execute function public.touch_updated_at();

create or replace function public.points_for_placement(placement integer)
returns integer language sql immutable as $$
  select case when placement = 1 then 100 when placement = 2 then 70 when placement = 3 then 50 else 0 end;
$$;

create or replace function public.apply_tournament_points()
returns trigger language plpgsql as $$
begin
  new.points_awarded := public.points_for_placement(new.placement);
  update public.players
  set tournament_points = tournament_points + new.points_awarded
  where id = new.player_id;
  return new;
end;
$$;

create trigger tournament_results_apply_points
before insert on public.tournament_results
for each row execute function public.apply_tournament_points();

create or replace function public.record_match(
  player_a uuid,
  player_b uuid,
  winner uuid,
  played_at timestamptz default now()
)
returns public.matches language plpgsql security definer as $$
declare
  player_a_elo numeric(8, 2);
  player_b_elo numeric(8, 2);
  expected_a numeric(8, 6);
  expected_b numeric(8, 6);
  new_a numeric(8, 2);
  new_b numeric(8, 2);
  score_a integer;
  score_b integer;
  inserted_match public.matches;
begin
  if player_a = player_b then
    raise exception 'Players must be different';
  end if;
  if winner not in (player_a, player_b) then
    raise exception 'Winner must be player_a or player_b';
  end if;

  select background_elo into player_a_elo from public.players where id = player_a for update;
  select background_elo into player_b_elo from public.players where id = player_b for update;

  if player_a_elo is null or player_b_elo is null then
    raise exception 'Both players must exist';
  end if;

  expected_a := 1 / (1 + power(10, (player_b_elo - player_a_elo) / 400));
  expected_b := 1 / (1 + power(10, (player_a_elo - player_b_elo) / 400));
  score_a := case when winner = player_a then 1 else 0 end;
  score_b := case when winner = player_b then 1 else 0 end;
  new_a := round(player_a_elo + 20 * (score_a - expected_a), 2);
  new_b := round(player_b_elo + 20 * (score_b - expected_b), 2);

  update public.players set background_elo = new_a where id = player_a;
  update public.players set background_elo = new_b where id = player_b;

  insert into public.matches (
    played_at, player_a_id, player_b_id, winner_id, player_a_old_elo, player_b_old_elo,
    player_a_new_elo, player_b_new_elo, expected_a, expected_b
  ) values (
    played_at, player_a, player_b, winner, player_a_elo, player_b_elo,
    new_a, new_b, expected_a, expected_b
  ) returning * into inserted_match;

  return inserted_match;
end;
$$;

create or replace function public.evaluate_monthly_tier(current_tier text, rating numeric)
returns text language plpgsql stable as $$
declare
  current_order integer;
  current_baseline integer;
  promotion text;
  demotion text;
begin
  select sort_order, baseline_elo into current_order, current_baseline
  from public.handicap_tiers where name = current_tier;

  select name into promotion
  from public.handicap_tiers
  where sort_order < current_order and rating >= baseline_elo
  order by sort_order
  limit 1;

  if promotion is not null then
    return promotion;
  end if;

  if rating < current_baseline - 50 then
    select name into demotion
    from public.handicap_tiers
    where sort_order > current_order
      and (rating >= baseline_elo - 50 or sort_order = (select max(sort_order) from public.handicap_tiers))
    order by sort_order
    limit 1;
    return coalesce(demotion, current_tier);
  end if;

  return current_tier;
end;
$$;

create or replace function public.process_monthly_tiers()
returns integer language plpgsql security definer as $$
declare
  changed_count integer;
begin
  with evaluated as (
    select id, visible_tier as old_tier, public.evaluate_monthly_tier(visible_tier, background_elo) as new_tier, background_elo
    from public.players
  ), changed as (
    update public.players p
    set visible_tier = e.new_tier
    from evaluated e
    where p.id = e.id and e.old_tier <> e.new_tier
    returning p.id, e.old_tier, e.new_tier, e.background_elo
  )
  insert into public.tier_change_log (player_id, old_tier, new_tier, elo_at_processing)
  select id, old_tier, new_tier, background_elo from changed;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

select cron.schedule(
  'hcelo-monthly-tier-processing',
  '0 2 1 * *',
  $$select public.process_monthly_tiers();$$
);
