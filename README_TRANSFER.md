# DEADBOX — guía de transferencia

Esta carpeta contiene el código fuente editable y los recursos necesarios para ejecutar y continuar desarrollando DEADBOX en otra computadora. No es únicamente un build exportado.

## Requisitos

- Windows 10/11, macOS o una distribución Linux moderna.
- Node.js 18 o posterior. Se recomienda una versión LTS actual (20 o 22).
- npm, incluido con Node.js.
- Un navegador moderno: Chrome, Edge, Firefox o Safari.
- Editor recomendado, pero no obligatorio: Visual Studio Code.

El juego no usa framework, motor externo, base de datos ni servicios en la nube. Tampoco requiere dependencias npm de terceros. Node.js se usa para proporcionar un servidor local, ejecutar las comprobaciones y crear la carpeta `dist/`.

## Instalación

Abre una terminal en la carpeta `DEADBOX/` y ejecuta:

```bash
npm ci
```

El lockfile está incluido. Actualmente la instalación no descarga paquetes porque el proyecto no tiene dependencias externas.

También puedes usar los scripts auxiliares:

- macOS/Linux: `./setup-macos-linux.sh`
- Windows: `setup-windows.bat`

Los scripts no instalan Node.js ni modifican software del sistema.

## Ejecutar en desarrollo

```bash
npm run dev
```

Abre:

```text
http://127.0.0.1:8080
```

Atajos:

- macOS/Linux: `./start-macos-linux.sh`
- Windows: `start-windows.bat`

Aunque `index.html` puede abrirse directamente en algunos navegadores, se recomienda el servidor local. Así se evitan restricciones de archivos locales y se mantiene un origen estable para `localStorage`.

## Verificar el proyecto

```bash
npm run verify
npm test
```

`verify` comprueba archivos esenciales, referencias locales, sintaxis JavaScript y rutas problemáticas. `test` ejecuta una prueba de humo portátil del menú, inicio de partida, ciclo principal, entrada básica y dash mediante un entorno DOM/Canvas simulado.

## Crear el build

```bash
npm run build
```

El resultado se crea en `dist/`. La carpeta se regenera completamente a partir del código fuente y por eso no se incluye en el ZIP.

## Probar el build

```bash
npm run preview
```

Abre:

```text
http://127.0.0.1:4173
```

## Datos guardados

El progreso se guarda en `localStorage` del navegador. Incluye récords, opciones, idioma, Bestiary, metadatos de progresión y una partida recuperable. Los datos pertenecen al origen exacto; por ejemplo, `http://127.0.0.1:8080` y `http://localhost:8080` tienen almacenamientos separados.

No se incluye un `deadbox-save-backup.json`: el progreso personal vive en el navegador de la computadora original y no fue posible leerlo de forma segura desde los archivos del proyecto. El sistema de guardado sí está completo.

Para exportar manualmente el progreso desde la computadora original:

1. Ejecuta el juego usando la misma dirección con la que juegas normalmente.
2. Abre las herramientas de desarrollo del navegador y entra en **Console**.
3. Ejecuta:

```javascript
const keys = [
  "deadboxSaveDataV3",
  "deadboxSaveDataV3Backup",
  "deadboxRecordsV3",
  "deadboxOptionsV1",
  "deadboxBestiaryV1",
  "deadboxMetaV1",
  "deadboxLanguage",
  "deadboxHighScore",
  "deadboxHighScoreRound"
];
const backup = {
  format: "deadbox-localstorage-backup",
  version: 1,
  createdAt: new Date().toISOString(),
  origin: location.origin,
  localStorage: Object.fromEntries(
    keys.filter(key => localStorage.getItem(key) !== null)
        .map(key => [key, localStorage.getItem(key)])
  )
};
copy(JSON.stringify(backup, null, 2));
```

Pega el contenido copiado en un archivo llamado `deadbox-save-backup.json`. Este archivo contiene estadísticas personales; consérvalo de forma privada.

Para restaurarlo, abre el juego en la computadora nueva, abre la consola y ejecuta lo siguiente después de reemplazar `PEGA_AQUI_EL_JSON` por el contenido completo del archivo:

```javascript
const backup = JSON.parse(`PEGA_AQUI_EL_JSON`);
if (backup?.format !== "deadbox-localstorage-backup" || !backup.localStorage) {
  throw new Error("Invalid DEADBOX backup");
}
for (const [key, value] of Object.entries(backup.localStorage)) {
  if (typeof value === "string") localStorage.setItem(key, value);
}
location.reload();
```

## Variables de entorno

DEADBOX no utiliza variables de entorno, claves API ni secretos. `.env.example` lo documenta. Los archivos `.env` reales están excluidos por `.gitignore`.

## Problemas frecuentes

### Node.js o npm no se reconocen

Instala una versión LTS de Node.js desde su distribuidor oficial, cierra la terminal, ábrela de nuevo y comprueba:

```bash
node --version
npm --version
```

### El puerto está ocupado

Usa otro puerto:

```bash
node scripts/server.js . 8081
```

Después abre `http://127.0.0.1:8081`.

### Página en blanco

Ejecuta `npm run verify`, revisa la consola del navegador y confirma que iniciaste el servidor desde la raíz `DEADBOX/`. Los scripts clásicos dependen del orden definido en `index.html`.

### Recursos que no cargan o error CORS

No abras una copia incompleta de `index.html`. Usa `npm run dev` y conserva las carpetas `js/` y `assets/` junto al archivo HTML.

### No se escucha audio

Los navegadores bloquean audio antes de la primera interacción. Haz clic en **Play** o presiona una tecla. El audio se genera con Web Audio API; no existen archivos de sonido externos.

### El canvas no tiene el tamaño correcto

Recarga la página después de cambiar zoom o pantalla completa. Comprueba que ningún estilo externo haya alterado `#game-canvas` o sus contenedores.

### Faltan variables de entorno

No se requiere ninguna. Si una versión futura incorpora servicios, documenta sus nombres en `.env.example` y nunca empaquetes secretos.

### Diferencias entre Windows y macOS/Linux

No cambies mayúsculas/minúsculas de nombres como `js/`, `Player` o `Bestiary`. Las referencias incluidas usan `/`, que funciona en URLs en todos los sistemas.

## Carpetas regenerables excluidas

- `node_modules/`: se regenera con `npm ci`.
- `dist/`: se regenera con `npm run build`.
- cachés, logs y cobertura de pruebas.
- `.git/`: el proyecto original auditado no contenía repositorio Git.
- configuración privada de editores y archivos del sistema operativo.
- archivos `.env` reales.
- progreso personal del navegador.

La licencia del código del juego no estaba declarada en el proyecto original; `package.json` lo marca como `UNLICENSED`. La fuente Outfit se incluye con su licencia SIL Open Font License en `assets/fonts/OFL-Outfit.txt`.
