-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Farmabox — Migración 2.7: horas administrativas compartidas       ║
-- ║  (tabla admin_hours + newest-wins + Realtime)                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- Ejecutar UNA vez en Supabase → SQL Editor. Es IDEMPOTENTE (se puede repetir).
--
-- Qué resuelve: hasta v2.3.15 las "horas administrativas" de cada profesor se
-- guardaban SOLO en el localStorage de cada PC → no se veían en las demás
-- máquinas. Desde v2.3.16 la app las sincroniza por esta tabla (merge por id,
-- newest-wins con tombstones, igual que el resto de los datos).
--
-- Degradación segura: si NO corres esta migración, la app sigue funcionando
-- como en v2.3.15 (horas administrativas locales por PC, sin sincronizar).

-- ── 1. Tabla ────────────────────────────────────────────────────────────────
create table if not exists admin_hours (
  id         text primary key,
  professor_id text not null,
  role       text not null,
  day        integer not null,          -- 0=Lunes … 4=Viernes
  start_hour integer not null,          -- franja (0 = 7:00)
  duration   integer not null,          -- franjas de 45 min
  updated_at timestamptz,
  deleted_at timestamptz,
  version    integer not null default 1
);

-- RLS queda como en el resto de las tablas del proyecto (abierto; seguridad diferida).
alter table admin_hours disable row level security;

-- ── 2. Bloqueo optimista newest-wins (mismo trigger de la migración 2.3) ────
-- Si la función no existe aún (migración 2.3 sin correr), se crea aquí igual.
create or replace function farmabox_guard_newest_wins()
returns trigger
language plpgsql
as $$
begin
  if NEW.updated_at is not null and OLD.updated_at is not null
     and NEW.updated_at < OLD.updated_at then
    return OLD;
  end if;
  NEW.version := coalesce(OLD.version, 0) + 1;
  return NEW;
end;
$$;

drop trigger if exists trg_newest_wins on admin_hours;
create trigger trg_newest_wins before update on admin_hours
  for each row execute function farmabox_guard_newest_wins();

-- ── 3. Realtime (cambios de otras PCs en ~1 s) ──────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_hours'
  ) then
    execute 'alter publication supabase_realtime add table public.admin_hours;';
  end if;
end $$;

-- ── Verificación rápida (opcional) ──────────────────────────────────────────
-- select * from admin_hours limit 5;
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
