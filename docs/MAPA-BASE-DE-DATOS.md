# Mapa de la base de datos de Farmabox

> Escrito el 2026-09-04, después de auditar el proyecto real y comparar cada archivo
> contra producción. Si dudás de cuál archivo es el bueno, la respuesta está acá.

## Lo primero: hay UNA sola base de datos

Es fácil pensar que hay varias porque hay muchos archivos. No los hay:

| | Cuántos | Dónde |
|---|---|---|
| Proyectos Supabase | **1** | `eqgttmbbpkgenkdftaqs.supabase.co` |
| Bases de datos locales | **1** | `%APPDATA%\@scheduler\electron\data\` |
| Backups (fotos viejas, no bases) | 3 | `ServicioCom\backups\` |

`%APPDATA%\farmabox\` **no** es una segunda base: ahí electron-log guarda `main.log`
y nada más. Se llama distinto porque los logs usan el nombre del producto y los datos
usan el nombre del paquete npm.

---

## El archivo que importa

**`docs/esquema-completo.sql`** ← este.

Es la fuente única de verdad. Contiene las 10 tablas con todas sus columnas, los
índices, el trigger de concurrencia, Realtime y las políticas RLS. Se generó a partir
del esquema **real de producción** y está verificado columna por columna.

Sirve para dos cosas:

- **Base nueva desde cero:** pegalo en el SQL Editor y queda todo listo.
- **Base que ya existe:** pegalo igual. Es idempotente y no borra nada.

> **Por qué esto no era obvio:** `create table if not exists` no hace nada sobre una
> tabla que ya existe — ni siquiera agrega las columnas nuevas. Por eso el archivo
> repite cada columna añadida por una migración como `alter table … add column if not
> exists`. Esa es la parte que lo hace funcionar en los dos escenarios.

---

## Los archivos viejos (historial, ya no se corren)

Todos estos **ya están aplicados en producción**. Se conservan para entender cómo se
llegó hasta acá, pero no hace falta volver a correrlos: `esquema-completo.sql` los
contiene a todos.

| Archivo | Qué agregó | Estado |
|---|---|---|
| `supabase-schema.sql` | Esquema base: 7 tablas, borrado lógico, RLS | aplicado |
| `migracion-2.2.sql` | `professors.profession`, tabla `semesters`, FK de semestre | aplicado |
| `migracion-2.3-concurrencia.sql` | Columna `version` + trigger newest-wins + Realtime | aplicado |
| `migracion-2.4-salon-por-bloque.sql` | `schedule_blocks.aula` | aplicado |
| `migracion-2.5-notificaciones.sql` | Tabla `notifications` | aplicado 2026-09-04 |
| `migracion-2.6-sugerencias.sql` | Tabla `suggestions` | aplicado 2026-09-04 |
| `migracion-2.7-horas-administrativas.sql` | Tabla `admin_hours` | aplicado |
| `migracion-2.8-atribucion-equipo.sql` | `updated_by` en 5 tablas | aplicado 2026-09-04 |
| `migraciones-pendientes-2.5-2.6-2.8.sql` | Las tres de arriba juntas | ya no hace falta |

---

## Las 10 tablas

**Datos del horario** (se sincronizan entre PCs con merge newest-wins):

- `professors` — profesores. 11 columnas.
- `subjects` — pensum. 14 columnas.
- `semesters` — semestres 1 a 10. Tabla de referencia, casi nunca cambia.
- `schedule_blocks` — los bloques del horario. 16 columnas. La tabla más grande.
- `academic_load` — quién dicta la teoría y quién el lab de cada materia.
- `professor_subjects` — qué materias *puede* dictar cada profesor.
- `admin_hours` — horas administrativas por profesor.

**Auditoría:**

- `logs` — registro de actividad.

**Mensajería** (no se mergean; las escribe un solo lado):

- `notifications` — avisos que el maestro manda a todas las PCs.
- `suggestions` — la caja de sugerencias, de las PCs hacia el maestro.

---

## Cómo funciona el borrado (importante)

Casi nada se borra de verdad. Se marca con `deleted_at` — es lo que se llama un
*tombstone*, una lápida. Hace falta porque varias PCs editan sin conexión: si una fila
simplemente desapareciera, la PC que estuvo offline la volvería a subir al reconectar.
La lápida le dice "esto se borró, no lo revivas".

Por eso los números no cuadran a primera vista:

| tabla | filas totales | vivas | lápidas |
|---|---:|---:|---:|
| `schedule_blocks` | 1.877 | 307 | 1.570 |
| `professors` | 494 | 43 | 451 |

Las lápidas de junio vienen del incidente de corrupción de ese mes. No molestan a la
app, pero **sí pesan**: se re-descargan en cada sincronización.

### Dos limitaciones conocidas

1. **`academic_load` no tiene `deleted_at`.** Sus borrados se propagan por ausencia de
   la fila, no por lápida. En teoría eso permite un split-brain entre dos PCs. No se
   ha manifestado nunca, pero está anotado.
2. **`professor_subjects` no tiene ni `updated_at` ni `version`.** Es una tabla de
   unión pura: el cliente la reconstruye como conjunto a partir de los profesores
   vivos, así que no participa del merge fila por fila.

---

## Las tres carpetas de backup

Son fotos de un momento, no bases activas. Ninguna se usa en caliente:

- `backups/supabase-2026-08-03/` — volcado completo de la nube del 3 de agosto,
  paginado e **incluyendo lápidas**. Es el backup bueno para restaurar.
- `backups/datos-locales-2026-08-03/` — copia del `%APPDATA%` de esta PC ese día.
- `backups/pre-snapshot-overwrite/` — respaldo previo a sobrescribir el local. Sirve
  solo como red de seguridad de esa operación puntual.

Además hay un **backup automático diario** corriendo por GitHub Actions.

---

## Si algún día tenés que empezar de cero

1. Crear el proyecto en Supabase.
2. Correr `docs/esquema-completo.sql` completo.
3. Poner la URL y la anon key nuevas en `src/frontend/.env` y `src/maestro/.env`.
4. Restaurar los datos desde `backups/supabase-2026-08-03/` (o el backup diario más
   reciente), respetando este orden por las llaves foráneas:
   `semesters` → `professors` → `subjects` → `professor_subjects` → `academic_load` →
   `schedule_blocks` → `logs` → el resto.
