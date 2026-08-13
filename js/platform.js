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
    gameplayStart(){ this.call('game.gameplayStart'); },
    gameplayStop(){ this.call('game.gameplayStop'); },

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

    // El portal exige guardar el progreso en su módulo de datos, no en localStorage.
    if (typeof sdk.data?.getItem === 'function') {
        Storage.backend = sdk.data;
        if (typeof onPlatformStorageReady === 'function') onPlatformStorageReady();
    }
    return Platform;
})();
