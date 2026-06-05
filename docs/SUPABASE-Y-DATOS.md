# Supabase: datos, guardado automático y keep-alive

## Cómo funciona ahora (resumen)

- La app arranca **precargada con el pensum real** (PENSUM 2023-01: 86 materias en
  10 semestres + 45 profesores). El usuario puede editar, agregar o borrar.
- **Todo lo que cargue/edite se guarda solo en Supabase**, tras cada cambio y al cerrar
  la app. No hay botón ni menú de "Sincronizar": es automático e invisible. Si no
  hay internet, sigue funcionando local y sube al reconectar.
- Al abrir, la app **baja** lo último de la nube y lo **fusiona por fila**
  (newest-wins con borrado lógico), así varias PCs comparten datos sin pisarse.
- La nube usa un **esquema relacional normalizado** (tablas de verdad, no JSON en
  una columna). Una **GitHub Action** la consulta cada pocos días para que el
  proyecto de Supabase (plan free) **no se pause** por inactividad.

---

## 1. Crear el esquema (una sola vez)

En Supabase → **SQL Editor** → pegá y ejecutá el contenido de
[`docs/supabase-schema.sql`](./supabase-schema.sql).

Crea las tablas:

| Tabla                | Para qué                                            |
| -------------------- | --------------------------------------------------- |
| `professors`         | Profesores (id, nombre, título, tipo, …)            |
| `subjects`           | Materias del pensum (código, nombre, horas, semestre) |
| `professor_subjects` | Relación M:N profesor ↔ materia                     |
| `academic_load`      | Carga académica: qué profe da teoría/lab de c/materia |
| `schedule_blocks`    | Bloques de horario                                  |
| `logs`               | Registro de actividad                               |

Cada tabla tiene `updated_at` / `deleted_at` (borrado lógico) para el merge entre
PCs, y políticas RLS que permiten a la app (anon key) leer/escribir.

> El script **borra el modelo viejo** (`app_data`, `app_versions`) al principio,
> así que con ejecutarlo queda todo limpio y en blanco.

---

## 2. Keep-alive (que la base no se borre)

El plan free de Supabase **pausa** el proyecto tras ~7 días sin actividad. El
workflow [`.github/workflows/supabase-keepalive.yml`](../.github/workflows/supabase-keepalive.yml)
consulta la base cada 3 días desde GitHub (no depende de abrir la app).

Para que funcione, agregá dos **Secrets** en el repo:

GitHub → repo **Farmabox** → **Settings** → **Secrets and variables** → **Actions**
→ **New repository secret**:

| Nombre              | Valor                                   |
| ------------------- | --------------------------------------- |
| `SUPABASE_URL`      | `https://TU-PROYECTO.supabase.co`       |
| `SUPABASE_ANON_KEY` | la anon/publishable key del proyecto    |

(Son los mismos valores de `src/electron/secrets.plain.json`.)

Para probarlo sin esperar: pestaña **Actions** → *Supabase keep-alive* → **Run workflow**.

---

## 3. Dos modos de almacenamiento (elegís en Configuración)

En **Configuración → Almacenamiento** podés elegir dónde se guardan/comparten los datos:

- **Nube (Supabase)** — por defecto. Las PCs se sincronizan por internet (sirve estén
  donde estén). Necesita el esquema de arriba + el keep-alive.
- **Carpeta compartida (red local)** — elegís una carpeta compartida de Windows
  (`\\PC\Farmabox`) o una unidad de red (`Z:\`). La app guarda ahí los datos en JSON con
  el mismo merge por ítem (no se pierde nada entre PCs). **No necesita internet ni Supabase**,
  solo que la carpeta esté accesible en la red local. Ideal para la facultad.

El cambio se aplica al **reiniciar** la app. Si la carpeta compartida está configurada,
la app la usa; si no, usa Supabase.

> Nota: la carpeta compartida usa archivos JSON con escritura atómica y read-merge-write,
> así que es robusta para uso normal. Si dos PCs guardan el **mismo** ítem en el mismo
> instante, puede ganar una; para concurrencia intensa, la base de datos (Supabase) es lo más sólido.

## 4. ¿Por qué cambió el esquema?

El diseño anterior guardaba los 5 datasets como **5 filas con todo el array metido
en una columna `jsonb`** (`app_data`). Eso no es relacional: no se puede consultar
por profesor/materia/semestre, ni poner constraints, índices o relaciones. El nuevo
esquema es 3FN: una fila por entidad, columnas tipadas y tablas de unión para las
relaciones M:N.
