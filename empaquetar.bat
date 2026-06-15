@echo off
REM ============================================================
REM  Farmabox - Empaquetar instalador (.exe) de un clic
REM  Hace TODO: compila, copia el frontend y genera el instalador.
REM  IMPORTANTE: ejecutar como ADMINISTRADOR (clic derecho ->
REM  "Ejecutar como administrador") por los symlinks de electron-builder.
REM ============================================================
cd /d "%~dp0"
echo.
echo === [1/3] Compilando frontend + electron + shared ===
call npm run build --workspaces
if %errorlevel% neq 0 (
    echo.
    echo  FALLO al compilar. Revisa los errores de arriba.
    pause
    exit /b 1
)

echo.
echo === [2/3] Copiando el frontend compilado al instalador ===
if exist "src\electron\frontend" rmdir /s /q "src\electron\frontend"
mkdir "src\electron\frontend"
xcopy /e /i /y "src\frontend\dist\*" "src\electron\frontend\" >nul
if %errorlevel% neq 0 (
    echo.
    echo  FALLO al copiar el frontend.
    pause
    exit /b 1
)

echo.
echo === [3/3] Generando el instalador (.exe) ===
call npm run package --workspace=src/electron
if %errorlevel% neq 0 (
    echo.
    echo  FALLO al empaquetar.
    echo  Solucion comun: ejecutar este .bat como ADMINISTRADOR,
    echo  o activar el "Modo de desarrollador" en Windows.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  LISTO! El instalador esta en:
echo     src\electron\dist-installer\Farmabox-Setup-2.3.3.exe
echo  (el numero de version sale de src\electron\package.json)
echo ============================================================
pause
