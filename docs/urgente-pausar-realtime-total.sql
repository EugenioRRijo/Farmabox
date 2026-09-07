-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  EMERGENCIA — Pausar Realtime en las tablas pesadas                         ║
-- ║  Correr YA en Supabase → SQL Editor. Efecto inmediato en TODA la flota.     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
--
-- POR QUÉ: el arreglo de la app (v2.3.22, que sube solo lo que cambió) requiere
-- que CADA PC se actualice. Mientras alguna siga en una versión vieja, sigue
-- reescribiendo 2.499 filas en cada push (494 profesores + 128 materias +
-- 1.877 bloques) y cada reescritura emite un mensaje Realtime a cada PC.
--
-- Esto se ejecuta EN EL SERVIDOR, así que corta esos mensajes al instante para
-- toda la flota, sin importar en qué versión esté cada máquina.
--
-- QUÉ SE PIERDE MIENTRAS TANTO: la edición en vivo. Un cambio de horario hecho
-- en una PC deja de aparecer en las otras en ~1 segundo y pasa a aparecer en la
-- siguiente sincronización periódica (60 s en las versiones viejas, 5 min en la
-- 2.3.22). Para un horario académico es perfectamente tolerable unos días.
--
-- QUÉ NO SE PIERDE: nada de los datos. La app está diseñada para esto — si la
-- publicación no incluye una tabla, la suscripción simplemente no recibe eventos
-- y el pull periódico sigue funcionando como red de seguridad.
--
-- ⚠️ ESTO ES TEMPORAL. Cuando TODAS las PCs estén en v2.3.22, correr
--    docs/reactivar-realtime.sql para devolver la edición en vivo.

do $$
declare t text;
begin
  foreach t in array array['professors','subjects','schedule_blocks']
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I;', t);
      raise notice '% pausada', t;
    end if;
  end loop;
end $$;

-- Quedan en vivo solo las tablas chicas de mensajería, que no pesan:
--   admin_hours · notifications · suggestions
select tablename as "siguen en Realtime (deben quedar solo 3)"
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
  order by tablename;
