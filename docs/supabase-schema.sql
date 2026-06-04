-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Farmabox — Esquema relacional (Supabase / PostgreSQL)             ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- Reemplaza el viejo modelo key-value (tabla `app_data`, que guardaba cada
-- dataset entero como JSON en una columna). Ahora cada entidad tiene su
-- tabla con columnas tipadas; las relaciones M:N usan tablas de unión.
--
-- Borrado lógico con `deleted_at` para la sincronización offline-first
-- (varias PCs editan offline; al abrir se fusiona newest-wins por fila).
--
-- Ejecutar UNA vez en Supabase → SQL Editor.

-- ── Limpieza del modelo viejo ───────────────────────────────────────
drop table if exists app_data cascade;
drop table if exists app_versions cascade;

-- ── Profesores ──────────────────────────────────────────────────────
create table if not exists professors (
  id          text primary key,
  full_name   text not null,
  title       text not null default 'Prof.',  -- Prof. | Dr. | Dra. | MSc. | Lic.
  email       text,
  cedula      text,
  type        text not null default 'both',   -- theory | practice | both
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ── Materias (pensum) ───────────────────────────────────────────────
create table if not exists subjects (
  code          text primary key,
  name          text not null,
  credits       integer not null default 0,
  has_lab       boolean not null default false,
  hours_theory  integer not null default 0,
  hours_lab     integer not null default 0,
  semester      integer not null default 1,
  lab_number    text,
  prerequisites text[] not null default '{}',
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ── Profesor ↔ Materia (qué materias puede dictar cada profesor) ────
create table if not exists professor_subjects (
  professor_id text not null references professors(id) on delete cascade,
  subject_code text not null references subjects(code) on delete cascade,
  primary key (professor_id, subject_code)
);

-- ── Carga académica (profesor asignado a teoría/lab de una materia) ─
create table if not exists academic_load (
  subject_code text not null references subjects(code) on delete cascade,
  professor_id text not null references professors(id) on delete cascade,
  role         text not null,                 -- theory | lab
  updated_at   timestamptz not null default now(),
  primary key (subject_code, professor_id, role)
);

-- ── Bloques de horario ──────────────────────────────────────────────
create table if not exists schedule_blocks (
  id           text primary key,
  subject_code text,
  day          integer not null,              -- 0 = Lunes
  start_hour   integer not null,
  duration     integer not null,
  color        text,
  type         text,                          -- THEORY | LAB
  professor_id text,
  section      text,
  lab_group_id text,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ── Registro de actividad ───────────────────────────────────────────
create table if not exists logs (
  id         text primary key,
  action     text not null,
  details    text,
  timestamp  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── Índices útiles ──────────────────────────────────────────────────
create index if not exists idx_subjects_semester on subjects(semester);
create index if not exists idx_schedule_blocks_day on schedule_blocks(day);
create index if not exists idx_prof_subjects_subject on professor_subjects(subject_code);
create index if not exists idx_academic_load_prof on academic_load(professor_id);

-- ── RLS: la app usa la anon key (sin login) → permitir CRUD anónimo ─
do $$
declare t text;
begin
  foreach t in array array['professors','subjects','professor_subjects','academic_load','schedule_blocks','logs']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists anon_all on %I;', t);
    execute format('create policy anon_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;
