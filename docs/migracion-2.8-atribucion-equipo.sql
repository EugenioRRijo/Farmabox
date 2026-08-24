-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Farmabox — Migración 2.8: atribución por equipo (updated_by)      ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- Ejecutar UNA vez en Supabase → SQL Editor. Es IDEMPOTENTE (se puede repetir).
--
-- Qué resuelve: cada PC firma sus escrituras con su nombre de equipo (editable en
-- la app, sin usuarios ni login). Con esta columna la app puede mostrar
-- "este cambio lo hizo PC Laboratorio hace 5 min" en la vista previa de
-- sincronización y avisar en vivo "entraron cambios de PC Laboratorio".
--
-- Degradación segura: si NO corres esta migración, la app funciona igual que
-- antes (los clientes omiten la columna si no existe), solo que sin atribución.

do $$
declare t text;
begin
  foreach t in array array['professors','subjects','academic_load','schedule_blocks','admin_hours']
  loop
    execute format('alter table %I add column if not exists updated_by text;', t);
  end loop;
end $$;

-- ── Verificación rápida (opcional) ──────────────────────────────────────────
-- select table_name from information_schema.columns
--   where column_name = 'updated_by' and table_schema = 'public' order by table_name;
