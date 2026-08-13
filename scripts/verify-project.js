const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];
const required = [
  'index.html', 'style.css', 'package.json', 'package-lock.json',
  '.env.example', '.gitignore', 'README_TRANSFER.md',
  'PROJECT_FILE_INVENTORY.md', 'PORTABILITY_REPORT.md',
  'assets/fonts/Outfit-VariableFont_wght.ttf', 'assets/fonts/OFL-Outfit.txt'
];
const scripts = [
  'js/platform.js', 'js/cosmetics.js', 'js/pool.js', 'js/particle.js', 'js/projectile.js', 'js/input.js',
  'js/i18n.js', 'js/content.js', 'js/difficulty.js', 'js/zombie.js',
  'js/player.js', 'js/spawner.js', 'js/main.js'
];

for (const relative of [...required, ...scripts]) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing: ${relative}`);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const references = [
  ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]),
  ...[...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(match => match[1])
].filter(reference => !reference.startsWith('data:') && !reference.startsWith('#'));

// El SDK de CrazyGames tiene que servirse desde su dominio, así que es la única referencia
// remota permitida. Cualquier otra sigue siendo un fallo: el juego debe ser autocontenido.
const ALLOWED_REMOTE = ['https://sdk.crazygames.com/crazygames-sdk-v3.js'];

for (const reference of references) {
  if (ALLOWED_REMOTE.includes(reference)) continue;              // se sirve desde el portal
  if (/^(?:https?:)?\/\//i.test(reference)) failures.push(`Remote reference remains: ${reference}`);
  else if (!fs.existsSync(path.resolve(root, reference))) failures.push(`Broken reference: ${reference}`);
}

const sourceFiles = ['index.html', 'style.css', ...scripts];
for (const relative of sourceFiles) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  if (/file:\/\//i.test(text) || /\/Users\/[^/]+\//.test(text) || /[A-Za-z]:\\\\Users\\\\/.test(text)) {
    failures.push(`Absolute local path found: ${relative}`);
  }
}

for (const relative of scripts) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {encoding: 'utf8'});
  if (result.status !== 0) failures.push(`Syntax error in ${relative}: ${result.stderr.trim()}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Verified ${required.length + scripts.length} essential files, ${references.length} references, and ${scripts.length} JavaScript files.`);
