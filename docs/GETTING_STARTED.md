# Guía de Ejecución

## Requisitos Previos

- **Node.js** v18 o superior
- **npm** v9 o superior

## Instalación

```bash
# 1. Clonar o navegar al directorio del proyecto
cd project-skeleton

# 2. Instalar dependencias
npm install
```

## Comandos de Desarrollo

### Frontend (Web)

```bash
npm run dev:frontend
```

Abre el navegador en: **http://localhost:5173**

### Aplicación de Escritorio (Electron)

```bash
npm run dev:electron
```

Inicia la aplicación de escritorio con hot-reload.

## Comandos de Verificación

```bash
# Ejecutar tests
npm test

# Ejecutar tests con cobertura
npm run coverage

# Verificar código (ESLint)
npm run lint

# Formatear código (Prettier)
npm run format
```

## Comandos de Producción

```bash
# Build completo
npm run build

# Generar instalador .exe (próximamente)
npm run package
```

## Estructura del Proyecto

```
project-skeleton/
├── src/
│   ├── frontend/          # React + Vite (interfaz web)
│   ├── electron/          # Electron (aplicación escritorio)
│   ├── shared/            # Lógica compartida + tipos
│   └── database/          # Esquemas SQLite
├── scrum/                 # Documentación Scrum
│   ├── backlog/           # Product Backlog
│   └── sprints/           # Sprint documentation
└── package.json
```

## Solución de Problemas

### Error: "Cannot find module"

```bash
npm install
```

### Error: "Port 5173 already in use"

```bash
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Errores de TypeScript

```bash
npx tsc --build --clean
npx tsc --build
```
