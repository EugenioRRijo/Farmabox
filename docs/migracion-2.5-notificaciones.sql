-- Migración 2.5 — tabla de notificaciones (mensajes del maestro a todas las PCs).
-- Independiente de los horarios. RLS se deja abierto como el resto (seguridad diferida).
create table if not exists notifications (
  id         text primary key,
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz
);

-- Realtime: que las PCs reciban cambios en vivo. Si ya está en la publicación, ignora el error.
do $$
begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;
