-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  URGENTE — Bajar el consumo de mensajes Realtime                            ║
-- ║  Correr en Supabase → SQL Editor. Efecto INMEDIATO en toda la flota.        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
--
-- Situación (aviso de Supabase del 2026-09-06): 11.472.335 mensajes Realtime
-- contra un límite de 2.200.000. El período de gracia se acortó al 9 de septiembre.
--
-- CAUSA MEDIDA: `pushRemote` sube TODAS las filas en cada push, no solo las que
-- cambiaron: 494 profesores + 128 materias + 116 vínculos + 124 de carga +
-- 1.877 bloques + 5.126 logs ≈ 7.865 filas por push. El trigger newest-wins solo
-- rechaza sellos MÁS VIEJOS, así que acepta los iguales, incrementa `version` y
-- Postgres emite un mensaje Realtime por fila A CADA PC CONECTADA. Se ve en los
-- datos: hay bloques con `version = 468` cuyo `updated_at` sigue siendo de junio,
-- o sea 468 reescrituras que no cambiaron nada.
--
-- Cambios REALES en los últimos 7 días: 7 profesores, 8 materias, 231 bloques,
-- 4 de carga, 2 logs. Todo lo demás era ruido.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ POR QUÉ ESTO PRIMERO: el arreglo de fondo va en la app (que solo suba lo  │
-- │ que cambió) y necesita que TODAS las PCs se actualicen. Esto, en cambio,  │
-- │ actúa del lado del servidor y surte efecto al instante para toda la       │
-- │ flota, esté en la versión que esté.                                       │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ── Sacar `logs` de la publicación Realtime ─────────────────────────────────
-- Es la tabla más grande (5.126 de las 7.865 filas por push = 65% de los
-- mensajes) y es la que MENOS necesita tiempo real: es un historial de
-- auditoría. Nadie mira los logs de otra PC en vivo.
--
-- Qué se pierde: los logs de otras PCs dejan de llegar al instante. Siguen
-- llegando en la sincronización periódica. La app NO se rompe: si la tabla no
-- está en la publicación, la suscripción simplemente nunca recibe eventos de
-- esa tabla (las demás siguen funcionando igual).
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'logs'
  ) then
    execute 'alter publication supabase_realtime drop table public.logs;';
    raise notice 'logs retirada de supabase_realtime (-65%% de mensajes)';
  else
    raise notice 'logs ya no estaba en la publicacion';
  end if;
end $$;

-- ── Sacar los vínculos de la publicación Realtime ───────────────────────────
-- `professor_subjects` y `academic_load` cambian junto con los profesores y las
-- materias, que SÍ quedan en vivo. Notificar las tres cosas por separado
-- triplica los mensajes para el mismo evento de usuario.
do $$
declare t text;
begin
  foreach t in array array['professor_subjects','academic_load']
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I;', t);
      raise notice '% retirada de supabase_realtime', t;
    end if;
  end loop;
end $$;

-- ── Lo que QUEDA en vivo (lo que de verdad se edita entre PCs) ──────────────
--   schedule_blocks · professors · subjects · admin_hours
--   notifications · suggestions
-- Con eso, editar un horario en una PC se sigue viendo en las otras en ~1 s.

-- ── Verificación ────────────────────────────────────────────────────────────
select tablename as "tablas que siguen en Realtime"
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
  order by tablename;
