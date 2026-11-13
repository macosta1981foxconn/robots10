-- Esquema para el sistema de administración de viajes de robots.
-- Ejecutar en el SQL Editor de Supabase o con supabase db push.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text not null default 'Usuario',
  role text not null default 'operator' check (role in ('admin', 'dispatcher', 'operator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('warehouse', 'line')),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  geofence_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites(id) on delete set null,
  name text not null,
  type text not null default 'zone',
  polygon jsonb not null,
  color text not null default '#2563eb',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sites
  add constraint sites_geofence_id_fkey
  foreign key (geofence_id) references public.geofences(id) on delete set null;

create table if not exists public.robots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  capacity_kg numeric(10,2) not null default 100 check (capacity_kg >= 0),
  battery_percent integer not null default 100 check (battery_percent between 0 and 100),
  status text not null default 'available' check (status in ('available', 'busy', 'charging', 'offline')),
  current_lat double precision,
  current_lng double precision,
  current_site_id uuid references public.sites(id) on delete set null,
  current_geofence_id uuid references public.geofences(id) on delete set null,
  load_kg numeric(10,2) not null default 0 check (load_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  origin_site_id uuid not null references public.sites(id),
  destination_site_id uuid not null references public.sites(id),
  robot_id uuid references public.robots(id) on delete set null,
  material text not null,
  weight_kg numeric(10,2) not null check (weight_kg > 0),
  priority integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'in_transit', 'arrived', 'completed', 'cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  started_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.location_updates (
  id uuid primary key default gen_random_uuid(),
  robot_id uuid not null references public.robots(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  speed double precision,
  heading double precision,
  inside_geofence_id uuid references public.geofences(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.load_assignments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  robot_id uuid not null references public.robots(id) on delete cascade,
  score numeric,
  breakdown jsonb,
  automatic boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.robot_status_events (
  id uuid primary key default gen_random_uuid(),
  robot_id uuid not null references public.robots(id) on delete cascade,
  status text not null check (status in ('en_viaje', 'esperando_viaje', 'cargando_bateria', 'descompuesto')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sites_type_active on public.sites(type, active);
create unique index if not exists sites_type_name_key on public.sites(type, name);
create index if not exists idx_geofences_active on public.geofences(active);
create index if not exists idx_robots_status on public.robots(status);
create index if not exists idx_trips_status_created on public.trips(status, created_at desc);
create index if not exists idx_trips_robot on public.trips(robot_id);
create index if not exists idx_location_updates_trip on public.location_updates(trip_id, recorded_at desc);
create index if not exists idx_location_updates_robot on public.location_updates(robot_id, recorded_at desc);
create index if not exists idx_load_assignments_trip on public.load_assignments(trip_id, created_at desc);
create index if not exists idx_robot_status_events_robot on public.robot_status_events(robot_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_sites_updated_at on public.sites;
create trigger set_sites_updated_at before update on public.sites
  for each row execute function public.set_updated_at();

drop trigger if exists set_geofences_updated_at on public.geofences;
create trigger set_geofences_updated_at before update on public.geofences
  for each row execute function public.set_updated_at();

drop trigger if exists set_robots_updated_at on public.robots;
create trigger set_robots_updated_at before update on public.robots
  for each row execute function public.set_updated_at();

drop trigger if exists set_trips_updated_at on public.trips;
create trigger set_trips_updated_at before update on public.trips
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Usuario'),
    case
      when new.raw_user_meta_data ->> 'role' in ('dispatcher', 'operator')
        then new.raw_user_meta_data ->> 'role'
      else 'operator'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.geofences enable row level security;
alter table public.robots enable row level security;
alter table public.trips enable row level security;
alter table public.location_updates enable row level security;
alter table public.load_assignments enable row level security;
alter table public.robot_status_events enable row level security;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

drop policy if exists sites_select_authenticated on public.sites;
create policy sites_select_authenticated on public.sites
  for select to authenticated using (true);

drop policy if exists geofences_select_authenticated on public.geofences;
create policy geofences_select_authenticated on public.geofences
  for select to authenticated using (true);

drop policy if exists robots_select_authenticated on public.robots;
create policy robots_select_authenticated on public.robots
  for select to authenticated using (true);

drop policy if exists trips_select_authenticated on public.trips;
create policy trips_select_authenticated on public.trips
  for select to authenticated using (true);

drop policy if exists location_updates_select_authenticated on public.location_updates;
create policy location_updates_select_authenticated on public.location_updates
  for select to authenticated using (true);

drop policy if exists load_assignments_select_authenticated on public.load_assignments;
create policy load_assignments_select_authenticated on public.load_assignments
  for select to authenticated using (true);

drop policy if exists robot_status_events_select_authenticated on public.robot_status_events;
create policy robot_status_events_select_authenticated on public.robot_status_events
  for select to authenticated using (true);

grant select on public.profiles to authenticated;
grant select on public.sites to authenticated;
grant select on public.geofences to authenticated;
grant select on public.robots to authenticated;
grant select on public.trips to authenticated;
grant select on public.location_updates to authenticated;
grant select on public.load_assignments to authenticated;
grant select on public.robot_status_events to authenticated;

-- Recarga el schema cache de PostgREST para que las tablas nuevas sean visibles por la API.
notify pgrst, 'reload schema';
