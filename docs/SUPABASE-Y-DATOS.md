# Supabase: datos, guardado automático y keep-alive

## Cómo funciona ahora (resumen)

- La app arranca **sin materias ni profesores**: los carga el usuario.
- **Todo lo que cargue se guarda solo en Supabase** (tabla `app_data`), tras cada
  cambio y al cerrar la app. No hay botón ni menú de "Sincronizar": es automático
  e invisible. Si no hay internet, sigue funcionando local y sube al reconectar.
- Al abrir, la app **baja** lo último de la nube y lo fusiona (varias PCs comparten datos).
- Una **GitHub Action** consulta la base cada pocos días para que el proyecto de
  Supabase (plan free) **no se pause** por inactividad.

---

## 1. Tabla `app_data` (una sola vez)

En Supabase → **SQL Editor** → pegá y ejecutá:

```sql
create table if not exists app_data (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

alter table app_data enable row level security;

-- La app usa la anon key (sin login): permitir lectura/escritura anónima.
drop policy if exists "anon_all_app_data" on app_data;
create policy "anon_all_app_data" on app_data
  for all using (true) with check (true);
```

## 2. Vaciar los datos viejos de prueba (IMPORTANTE)

Si durante las pruebas se subieron las materias/profesores precargados, hay que
borrarlos de la nube; si no, la app los vuelve a bajar al abrir.

```sql
delete from app_data;
```

(Opcional, si existe de versiones anteriores) borrar el historial que ya no se usa:

```sql
drop table if exists app_versions;
```

Después de esto: la app arranca en blanco, el usuario carga materias y profesores
con sus horas correctas, y eso queda guardado en `app_data`.

---

## 3. Keep-alive (que la base no se borre)

El plan free de Supabase **pausa** el proyecto tras ~7 días sin actividad. El
workflow [`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml)
le hace una consulta cada 3 días desde GitHub (no depende de abrir la app).

Para que funcione, agregá dos **Secrets** en el repo:

GitHub → repo **Farmabox** → **Settings** → **Secrets and variables** → **Actions**
→ **New repository secret**:

| Nombre              | Valor                                   |
| ------------------- | --------------------------------------- |
| `SUPABASE_URL`      | `https://TU-PROYECTO.supabase.co`       |
| `SUPABASE_ANON_KEY` | la anon/publishable key del proyecto    |

(Son los mismos valores de `src/electron/secrets.plain.json`.)

Para probarlo sin esperar: pestaña **Actions** → *Supabase keep-alive* → **Run workflow**.
```
