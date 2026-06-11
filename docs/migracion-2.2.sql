-- ============================================================
-- Migración Farmabox 2.2  →  correr en Supabase → SQL Editor
-- (la app es resiliente: si NO corrés esto, no se rompe nada;
--  simplemente la profesión y el FK de semestre no se guardan
--  hasta que apliques la migración).
-- ============================================================

-- 1) Profesión (texto libre) en profesores
alter table professors add column if not exists profession text;

-- 2) Semestres como TABLA INDEPENDIENTE (1..10)
create table if not exists semesters (
  number      integer primary key,
  name        text,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

insert into semesters (number, name) values
  (1,'Semestre 1'),(2,'Semestre 2'),(3,'Semestre 3'),(4,'Semestre 4'),(5,'Semestre 5'),
  (6,'Semestre 6'),(7,'Semestre 7'),(8,'Semestre 8'),(9,'Semestre 9'),(10,'Semestre 10')
on conflict (number) do nothing;

-- 3) Llave foránea (FK) del HORARIO al semestre
alter table schedule_blocks add column if not exists semester integer references semesters(number);

-- 4) RLS abierta para la tabla nueva (igual que el resto)
alter table semesters enable row level security;
drop policy if exists "anon_all_semesters" on semesters;
create policy "anon_all_semesters" on semesters for all using (true) with check (true);
