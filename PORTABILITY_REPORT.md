# Reporte de portabilidad de DEADBOX

Fecha de preparación: 24 de julio de 2026.

## Tecnología detectada

- Aplicación web estática.
- HTML5, CSS y JavaScript sin framework.
- Renderizado 2D con Canvas API.
- Audio procedural con Web Audio API.
- Persistencia con `localStorage`.
- Ciclo de juego con `requestAnimationFrame`.
- No se detectó motor de juego, bundler, TypeScript, backend, base de datos, PWA ni SDK externo.

El proyecto original no declaraba una versión propia ni incluía administrador de paquetes. Para hacer la transferencia reproducible se añadieron herramientas portátiles basadas exclusivamente en módulos integrados de Node.js:

- Node.js requerido: 18 o posterior.
- npm: incluido con Node.js.
- Dependencias npm externas: ninguna.
- Instalación global adicional: ninguna.

La preparación y pruebas se realizaron con Node.js 24.13.0 y npm 11.6.2. Se recomienda usar Node.js 20 o 22 LTS en la computadora destino.

## Dependencias y recursos

La única dependencia remota detectada era la fuente Outfit cargada desde Google Fonts. Para eliminar esa dependencia de red:

- Se incluyó `assets/fonts/Outfit-VariableFont_wght.ttf`.
- Se incluyó su licencia oficial SIL Open Font License.
- El `@import` remoto de `style.css` se reemplazó por un `@font-face` relativo.

No se encontraron sprites, texturas, imágenes, música ni sonidos externos. Esos elementos se generan mediante código Canvas y Web Audio.

## Rutas

La búsqueda global no encontró rutas absolutas a carpetas de usuario, Desktop, Downloads, temporales, unidades Windows ni recursos `file://` en el código original.

Corrección realizada:

- URL remota de Google Fonts → `./assets/fonts/Outfit-VariableFont_wght.ttf`.

No se movió código fuente ni se alteró la estructura original `index.html` + `style.css` + `js/`.

## Variables de entorno y servicios

- Variables de entorno detectadas: ninguna.
- APIs externas: ninguna.
- Analítica: ninguna.
- Servicios de almacenamiento: ninguno.
- Claves, tokens o contraseñas detectados: ninguno.

Se añadió `.env.example` como declaración explícita. `.gitignore` excluye `.env` y variantes locales.

## Guardado y progreso

La persistencia está en `localStorage`. Las claves actuales detectadas son:

- `deadboxSaveDataV3`
- `deadboxSaveDataV3Backup`
- `deadboxRecordsV3`
- `deadboxOptionsV1`
- `deadboxBestiaryV1`
- `deadboxMetaV1`
- `deadboxLanguage`
- `deadboxHighScore`
- `deadboxHighScoreRound`

El código también lee claves antiguas `arena*` para migración.

No se incluyó un respaldo del progreso personal. Los archivos del proyecto no contienen esos valores y no se tuvo acceso seguro al almacenamiento del navegador/origen original. `README_TRANSFER.md` incluye un procedimiento validado conceptualmente para exportar e importar únicamente las claves de DEADBOX. No se fabricó un respaldo vacío.

Riesgo principal: `localStorage` depende de protocolo, host y puerto. Para conservar el mismo espacio de guardado en la computadora nueva, se recomienda usar siempre `http://127.0.0.1:8080`.

## Archivos de proyecto añadidos para portabilidad

- `package.json` y `package-lock.json`.
- servidor local sin dependencias.
- script de build sin dependencias.
- verificador de archivos/referencias/sintaxis.
- prueba de humo.
- scripts de instalación y arranque para Windows y macOS/Linux.
- `.gitignore`, `.env.example` y documentación de transferencia.

Estas adiciones no cambian reglas, mecánicas, balance, gráficos ni interfaz del juego.

## Archivos excluidos

- `node_modules/`: regenerable mediante `npm ci`.
- `dist/`: regenerable mediante `npm run build`.
- logs, cobertura, cachés y archivos temporales.
- `.env` y variantes privadas.
- `.DS_Store`, `Thumbs.db` y archivos equivalentes.
- ajustes privados de editores.
- `.git/`: no existía repositorio Git en el proyecto original auditado.
- progreso personal del navegador.

No se excluyó ninguna dependencia local necesaria.

## Git y estado original

No se encontró una carpeta `.git` en el proyecto original, por lo que no existe historial o estado de commit que transferir. La copia captura directamente el estado actual completo de sus archivos. El funcionamiento no depende de Git.

## Comprobaciones de referencias

Se revisaron:

- referencias `src`, `href` y `url(...)`;
- existencia y orden de scripts;
- diferencias de mayúsculas/minúsculas;
- rutas absolutas y remotas;
- separadores incompatibles;
- sintaxis de todos los archivos JavaScript;
- presencia de los archivos esenciales.

No se detectaron imports npm ni imports dinámicos no declarados. El proyecto usa scripts clásicos y símbolos globales; el orden indicado en `index.html` es obligatorio.

## Riesgos y limitaciones

- Navegadores antiguos pueden no soportar todas las APIs modernas utilizadas.
- El audio requiere una interacción del usuario debido a las políticas de reproducción automática.
- Abrir con `file://` puede causar diferencias de origen, CORS o guardado; debe usarse el servidor incluido.
- Windows no distingue mayúsculas/minúsculas como Linux; no deben renombrarse archivos al transferirlos.
- La licencia del código del juego no estaba declarada. El paquete lo marca como `UNLICENSED`; debe aclararse antes de distribuirlo públicamente.
- No se realizó una prueba manual visual o auditiva en un navegador real dentro de este entorno. La validación automatizada usa una simulación de DOM/Canvas y una comprobación HTTP del build; esta limitación se reporta expresamente y no se presenta como una prueba visual.

## Prueba limpia

La prueba se realiza desde una copia temporal separada, sin reutilizar `node_modules`:

1. `npm ci`
2. `npm run verify`
3. `npm test`
4. `npm run build`
5. inicio del servidor de `dist/`
6. comprobación HTTP de HTML, JavaScript, CSS y fuente

Los resultados finales de esa ejecución se registran en la sección siguiente antes de empaquetar.

### Resultado final

- Copia temporal limpia creada fuera del proyecto.
- `npm ci --ignore-scripts`: aprobado; 0 vulnerabilidades y sin paquetes externos descargados.
- `npm run verify`: aprobado; 22 archivos esenciales, 13 referencias y 11 archivos JavaScript verificados.
- `npm test`: aprobado; inicialización, ciclo de rondas, límites, guardado, enemigos, bosses/minibosses y pruebas detalladas del dash completadas.
- `npm run build`: aprobado; `dist/` generado desde cero.
- Servidor de preview: iniciado correctamente en `127.0.0.1:4173`.
- Comprobación HTTP: `index.html`, `style.css`, `js/main.js` y la fuente Outfit respondieron correctamente.

La prueba automatizada inicializa el juego, crea un jugador, avanza el ciclo, simula entradas y valida entidades/controles. No sustituye una revisión manual visual y auditiva en un navegador real; esa fue la única parte del procedimiento solicitado que este entorno no permitió certificar directamente.

## Recomendaciones para el nuevo entorno

1. Extraer el ZIP conservando la carpeta raíz `DEADBOX/`.
2. Instalar Node.js LTS y ejecutar `npm ci`.
3. Ejecutar `npm run verify` antes de editar.
4. Usar `npm run dev` y conservar la URL/puerto para la persistencia.
5. Mantener el lockfile y la licencia de Outfit.
6. Añadir futuros recursos dentro de `assets/` y usar rutas relativas.
7. No guardar secretos en el repositorio; documentar nuevas variables en `.env.example`.
