-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Farmabox — Migración 2.3: concurrencia multi-PC                   ║
-- ║  (bloqueo optimista "newest-wins" + Realtime)                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- Ejecutar UNA vez en Supabase → SQL Editor, DESPUÉS de supabase-schema.sql.
-- Es IDEMPOTENTE: se puede correr varias veces sin romper nada.
--
-- Qué resuelve (error #7 del proyecto: "asegurar concurrencia al cargar horarios"):
--
--   1. Agrega una columna `version` (entero) a las tablas sincronizadas.
--
--   2. Instala un trigger BEFORE UPDATE que RECHAZA escrituras "viejas": si llega
--      un UPDATE cuyo `updated_at` es ANTERIOR al de la fila ya guardada, se ignora
--      (se conserva la fila más nueva) y se incrementa `version`. Esto cierra la
--      ventana de "lost update" cuando dos PCs editan la MISMA fila casi a la vez:
--      gana la más reciente, de forma ATÓMICA en la base, sin depender del orden de
--      llegada de los push. Es el "bloqueo optimista" del sistema (el `updated_at`
--      por fila que ya sella la app actúa como número de versión).
--
--   3. Habilita Realtime (publicación `supabase_realtime`) en las tablas, para que
--      los cambios de otras PCs lleguen en ~1 s en vez de esperar el pull periódico.
--
-- Degradación segura: si NO corrés esta migración, la app sigue funcionando igual
-- que antes (el cliente omite columnas/!features que la base no tenga). Lo que ganás
-- al correrla es la protección atómica contra pisados y la propagación en vivo.

-- ── 1 + 2. Columna `version` + trigger newest-wins ─────────────────────────
create or replace function farmabox_guard_newest_wins()
returns trigger
language plpgsql
as $$
begin
  -- Si la fila entrante es MÁS VIEJA que la guardada, descartar la escritura
  -- (mantener la fila más nueva). Devolver OLD cancela el cambio de ESTA fila
  -- sin abortar el resto del upsert ni reportar error al cliente.
  if NEW.updated_at is not null and OLD.updated_at is not null
     and NEW.updated_at < OLD.updated_at then
    return OLD;
  end if;
  -- Escritura aceptada → versión incremental (auditoría / observabilidad).
  NEW.version := coalesce(OLD.version, 0) + 1;
  return NEW;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['professors','subjects','academic_load','schedule_blocks','logs','semesters']
  loop
    -- Columna de versión (idempotente).
    execute format('alter table %I add column if not exists version integer not null default 1;', t);
    -- (Re)instalar el trigger BEFORE UPDATE.
    execute format('drop trigger if exists trg_newest_wins on %I;', t);
    execute format(
      'create trigger trg_newest_wins before update on %I '
      || 'for each row execute function farmabox_guard_newest_wins();', t);
  end loop;
end $$;

-- ── 3. Habilitar Realtime en las tablas sincronizadas ──────────────────────
-- (la publicación `supabase_realtime` existe por defecto en Supabase).
do $$
declare t text;
begin
  foreach t in array array['professors','subjects','professor_subjects','academic_load','schedule_blocks','logs']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- ── Verificación rápida (opcional) ─────────────────────────────────────────
-- Triggers instalados:
--   select event_object_table, trigger_name from information_schema.triggers
--     where trigger_name = 'trg_newest_wins' order by event_object_table;
-- Tablas con Realtime habilitado:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime'
--     order by tablename;
