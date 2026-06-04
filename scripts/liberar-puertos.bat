@echo off
echo ===================================================
echo     Liberador de Puertos (Fuerza Bruta)
echo ===================================================
echo.
echo Matando procesos huérfanos de Node.js (backend) y Vite (frontend)...
taskkill /F /IM node.exe /T >nul 2>&1
echo.
echo Los puertos 3001, 5173 y 5174 han sido liberados con exito.
echo Ya puedes abrir tu terminal y ejecutar normalmente:
echo   npm run dev
echo.
pause
