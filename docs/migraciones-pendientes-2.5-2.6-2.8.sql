-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  Farmabox — MIGRACIONES PENDIENTES (2.5 + 2.6 + 2.8)                    ║
-- ║  Pegar TODO esto en Supabase → SQL Editor → Run. Es idempotente.        ║
-- ║  Generado tras el chequeo del 2026-09-04.                               ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- ── 2.5 — Notificaciones (avisos del maestro → todas las PCs) ──────────────
create table if not exists notifications (
  id         text primary key,
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

do $$
begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;

-- ── 2.6 — Caja de sugerencias (PCs → maestro) ──────────────────────────────
create table if not exists suggestions (
  id          text primary key,
  kind        text not null default 'improvement',
  body        text not null default '',
  author      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at  timestamptz
);

do $$
begin
  alter publication supabase_realtime add table suggestions;
exception when duplicate_object then null;
end $$;

-- ── 2.8 — Atribución por equipo (columna updated_by) ───────────────────────
do $$
declare t text;
begin
  foreach t in array array['professors','subjects','academic_load','schedule_blocks','admin_hours']
  loop
    execute format('alter table %I add column if not exists updated_by text;', t);
  end loop;
end $$;

-- ── Verificación (debe devolver 3 filas: notifications, suggestions, y las
--    5 tablas con updated_by) ──────────────────────────────────────────────
select 'tabla' as que, table_name as valor from information_schema.tables
  where table_schema = 'public' and table_name in ('notifications','suggestions')
union all
select 'updated_by en', table_name from information_schema.columns
  where table_schema = 'public' and column_name = 'updated_by'
order by 1, 2;
