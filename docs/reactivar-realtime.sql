-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  Reactivar la edición en vivo                                               ║
-- ║  Correr SOLO cuando TODAS las PCs estén en v2.3.22 o superior.              ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
--
-- Deshace la pausa de emergencia de docs/urgente-pausar-realtime-total.sql.
-- Es seguro una vez que ninguna PC reescribe filas sin cambios: con v2.3.22 un
-- push que no cambió nada sube 0 filas, así que no genera mensajes.
--
-- Cómo saber que ya podés: en el dashboard de Usage, que los mensajes Realtime
-- lleven un día entero prácticamente sin subir.

do $$
declare t text;
begin
  foreach t in array array['professors','subjects','schedule_blocks']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
      raise notice '% reactivada', t;
    end if;
  end loop;
end $$;

select tablename as "en Realtime"
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
  order by tablename;
