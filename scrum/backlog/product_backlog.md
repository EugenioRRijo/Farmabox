# Product Backlog

## EPICS (High Priority)

### EPIC-1: Infraestructura & Seguridad

**Goal**: Sistema base con cifrado funcional

**User Stories**:

- [ ] Como administrador, quiero que mis datos estén cifrados localmente para protegerlos de accesos no autorizados
- [ ] Como desarrollador, quiero un sistema de logging centralizado para depurar errores fácilmente

### EPIC-2: Gestión de Usuarios

**Goal**: CRUD completo de usuarios académicos

**User Stories**:

- [ ] Como administrador, quiero crear/editar/eliminar profesores
- [ ] Como administrador, quiero crear/editar/eliminar alumnos
- [ ] Como administrador, quiero ver una lista de todos los usuarios

### EPIC-3: Gestión de Horarios con Detección de Colisiones

**Goal**: Creación de horarios con validación estricta

**User Stories**:

- [ ] Como administrador, quiero crear bloques de horario con profesor/aula/materia
- [ ] Como administrador, quiero que el sistema **bloquee inmediatamente** cualquier solapamiento (TOLERANCIA CERO)
- [ ] Como administrador, quiero editar horarios existentes
- [ ] Como administrador, quiero eliminar bloques de horario

### EPIC-4: Import/Export Excel

**Goal**: Fidelidad total con formato institucional

**User Stories**:

- [ ] Como administrador, quiero importar horarios desde Excel institucional
- [ ] Como administrador, quiero exportar los horarios editados en el MISMO formato Excel original

### EPIC-5: Reportes y Documentación

**Goal**: Ayuda integrada

**User Stories**:

- [ ] Como usuario, quiero acceder al manual desde la app (tecla F1)
- [ ] Como administrador, quiero generar reportes de ocupación de aulas

## Backlog Items (To be refined)

- Implementar búsqueda de horarios por profesor
- Implementar búsqueda de horarios por aula
- Vista de calendario semanal
- Notificaciones de errores visuales mejoradas
