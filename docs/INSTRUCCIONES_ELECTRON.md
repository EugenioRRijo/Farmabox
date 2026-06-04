# 🚀 Instrucciones para Ejecutar Electron

## Estado Actual

✅ **La app Electron está actualizada** y ahora detecta automáticamente el puerto donde corre Vite (5173, 5174, 5175, 5176, etc.)

## Cómo Ejecutar Electron con el Frontend Actualizado

### Opción 1: Ejecutar en Dos Terminales (Recomendado)

**Terminal 1 - Frontend:**
```bash
cd "C:\Users\euger\Desktop\Servicio Comunitario\project-skeleton"
npm run dev:frontend
```

**Terminal 2 - Electron (en otra ventana):**
```bash
cd "C:\Users\euger\Desktop\Servicio Comunitario\project-skeleton"
npm run dev:electron
```

### Opción 2: Desde la Raíz del Proyecto

Asegúrate de que el frontend esté corriendo primero, luego ejecuta Electron:

```bash
# Paso 1: Iniciar frontend (ya debería estar corriendo en puerto 5176)
npm run dev:frontend

# Paso 2: En otra terminal, iniciar Electron
npm run dev:electron
```

## ✅ Mejoras Implementadas

1. **Detección automática de puerto**: Electron ahora busca Vite en los puertos 5173-5178
2. **Mejor manejo de errores**: Muestra mensajes claros si no encuentra el servidor
3. **Espera inteligente**: Electron espera a que el servidor esté listo antes de cargar
4. **Ventana mejorada**: Tamaño mínimo, fondo gris claro, mejor título

## 🔍 Verificación

Cuando ejecutes Electron, deberías ver en la consola:

```
Application starting...
App ready, creating window...
Found Vite server on port 5176
Vite dev server is ready at http://localhost:5176
Loaded Electron window from http://localhost:5176
```

## 🐛 Si Hay Problemas

### Problema: Electron no encuentra el servidor

**Solución:** Asegúrate de que el frontend esté corriendo ANTES de ejecutar Electron.

1. Verifica que veas esto en la terminal del frontend:
   ```
   ➜  Local:   http://localhost:517X/
   ```

2. Luego ejecuta Electron

### Problema: La ventana se abre pero está en blanco

**Solución:** 
1. Abre DevTools en Electron (Ctrl+Shift+I o Cmd+Option+I)
2. Revisa la consola para ver errores
3. Verifica que el URL en la consola de Electron sea el mismo que donde corre Vite

### Problema: Error de compilación de TypeScript

**Solución:**
```bash
cd src/electron
npm run build
```

## 📝 Notas

- Electron carga directamente desde el servidor de desarrollo de Vite (Hot Module Replacement funciona)
- En producción, Electron carga desde los archivos compilados en `frontend/dist`
- Los DevTools se abren automáticamente en modo desarrollo

## 🎯 Próximos Pasos

1. ✅ Frontend corriendo en puerto 5176
2. ✅ Electron actualizado para detectar puerto automáticamente
3. 🚀 Ejecuta `npm run dev:electron` para ver la app completa

¡Todo listo! 🎉
