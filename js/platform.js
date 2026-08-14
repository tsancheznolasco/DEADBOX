// Integración con CrazyGames (SDK v3). Todo el contacto con el portal pasa por aquí.
//
// Fuera de su web el SDK o no existe o queda en el entorno "disabled", donde CUALQUIER llamada
// lanza una excepción. Por eso nada se llama sin comprobar antes el entorno, y cada llamada va
// envuelta: el juego debe seguir funcionando igual en local, en GitHub Pages o sin red.

// Fachada de almacenamiento. Arranca sobre localStorage y, si el módulo de datos del portal está
// disponible, se cambia por él (misma API, síncrona) para que la partida siga al jugador entre
// dispositivos. Los errores se tragan porque en navegación privada escribir puede lanzar.
const Storage = {
    backend: null,
    target(){ return this.backend || (typeof localStorage !== 'undefined' ? localStorage : null); },
    getItem(key){ try { return this.target()?.getItem(key) ?? null; } catch { return null; } },
    setItem(key, value){ try { this.target()?.setItem(key, String(value)); } catch {} },
    removeItem(key){ try { this.target()?.removeItem(key); } catch {} }
};

const Platform = {
    sdk: null,
    environment: 'none',   // none | disabled | local | crazygames
    usable: false,
    ready: null,

    // Llama a un método del SDK sólo si el entorno lo permite. Devuelve null si no se pudo.
    call(path, ...args){
        if (!this.usable || !this.sdk) return null;
        try {
            const parts = path.split('.');
            let owner = this.sdk;
            for (let i = 0; i < parts.length - 1; i++) owner = owner?.[parts[i]];
            const method = owner?.[parts[parts.length - 1]];
            return typeof method === 'function' ? method.apply(owner, args) : null;
        } catch (error) {
            console.warn(`CrazyGames ${path} skipped`, error);
            return null;
        }
    },

    loadingStart(){ this.call('game.loadingStart'); },
    loadingStop(){ this.call('game.loadingStop'); },

    // El SDK limita estos avisos a uno por segundo y descarta los de más, así que morir justo al
    // empezar una ronda o darle rápido a la pausa podía perder un "stop" y dejarles creyendo que
    // la partida sigue. Se ignora lo repetido y lo demasiado seguido se aplaza, nunca se pierde.
    gameplayIntent: null,      // lo que quiere el juego
    gameplayState: null,       // lo último que se entregó de verdad al SDK
    pendingGameplay: null,
    gameplayTimer: null,
    lastGameplayAt: 0,
    setGameplay(active){
        const target = !!active;
        this.gameplayIntent = target;
        if (this.pendingGameplay === null ? this.gameplayState === target : this.pendingGameplay === target) return;
        const wait = Math.max(0, 1000 - (Date.now() - this.lastGameplayAt));
        if (wait === 0) { this.sendGameplay(target); return; }
        this.pendingGameplay = target;
        clearTimeout(this.gameplayTimer);
        this.gameplayTimer = setTimeout(() => {
            const next = this.pendingGameplay;
            this.pendingGameplay = null;
            if (next !== null && next !== this.gameplayState) this.sendGameplay(next);
        }, wait);
    },
    // Aplica ya lo que estuviera esperando. Lo usan las pruebas y el cierre de la página.
    flushGameplay(){
        clearTimeout(this.gameplayTimer);
        const next = this.pendingGameplay;
        this.pendingGameplay = null;
        if (next !== null && next !== this.gameplayState) this.sendGameplay(next);
    },
    sendGameplay(active){
        // Antes de que init() resuelva, call() no hace nada. Si se diera por entregado, pulsar
        // Jugar rápido perdía el primer "gameplay start" para siempre y el portal no lo detectaba.
        if (!this.usable) { this.gameplayState = null; return; }
        this.gameplayState = active;
        this.lastGameplayAt = Date.now();
        this.call(active ? 'game.gameplayStart' : 'game.gameplayStop');
    },
    gameplayStart(){ this.setGameplay(true); },
    gameplayStop(){ this.setGameplay(false); },

    // Si no hay anuncio disponible se avisa por adError igualmente: quien lo pide deja el juego
    // en pausa esperando una respuesta y sin esto se quedaría colgado.
    requestAd(type, callbacks = {}){
        if (!this.usable || typeof this.sdk?.ad?.requestAd !== 'function') {
            callbacks.adError?.({ code: 'unavailable', message: 'SDK not available' });
            return;
        }
        try {
            this.sdk.ad.requestAd(type, callbacks);
        } catch (error) {
            callbacks.adError?.(error);
        }
    }
};

Platform.ready = (async () => {
    const sdk = typeof window !== 'undefined' ? window.CrazyGames?.SDK : null;
    if (!sdk) return Platform;                       // en local o sin red simplemente no está
    Platform.sdk = sdk;
    try {
        await sdk.init();
        // El entorno se expone como propiedad, pero se acepta función por si cambia.
        const environment = typeof sdk.environment === 'function' ? sdk.environment() : sdk.environment;
        Platform.environment = environment || 'disabled';
    } catch (error) {
        Platform.environment = 'disabled';
        console.warn('CrazyGames SDK init failed', error);
        return Platform;
    }
    Platform.usable = Platform.environment === 'crazygames' || Platform.environment === 'local';
    if (!Platform.usable) return Platform;

    // Se avisa del inicio de carga aquí y no antes: hasta este punto el SDK no existía y la
    // llamada se perdía, dejando un "loadingStop" suelto sin su pareja.
    Platform.call('game.loadingStart');
    // Si el jugador ya había empezado antes de que el SDK estuviera listo, se avisa ahora.
    if (Platform.gameplayIntent !== null) Platform.setGameplay(Platform.gameplayIntent);

    // El portal exige guardar el progreso en su módulo de datos, no en localStorage.
    if (typeof sdk.data?.getItem === 'function') {
        Storage.backend = sdk.data;
        if (typeof onPlatformStorageReady === 'function') onPlatformStorageReady();
    }
    return Platform;
})();
