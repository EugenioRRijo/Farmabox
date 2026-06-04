# 🚀 Cómo publicar una actualización de Farmabox

La app se **actualiza sola** (electron-updater): al abrir, revisa el repo de releases,
descarga la versión nueva y la aplica al reiniciar. Vos solo "publicás".

---

## Configuración (una sola vez)

### 1. Crear el repo PÚBLICO de releases
En GitHub → **New repository**:
- Nombre: **`Farmabox-releases`**
- Visibilidad: **Public** (el código sigue en el repo privado `Farmabox`; este solo guarda los instaladores)
- **No** agregues README ni nada → **Create repository**

> Tiene que ser público para que la app pueda bajar la actualización sin necesidad de
> meter un token dentro del `.exe`. El instalador igual lo distribuís, así que no expone nada sensible.

### 2. Crear un token de GitHub (para subir releases)
GitHub → Settings → Developer settings → **Personal access tokens** → *Fine-grained* (o classic con scope `public_repo`).
- Acceso de escritura al repo `Farmabox-releases`.
- Copiá el token.

---

## Publicar una versión nueva (cada vez)

Desde la carpeta del proyecto (`fuente-recuperado`):

```bash
# 1. Subir el número de versión (en src/electron/package.json)
npm version patch --workspace=src/electron     # 1.0.0 → 1.0.1  (o "minor" / "major")

# 2. Compilar todo + dejar el frontend listo para empaquetar
npm run build --workspaces
rm -rf src/electron/frontend && mkdir src/electron/frontend && cp -r src/frontend/dist/* src/electron/frontend/

# 3. Publicar (sube instalador + latest.yml al repo de releases)
#    PowerShell:
$env:GH_TOKEN="TU_TOKEN_DE_GITHUB"
npm run package --workspace=src/electron -- --publish always
```

Eso crea un **Release** en `Farmabox-releases` con el `.exe` + `latest.yml`.
**Todas las PC se actualizan solas** la próxima vez que abran Farmabox.

> Requisitos del empaquetado (igual que la primera vez): tener `secrets.enc` generado
> (`node scripts/encrypt-secrets.cjs` desde `secrets.plain.json`) y correr la terminal
> como Administrador (o con Modo Desarrollador) por el tema de los symlinks de winCodeSign.

---

## Qué ve el usuario
- Nada al principio: la descarga es en segundo plano.
- Cuando la actualización está lista, aparece: **"Farmabox X.Y.Z está lista — ¿Reiniciar ahora?"**.
- Si elige "Más tarde", se aplica sola al cerrar la app.

## Nota
Como la app no está firmada, Windows puede mostrar SmartScreen al aplicar el update
(igual que en la instalación). Con un certificado de firma (ej. Azure Trusted Signing)
desaparece y queda 100% silencioso.
