# Inventario de archivos de DEADBOX

## Estructura general

```text
DEADBOX/
├── .env.example
├── .gitignore
├── index.html
├── style.css
├── package.json
├── package-lock.json
├── README_TRANSFER.md
├── PROJECT_FILE_INVENTORY.md
├── PORTABILITY_REPORT.md
├── assets/
│   └── fonts/
│       ├── Outfit-VariableFont_wght.ttf
│       └── OFL-Outfit.txt
├── js/
│   ├── cosmetics.js
│   ├── pool.js
│   ├── particle.js
│   ├── projectile.js
│   ├── input.js
│   ├── i18n.js
│   ├── content.js
│   ├── difficulty.js
│   ├── zombie.js
│   ├── player.js
│   ├── spawner.js
│   └── main.js
├── scripts/
│   ├── build.js
│   ├── server.js
│   └── verify-project.js
├── tests/
│   └── smoke-test.js
├── setup-macos-linux.sh
├── start-macos-linux.sh
├── setup-windows.bat
└── start-windows.bat
```

`node_modules/` y `dist/` no forman parte del paquete porque se regeneran.

## Punto de entrada y carga

- `index.html`: punto de entrada del juego, estructura de menús/HUD/pantallas y orden de carga de todos los scripts.
- `style.css`: presentación de menús, HUD, selector de mejoras, Bestiary, opciones, pantallas de pausa/recuperación y canvas.
- `package.json`: comandos portátiles de instalación, desarrollo, prueba, verificación, build y preview.
- `package-lock.json`: estado reproducible de dependencias; actualmente no hay paquetes de terceros.

## Mapa de sistemas

| Sistema | Archivo principal | Notas |
|---|---|---|
| Jugador | `js/player.js` | Estado, movimiento normal, vida, arma, buffs y poderes. |
| Dash | `js/player.js` y `js/main.js` | Estado/dirección/recarga en `Player`; colisión continua y estela/eventos en `main.js`. |
| Salto y terremoto | `js/player.js` y `js/main.js` | Entrada y estado en `Player`; efectos y colisiones en el ciclo principal. |
| Entrada de teclado y mouse | `js/input.js` | Teclas, pulsaciones únicas, posición del cursor y conversión a coordenadas del canvas. |
| Enemigos | `js/zombie.js` | Clases, habilidades, dibujo y comportamiento compartido de zombies, minibosses y bosses. |
| Catálogo de enemigos | `js/content.js` | Metadatos del Bestiary, categorías, primeras rondas y rotaciones de bosses/minibosses. |
| Aparición y formaciones | `js/spawner.js` | Roles, composiciones, sinergias, grupos, límites y selección anti-repetición. |
| Dificultad | `js/difficulty.js` | Porcentaje, curvas independientes, presupuesto de complejidad, límites y rotación de encuentros. |
| Rondas y modificadores | `js/main.js` | Duración, fases internas, eventos, modificadores, obstáculos, finalización y transición. |
| Bosses y minibosses | `js/zombie.js`, `js/content.js`, `js/difficulty.js` | Implementación, catálogo, rotación y selección respectivamente. |
| Power-ups permanentes | `js/main.js` | Catálogo de mejoras, selección y simulación de loadout avanzado. |
| Alimentos y superpoderes | `js/main.js` | Definiciones, rarezas, drops, efectos temporales, interfaz e indicadores. |
| Proyectiles | `js/projectile.js` y `js/main.js` | Entidad reutilizable y resolución de disparos/impactos. |
| Partículas | `js/particle.js` y `js/main.js` | Entidad visual reutilizable y límites. |
| Object pooling | `js/pool.js` | Pool genérico usado por entidades frecuentes. |
| Aspectos y chatarra | `js/cosmetics.js`, `js/main.js` | Catálogo de aspectos, compra/equipamiento y pantalla del Taller. Solo cambian el dibujo. |
| Traducciones | `js/i18n.js` | Diccionario central English/Español y funciones de traducción. |
| Menús e interfaz | `index.html`, `style.css`, `js/main.js` | Marcado, estilos y conexiones de eventos/estado. |
| Guardado y recuperación | `js/main.js`, `js/difficulty.js` | `localStorage`, respaldo válido, récords, opciones, partida y metadatos. |
| Bestiary | `js/content.js`, `js/main.js`, `index.html` | Datos, descubrimientos/eliminaciones persistentes y pantalla/filtros. |
| Render y game loop | `js/main.js` | Canvas, cámara, actualización, colisiones, UI y `requestAnimationFrame`. |

## Recursos

- `assets/fonts/Outfit-VariableFont_wght.ttf`: fuente variable local usada por la interfaz.
- `assets/fonts/OFL-Outfit.txt`: licencia de la fuente Outfit.
- Los personajes, enemigos, objetos, fondos, indicadores y partículas se dibujan mediante Canvas; no hay sprites, imágenes, modelos ni shaders externos.
- Los sonidos se sintetizan con Web Audio API; no hay archivos de música o efectos de sonido.

## Configuración y herramientas

- `scripts/server.js`: servidor HTTP local sin dependencias.
- `scripts/build.js`: copia los archivos de publicación a `dist/`.
- `scripts/verify-project.js`: valida archivos, referencias, sintaxis y portabilidad.
- `tests/smoke-test.js`: prueba de humo en un entorno DOM/Canvas simulado.
- `.env.example`: confirma que no existen variables de entorno.
- `.gitignore`: excluye dependencias, builds, secretos, cachés y archivos personales.
- `setup-*` y `start-*`: accesos directos seguros para Windows y macOS/Linux.

## Orden de scripts

`index.html` carga scripts clásicos en este orden:

1. `cosmetics.js`
2. `pool.js`
3. `particle.js`
4. `projectile.js`
5. `input.js`
6. `i18n.js`
7. `content.js`
8. `difficulty.js`
9. `zombie.js`
10. `player.js`
11. `spawner.js`
12. `main.js`

Debe mantenerse porque los archivos comparten símbolos globales y no usan módulos ES.
