const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.resolve(__dirname, '..');
const requestedRoot = process.argv[2] || '.';
const root = path.resolve(projectRoot, requestedRoot);
const port = Number(process.argv[3] || 8080);

if (!root.startsWith(projectRoot) || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`Invalid server directory: ${requestedRoot}`);
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${process.argv[3]}`);
  process.exit(1);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) && file !== root) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(response);
  } catch (error) {
    response.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'}).end('Server error');
    console.error(error);
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${port} is already in use.`);
  else console.error(error);
  process.exit(1);
});

// Con HOST=0.0.0.0 el servidor acepta conexiones de la red local, que es como se prueba el
// control táctil en un móvil. Por defecto sigue siendo sólo local.
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
  console.log(`DEADBOX available at http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
  if (host === '0.0.0.0') {
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) console.log(`On this network (${name}): http://${address.address}:${port}`);
      }
    }
  }
  console.log(`Serving: ${root}`);
});
