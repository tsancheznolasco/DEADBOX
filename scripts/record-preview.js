// Graba los vídeos de vista previa para CrazyGames sin depender de ffmpeg ni de permisos de
// grabación de pantalla: sirve el juego, abre Chrome con la captura de pestaña autoaceptada y deja
// que la propia página grabe en MP4 y lo devuelva por POST.
//
//   node scripts/record-preview.js landscape 1920 1080 18
//   node scripts/record-preview.js portrait   1080 1920 18

const http = require('http');
const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'press');
const PORT = 8099;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const [, , name = 'landscape', width = '1920', height = '1080',
       seconds = '16', dsf = '1.5', cssW, cssH] = process.argv;
const DSF = Number(dsf);
const CSS_W = Number(cssW || Math.round(Number(width)/DSF));
const CSS_H = Number(cssH || Math.round(Number(height)/DSF));
// El juego dibuja a devicePixelRatio (topado en 2), así que el lienzo mide CSS x DSF. Con 1.5 y
// una ventana de 1280x720 CSS sale un lienzo de 1920x1080 reales y, a la vez, un campo de visión
// parecido al de un jugador de escritorio. Con DSF 2 la ventana era de 960x540 y se veía muy poca
// arena: el vídeo salía vacío.

const MIME = {
    '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
    '.ttf':'font/ttf', '.txt':'text/plain', '.png':'image/png', '.json':'application/json'
};

let saved = null;
let viewport = null;

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // --window-size es la ventana, no el área visible: en headless sobran ~144px de alto. Se mide
    // una vez y se corrige, si no el vídeo sale a 1920x936 en vez de 1920x1080.
    if (url.pathname === '/probe.html') {
        res.writeHead(200, {'Content-Type':'text/html'});
        res.end('<script>fetch("/probe?w="+innerWidth+"&h="+innerHeight,{method:"POST"})</script>');
        return;
    }
    if (req.method === 'POST' && url.pathname === '/probe') {
        viewport = {w: Number(url.searchParams.get('w')), h: Number(url.searchParams.get('h'))};
        if (url.searchParams.get('before')) {
            console.log('pista antes:', url.searchParams.get('before'));
            console.log('pista después:', url.searchParams.get('after'));
        }
        res.writeHead(200); res.end('ok');
        return;
    }

    if (req.method === 'POST' && url.pathname === '/save') {
        const file = path.join(OUT_DIR, `deadbox-${url.searchParams.get('name')}.${url.searchParams.get('ext')}`);
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            fs.writeFileSync(file, Buffer.concat(chunks));
            saved = file;
            console.log('estado final del juego (ronda/puntos/kills/estado/enemigos):', url.searchParams.get('stats'));
            res.writeHead(200); res.end('ok');
        });
        return;
    }

    // Servidor estático mínimo sobre la carpeta del juego.
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.join(ROOT, decodeURIComponent(rel));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
});

function launch(winW, winH, target){
    const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'deadbox-rec-'));
    // Ventana real, no headless: sin compositor ni captureStream ni la captura de pestaña producen
    // fotogramas nuevos (se comprobó que salían idénticos bit a bit aunque el juego avanzara).
    //
    // La pantalla física limita el área visible a unos 1470x780, así que 1080p no cabe en píxeles
    // CSS. Pero el juego dibuja a devicePixelRatio (topado en 2), así que una ventana de 960x540
    // con escala 2 da un lienzo de 1920x1080 reales. Se graba ese lienzo a tamaño nativo.
    return spawn(CHROME, [
        '--force-device-scale-factor=' + DSF,
        '--auto-accept-this-tab-capture',
        '--no-first-run',                    // sin esto la ventana nueva abre el asistente
        '--no-default-browser-check',
        '--disable-session-crashed-bubble',
        '--autoplay-policy=no-user-gesture-required',
        '--hide-scrollbars',
        '--mute-audio',
        '--window-position=0,0',
        `--user-data-dir=${profile}`,
        `--window-size=${winW},${winH}`,
        target
    ], {stdio: process.env.DEBUG ? 'inherit' : 'ignore'});
}

const wait = async (test, ms) => {
    const deadline = Date.now() + ms;
    while (!test() && Date.now() < deadline) await new Promise(r => setTimeout(r, 300));
    return test();
};

server.listen(PORT, async () => {
    const W = Number(width), H = Number(height);

    // Se calibra el área visible en píxeles CSS. El lienzo del juego mide área x DSF, así que
    // 1280x720 con DSF 1.5 da exactamente 1920x1080 de lienzo. Se descartó capturar la pestaña
    // entera (que sí traería el HUD) porque su resolución no sigue al tamaño de la ventana: pedir
    // 1920x1080 devolvía 2204x1230, luego 2148x1212... nunca converge.
    let winW = CSS_W, winH = CSS_H, previous = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        viewport = null;
        const probe = launch(winW, winH, `http://localhost:${PORT}/press/record.html?calibrate=1`);
        const measured = await wait(() => viewport, 25000);
        probe.kill();
        if (!measured) { console.error('FALLO: no se pudo medir el área visible'); process.exit(1); }
        console.log(`ventana ${winW}x${winH} → área visible ${viewport.w}x${viewport.h} (objetivo ${CSS_W}x${CSS_H})`);
        if (viewport.w === CSS_W && viewport.h === CSS_H) break;
        if (previous && previous.w === viewport.w && previous.h === viewport.h) {
            console.log('la pantalla no da para más; el vídeo se escalará desde este tamaño');
            break;
        }
        previous = {...viewport};
        winW += CSS_W - viewport.w; winH += CSS_H - viewport.h;
    }

    const target = `http://localhost:${PORT}/press/record.html?name=${name}&seconds=${seconds}&w=${W}&h=${H}&round=${process.env.ROUND || 8}`;
    const chrome = launch(winW, winH, target);
    await wait(() => saved, (Number(seconds) + 45) * 1000);

    chrome.kill();
    server.close();

    if (!saved) { console.error('FALLO: no se recibió ningún vídeo'); process.exit(1); }

    // MediaRecorder escribe un MP4 fragmentado sin duración en la cabecera: los reproductores web
    // leían 1.69s en un vídeo de 19.8s. Se reescribe con avconvert para dejarlo bien formado.
    const raw = saved.replace(/\.mp4$/, '-raw.mp4');
    fs.renameSync(saved, raw);
    await new Promise((resolve, reject) => {
        const conv = spawn('/usr/bin/avconvert',
            ['--source', raw, '--output', saved, '--preset', 'PresetHighestQuality', '--replace'],
            {stdio: 'ignore'});
        conv.on('exit', code => code === 0 ? resolve() : reject(new Error('avconvert ' + code)));
    });
    fs.unlinkSync(raw);

    const size = fs.statSync(saved).size;
    console.log(`OK ${path.basename(saved)} ${(size/1048576).toFixed(2)} MB`);
});
