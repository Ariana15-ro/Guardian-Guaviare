create table if not exists public.notified_hotspots (
  id text primary key,
  notified_at timestamptz not null default now()
);

create index if not exists notified_hotspots_notified_at_idx
  on public.notified_hotspots (notified_at);

alter table public.notified_hotspots enable row level security;

revoke all privileges on table public.notified_hotspots from public, anon, authenticated;
grant all privileges on table public.notified_hotspots to service_role;

-- Opcional: ejecutar periódicamente para borrar registros de deduplicación con más de 7 días.
-- delete from public.notified_hotspots where notified_at < now() - interval '7 days';
