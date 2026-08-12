const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const required = ['index.html', 'style.css', 'js', 'assets'];

for (const entry of required) {
  if (!fs.existsSync(path.join(root, entry))) {
    console.error(`Cannot build: missing ${entry}`);
    process.exit(1);
  }
}

fs.rmSync(dist, {recursive: true, force: true});
fs.mkdirSync(dist, {recursive: true});
for (const entry of required) {
  fs.cpSync(path.join(root, entry), path.join(dist, entry), {recursive: true});
}

console.log(`Build created at ${dist}`);
