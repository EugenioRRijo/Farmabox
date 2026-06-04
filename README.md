# Servicio Comunitario - Sistema de Gestión de Horarios Académicos

**Universidad Santa María - Facultad de Ingeniería**  
**Autor**: Eugenio Rafael Rijo Ribeiro (C.I. 28.319.083)  
**Proyecto**: Desarrollo de Aplicación Híbrida (Desktop/Web) para Gestión de Horarios Offline

---

## 📖 Descripción del Proyecto

Este proyecto es un sistema multiplataforma diseñado específicamente para la gestión eficiente y libre de errores de horarios académicos. Creado como parte del Servicio Comunitario para la **Universidad Santa María**, centraliza la planificación de recursos, profesores y asignaturas con un enfoque estricto en la prevención de solapamientos (colisiones).

### ✨ Características Principales

- ✅ **Gestión Completa de Horarios**: Creación, edición y visualización intuitiva de bloques académicos.
- ✅ **Detección Estricta de Colisiones (Tolerancia Cero)**: El sistema bloquea inmediatamente cualquier intento de asignar múltiples clases a un mismo profesor o en una misma aula simultáneamente.
- ✅ **Importación y Exportación de Datos**: Soporte para formatos Excel con altísima fidelidad al formato original, facilitando la transición desde herramientas clásicas.
- ✅ **Seguridad y Privacidad**: Base de datos local cifrada utilizando AES/SQLCipher para salvaguardar la información sensible de la facultad y el cuerpo docente.
- ✅ **100% Offline-First**: La aplicación no requiere conexión a internet para funcionar, asegurando disponibilidad total y sincronización manual cuando sea necesario.

---

## 🏗 Arquitectura y Estructura del Proyecto

El proyecto está construido como un **Monorepo** para compartir fácilmente tipos, lógica de negocio y configuraciones entre el Backend, Frontend y la aplicación de escritorio (Electron).

### 📂 Estructura de Directorios

```text
project-skeleton/
├── docs/                      # 📜 Documentación detallada y materiales de referencia
│   ├── referencias/           # Archivos base (pensum, horarios anteriores)
│   ├── GETTING_STARTED.md     # Guía de inicio rápido
│   └── INSTRUCCIONES_ELECTRON.md # Documentación específica para la build de Electron
├── scripts/                   # ⚙️ Scripts de automatización y configuración (ej: limpieza de puertos, sync)
├── scrum/                     # 🏃‍♂️ Metodología ágil del proyecto
│   ├── backlog/               # Product y Sprint Backlogs
│   ├── sprints/               # Planificación y seguimiento de Sprints individuales
│   ├── README.md              # Resumen general del marco ágil empleado
│   └── roles.md               # Definición de responsabilidades y equipo (USM)
├── src/                       # 💻 Código fuente principal estructurado por espacios de trabajo
│   ├── backend/               # API y Lógica de servidor interna (Node.js/Express local)
│   │   ├── data/              # Almacenamiento JSON/SQLite local y logs
│   │   ├── dist/              # Compilados del backend
│   │   ├── src/               # Controladores, rutas y servicios
│   │   └── package.json       # Dependencias exclusivas del backend
│   ├── electron/              # Proceso principal de Electron (Wrappeador de escritorio)
│   │   ├── src/               # Archivos nativos e inicialización de la ventana de SO
│   │   └── package.json       # Configuración y assets de Electron
│   ├── frontend/              # Interfaz de Usuario (React + Vite + TailwindCSS/GSAP)
│   │   ├── public/            # Archivos estáticos
│   │   ├── src/               # Componentes, Contextos, Hooks y Vistas
│   │   └── package.json       # Preferencias y dependencias web web
│   └── shared/                # Lógica compartida (Interfaces TypeScript, constantes)
├── package.json               # 📦 Configuración Root del Monorepo y Workspaces
├── package-lock.json          # Árbol de dependencias consolidado
├── tsconfig.*.json            # Reglas globales de TypeScript para todo el entorno
├── .eslintrc.* / .prettierrc  # Reglas de calidad y formateo de código
└── README.md                  # Este archivo
```

---

## 🚀 Comandos Principales (CLI)

Desde la raíz del proyecto (`project-skeleton/`), puedes usar los siguientes comandos de `npm` para gestionar el ciclo de vida del desarrollo:

### 📥 Instalación

```bash
# Instalar todas las dependencias del monorepo e indexar los workspaces
npm install
```

### 🛠 Desarrollo

```bash
# Iniciar frontend y backend en paralelo (Web Mode)
npm run dev

# Iniciar aplicación de escritorio completa
npm run dev:electron

# Iniciar componentes individuales
npm run dev:frontend        # Solo interfaz web
npm run dev:backend         # Solo lógica de backend temporal
```

### 🧪 Pruebas y Cobertura (Testing)

```bash
npm test                    # Ejecutar la suite completa de tests (Vitest)
npm run coverage            # Generar reporte estadístico de cobertura de código
```

### 🧹 Aseguramiento de Calidad (QA)

```bash
npm run lint                # Verificar código con ESLint en busca de anti-patrones
npm run format              # Formatear el código automáticamente mediante Prettier
```

### 📦 Producción (Build)

```bash
npm run build               # Realiza el build de producción para todos los entornos
npm run package             # Empaquetado final y generación de instalador .exe
```

---

## 🛠 Tecnologías Core Empleadas

- **Frontend**: React (Vite), TypeScript, Tailwind CSS, Framer Motion/GSAP.
- **Backend / Lógica Local**: Node.js, Express.js.
- **Desktop**: Electron.js.
- **Base de Datos**: SQLite motorizado por SQLCipher (offline, zero-config, cifrado robusto).
- **Herramientas de Calidad**: ESLint, Prettier, Husky, Lint-Staged.
- **Testing**: Vitest, React Testing Library.

---

## Metodología: Scrum

Este proyecto se ha ejecutado usando ciclos de vida iterativos y ágiles (Scrum adaptado para desarrollo académico individual/asistido).  
Puedes revisar en detalle nuestra gestión de incidencias, roles y sprints dirigiéndote a `scrum/README.md`.

---

## 📄 Licencia

**UNLICENSED** - Proyecto netamente de carácter académico (Servicio Comunitario Universitario, Universidad Santa María). No está pensado, bajo su forma actual, para su libre distribución comercial sin consentimiento.
