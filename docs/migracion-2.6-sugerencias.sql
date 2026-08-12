-- Migración 2.6 — caja de sugerencias (cualquier PC reporta error/mejora; el maestro las lee).
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
