-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  FARMABOX — ESQUEMA COMPLETO DE LA BASE DE DATOS                            ║
-- ║  Fuente única de verdad. Reemplaza a supabase-schema.sql + migraciones 2.2  ║
-- ║  a 2.8, que quedan como historial.                                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
--
-- Generado el 2026-09-04 a partir del esquema REAL de producción
-- (proyecto eqgttmbbpkgenkdftaqs), verificado tabla por tabla, más los archivos
-- de migración del repo.
--
-- SIRVE PARA DOS COSAS:
--   1. Levantar un proyecto Supabase desde CERO con todo lo que la app necesita.
--   2. Correrlo sobre la base que YA existe sin romper nada ni perder datos.
--      Es IDEMPOTENTE: se puede correr las veces que haga falta.
--
-- Cómo usarlo: Supabase → SQL Editor → pegar todo → Run. Al final hay una query
-- de verificación que lista lo que quedó instalado.
--
-- ⚠️ NO borra datos. No hay ningún DROP TABLE sobre tablas en uso.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ NOTA SOBRE `create table if not exists`                                   │
-- │ En una base que ya existe, esa instrucción NO hace nada — ni siquiera     │
-- │ agrega columnas nuevas. Por eso, después de cada tabla, este archivo      │
-- │ repite cada columna añadida por una migración como                        │
-- │ `alter table … add column if not exists`. Esa es la parte que hace que    │
-- │ funcione igual en una base nueva y en la de producción.                   │
-- └──────────────────────────────────────────────────────────────────────────┘


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  1. TABLAS                                                                  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── Semestres (1..10). Va primero: schedule_blocks y subjects lo referencian ──
create table if not exists semesters (
  number      integer primary key,          -- 1..10
  name        text,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1
);
alter table semesters add column if not exists version integer not null default 1;

insert into semesters (number, name) values
  (1,'Semestre 1'),(2,'Semestre 2'),(3,'Semestre 3'),(4,'Semestre 4'),(5,'Semestre 5'),
  (6,'Semestre 6'),(7,'Semestre 7'),(8,'Semestre 8'),(9,'Semestre 9'),(10,'Semestre 10')
on conflict (number) do nothing;


-- ── Profesores ───────────────────────────────────────────────────────────────
create table if not exists professors (
  id          text primary key,
  full_name   text not null,
  title       text not null default 'Prof.',  -- Prof. | Dr. | Dra. | MSc. | Lic.
  email       text,
  cedula      text,
  profession  text,                           -- profesión, texto libre
  type        text not null default 'both',   -- theory | practice | both
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,                    -- tombstone (borrado lógico)
  version     integer not null default 1,
  updated_by  text                            -- nombre del equipo que escribió
);
alter table professors add column if not exists profession text;                       -- mig 2.2
alter table professors add column if not exists version    integer not null default 1; -- mig 2.3
alter table professors add column if not exists updated_by text;                       -- mig 2.8


-- ── Materias (pensum) ────────────────────────────────────────────────────────
create table if not exists subjects (
  code          text primary key,
  name          text not null,
  credits       integer not null default 0,
  has_lab       boolean not null default false,
  hours_theory  integer not null default 0,
  hours_lab     integer not null default 0,
  semester      integer not null default 1,
  lab_number    text,
  aula          text,                          -- aula de teoría
  prerequisites text[] not null default '{}',
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       integer not null default 1,
  updated_by    text
);
alter table subjects add column if not exists aula       text;
alter table subjects add column if not exists version    integer not null default 1; -- mig 2.3
alter table subjects add column if not exists updated_by text;                       -- mig 2.8


-- ── Profesor ↔ Materia: qué materias PUEDE dictar cada profesor ──────────────
-- Tabla de unión pura. A propósito no lleva updated_at/version/tombstone: el
-- cliente la reconstruye como conjunto a partir de los profesores vivos.
create table if not exists professor_subjects (
  professor_id text not null references professors(id) on delete cascade,
  subject_code text not null references subjects(code) on delete cascade,
  primary key (professor_id, subject_code)
);


-- ── Carga académica: profesor asignado a la teoría o al lab de una materia ───
create table if not exists academic_load (
  subject_code text not null references subjects(code) on delete cascade,
  professor_id text not null references professors(id) on delete cascade,
  role         text not null,                  -- theory | lab
  updated_at   timestamptz not null default now(),
  version      integer not null default 1,
  updated_by   text,
  primary key (subject_code, professor_id, role)
);
alter table academic_load add column if not exists version    integer not null default 1; -- mig 2.3
alter table academic_load add column if not exists updated_by text;                       -- mig 2.8
-- ⚠️ LIMITACIÓN CONOCIDA: esta tabla NO tiene `deleted_at`. Un borrado se propaga
--    por ausencia de la fila, no por tombstone. Ver docs/MAPA-BASE-DE-DATOS.md.


-- ── Bloques de horario ───────────────────────────────────────────────────────
create table if not exists schedule_blocks (
  id           text primary key,
  subject_code text,
  semester     integer references semesters(number),
  day          integer not null,               -- 0 = Lunes
  start_hour   integer not null,               -- franja; 0 = 7:00
  duration     integer not null,               -- cantidad de franjas de 45 min
  color        text,
  type         text,                           -- THEORY | LAB
  professor_id text,
  section      text,
  lab_group_id text,
  aula         text,                           -- salón de ESTE bloque
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      integer not null default 1,
  updated_by   text
);
alter table schedule_blocks add column if not exists semester   integer references semesters(number); -- mig 2.2
alter table schedule_blocks add column if not exists version    integer not null default 1;           -- mig 2.3
alter table schedule_blocks add column if not exists aula       text;                                 -- mig 2.4
alter table schedule_blocks add column if not exists updated_by text;                                 -- mig 2.8


-- ── Registro de actividad (auditoría) ────────────────────────────────────────
create table if not exists logs (
  id         text primary key,
  action     text not null,
  details    text,
  timestamp  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version    integer not null default 1
);
alter table logs add column if not exists version integer not null default 1; -- mig 2.3


-- ── Horas administrativas por profesor (migración 2.7) ───────────────────────
create table if not exists admin_hours (
  id           text primary key,
  professor_id text not null,
  role         text not null,
  day          integer not null,               -- 0=Lunes … 4=Viernes
  start_hour   integer not null,               -- franja; 0 = 7:00
  duration     integer not null,               -- franjas de 45 min
  updated_at   timestamptz,
  deleted_at   timestamptz,
  version      integer not null default 1,
  updated_by   text
);
alter table admin_hours add column if not exists updated_by text; -- mig 2.8


-- ── Notificaciones: avisos del maestro → todas las PCs (migración 2.5) ───────
create table if not exists notifications (
  id         text primary key,
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),  -- editar re-sella → vuelve a saltar
  expires_at timestamptz,                         -- pasado esto no se muestra
  deleted_at timestamptz
);


-- ── Sugerencias: canal inverso, cualquier PC → el maestro (migración 2.6) ────
create table if not exists suggestions (
  id          text primary key,
  kind        text not null default 'improvement',  -- error | improvement
  body        text not null default '',
  author      text,                                 -- opcional
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at  timestamptz
);


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  2. ÍNDICES                                                                 ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

create index if not exists idx_subjects_semester      on subjects(semester);
create index if not exists idx_schedule_blocks_day    on schedule_blocks(day);
create index if not exists idx_prof_subjects_subject  on professor_subjects(subject_code);
create index if not exists idx_academic_load_prof     on academic_load(professor_id);

-- Índices de sincronización: la app filtra y ordena por estas columnas en cada
-- pull. Con `updated_at` indexado, el pull incremental (traer solo lo que cambió)
-- no tiene que recorrer la tabla entera.
create index if not exists idx_professors_updated_at      on professors(updated_at);
create index if not exists idx_subjects_updated_at        on subjects(updated_at);
create index if not exists idx_schedule_blocks_updated_at on schedule_blocks(updated_at);
create index if not exists idx_academic_load_updated_at   on academic_load(updated_at);
create index if not exists idx_admin_hours_updated_at     on admin_hours(updated_at);
create index if not exists idx_logs_timestamp             on logs(timestamp);


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  3. BLOQUEO OPTIMISTA "NEWEST-WINS" (migración 2.3)                         ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Si llega un UPDATE cuyo `updated_at` es más viejo que el de la fila guardada,
-- se descarta en la base misma. Cierra la ventana de "lost update" cuando dos PCs
-- editan la misma fila casi a la vez: gana la más reciente, de forma atómica.

create or replace function farmabox_guard_newest_wins()
returns trigger
language plpgsql
as $$
begin
  if NEW.updated_at is not null and OLD.updated_at is not null
     and NEW.updated_at < OLD.updated_at then
    return OLD;  -- descarta ESTA fila sin abortar el resto del upsert
  end if;
  NEW.version := coalesce(OLD.version, 0) + 1;
  return NEW;
end;
$$;

do $$
declare t text;
begin
  -- professor_subjects queda fuera: no tiene updated_at ni version.
  -- notifications y suggestions también: no se mergean, las escribe un solo lado.
  foreach t in array array[
    'professors','subjects','semesters','academic_load','schedule_blocks','logs','admin_hours'
  ]
  loop
    execute format('drop trigger if exists trg_newest_wins on %I;', t);
    execute format(
      'create trigger trg_newest_wins before update on %I '
      || 'for each row execute function farmabox_guard_newest_wins();', t);
  end loop;
end $$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  4. REALTIME (cambios de otras PCs en ~1 s)                                 ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

do $$
declare t text;
begin
  foreach t in array array[
    'professors','subjects','professor_subjects','academic_load','schedule_blocks',
    'logs','admin_hours','notifications','suggestions'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  5. RLS — POLÍTICA UNIFICADA                                                ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- ⚠️ POSTURA DE SEGURIDAD ACTUAL: ABIERTA (decisión explícita, seguridad diferida).
--    La app usa la anon key sin login, y esa key es extraíble del .exe. Cualquiera
--    que la tenga puede leer y escribir todo.
--
--    Hasta ahora esto estaba inconsistente entre migraciones: el esquema base
--    ACTIVABA RLS con una política abierta, la 2.7 la DESACTIVABA, y la 2.5/2.6 ni
--    la tocaban. El efecto neto era el mismo (todo accesible) pero por tres caminos
--    distintos. Acá queda uno solo: RLS activa + política abierta explícita.
--    Así, el día que quieras cerrar, cambiás UNA política y no diez cosas sueltas.
--
--    Para endurecer más adelante: reemplazar `using (true)` por reglas sobre
--    `auth.uid()`, o exigir un passcode de app antes de escribir.
do $$
declare t text;
begin
  foreach t in array array[
    'professors','subjects','semesters','professor_subjects','academic_load',
    'schedule_blocks','logs','admin_hours','notifications','suggestions'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists anon_all on %I;', t);
    execute format('create policy anon_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  6. VERIFICACIÓN — qué quedó instalado                                      ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Deberías ver 10 tablas, 7 triggers newest-wins, 9 tablas con Realtime
-- y 10 políticas anon_all.

select 'tabla' as tipo, table_name as nombre
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('professors','subjects','semesters','professor_subjects',
                       'academic_load','schedule_blocks','logs','admin_hours',
                       'notifications','suggestions')
union all
select 'trigger newest-wins', event_object_table
  from information_schema.triggers where trigger_name = 'trg_newest_wins'
union all
select 'realtime', tablename
  from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
union all
select 'politica RLS', tablename
  from pg_policies where schemaname = 'public' and policyname = 'anon_all'
order by 1, 2;
