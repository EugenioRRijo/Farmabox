-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Farmabox — Migración 2.4: Salón por bloque                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- Ejecutar UNA vez en Supabase → SQL Editor. Idempotente y seguro.
--
-- Agrega la columna `aula` (texto libre: "F1", "F2", "Aula 209"…) a cada bloque de
-- horario, para que dos bloques de la MISMA materia puedan tener salones distintos
-- (imprime "F1 y F2", no "F1 y F1").
--
-- Degradación segura: sin esta columna la app sigue funcionando; el salón por bloque
-- se guarda solo LOCAL (el cliente omite la columna con `stripBlockAula`). Al correr
-- esta migración, el salón empieza a sincronizarse entre PCs.

alter table schedule_blocks add column if not exists aula text;

-- Verificación (opcional):
--   select column_name from information_schema.columns
--     where table_name = 'schedule_blocks' and column_name = 'aula';
