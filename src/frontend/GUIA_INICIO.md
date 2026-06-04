# 🚀 Guía de Inicio - Sistema de Horarios USM

## ✅ Tailwind CSS Instalado Correctamente

Tailwind CSS ya está instalado y configurado en tu proyecto. Ahora sigue estos pasos:

## 📋 Pasos para Ejecutar el Proyecto

### 1. Navegar al directorio del frontend

```bash
cd "C:\Users\euger\Desktop\Servicio Comunitario\project-skeleton\src\frontend"
```

### 2. Verificar que todas las dependencias estén instaladas

```bash
npm install
```

Esto asegurará que todas las dependencias necesarias (incluyendo Tailwind, PostCSS, etc.) estén instaladas.

### 3. Iniciar el servidor de desarrollo

```bash
npm run dev
```

Esto iniciará Vite en modo desarrollo, generalmente en `http://localhost:5173`

### 4. Abrir en el navegador

Abre tu navegador y ve a la URL que aparece en la terminal (generalmente `http://localhost:5173`)

## 🔍 Verificación de que Todo Funciona

Cuando el servidor esté corriendo, deberías ver:

1. ✅ Una barra lateral (sidebar) a la izquierda con el menú de navegación
2. ✅ Un header en la parte superior con el título y opciones
3. ✅ El contenido principal con la tabla de horarios
4. ✅ Colores y estilos aplicados correctamente (fondos grises claros, texto oscuro)

## 🛠️ Si Algo No Funciona

### Problema: Los estilos no se ven

1. **Detén el servidor** (Ctrl+C)
2. **Limpia la caché de Vite**:
   ```bash
   rmdir /s /q node_modules\.vite
   ```
3. **Reinicia el servidor**:
   ```bash
   npm run dev
   ```

### Problema: Errores en la consola del navegador

1. Abre las DevTools (F12)
2. Revisa la pestaña "Console" para ver los errores
3. Si hay errores de importación, verifica que todos los archivos existan

### Problema: Tailwind no está aplicando clases

1. Verifica que `postcss.config.js` exista en la raíz del frontend
2. Verifica que `tailwind.config.js` esté configurado correctamente
3. Verifica que `src/index.css` tenga las directivas `@tailwind` al inicio

## 📁 Estructura de Archivos Importante

```
src/frontend/
├── postcss.config.js      ← Configuración de PostCSS (debe existir)
├── tailwind.config.js     ← Configuración de Tailwind
├── src/
│   ├── index.css          ← Debe tener @tailwind al inicio
│   ├── main.tsx           ← Debe importar ./index.css
│   └── App.tsx            ← Componente principal
```

## 🎨 Características del Sistema

- ✅ **Sidebar navegable** con animaciones
- ✅ **Header con búsqueda** y notificaciones
- ✅ **Tabla de horarios interactiva** con formato oficial
- ✅ **Edición inline** de profesores y aulas
- ✅ **Diseño responsive** para web y Electron

## 🚀 Comandos Disponibles

```bash
# Desarrollo
npm run dev              # Inicia servidor de desarrollo

# Producción
npm run build            # Compila para producción
npm run preview          # Previsualiza la build

# Calidad de código
npm run lint             # Verifica código
npm run format           # Formatea código (si tienes prettier configurado)
```

## 📝 Próximos Pasos

1. Ejecuta `npm run dev` para ver la aplicación
2. Explora las diferentes secciones del menú lateral
3. Prueba crear un horario seleccionando materias y haciendo clic en la tabla
4. Edita la información de profesores usando el botón de editar en la tabla de cursos

¡Todo está listo para empezar! 🎉
