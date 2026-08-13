const Input = {
    keys: {
        w: false,
        a: false,
        s: false,
        d: false,
        space: false,
        shift: false,
        q: false,
        escape: false
    },
    pressed: new Set(),
    mouse: {
        x: 0,
        y: 0
    },
    // Control táctil: dos joysticks analógicos, mover a la izquierda y apuntar a la derecha.
    touchActive: false,
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    stick: { id: null, active: false, baseX: 0, baseY: 0 },
    aimStick: { id: null, active: false, baseX: 0, baseY: 0 },

    init() {
        window.addEventListener('keydown', (e) => {
            if (['ShiftLeft','ShiftRight','Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code) && document.activeElement?.tagName !== 'SELECT') e.preventDefault();
            this.handleKey(e.code, true);
        });
        window.addEventListener('keyup', (e) => this.handleKey(e.code, false));
        window.addEventListener('blur', () => this.reset());
        window.addEventListener('mousemove', (e) => {
            const canvas=document.getElementById('gameCanvas');
            const rect=canvas?.getBoundingClientRect?.()||{left:0,top:0,width:canvas?.width||window.innerWidth,height:canvas?.height||window.innerHeight};
            // El lienzo se dibuja en píxeles CSS aunque su búfer sea mayor en pantallas densas,
            // así que el ratón se mapea al tamaño lógico y no al del búfer.
            const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
            const logicalWidth=canvas?.logicalWidth||canvas?.width||width;
            const logicalHeight=canvas?.logicalHeight||canvas?.height||height;
            this.mouse.x=(e.clientX-rect.left)*(logicalWidth/width);
            this.mouse.y=(e.clientY-rect.top)*(logicalHeight/height);
        });
        this.initTouch();
    },

    setTouchMode(on) {
        if (this.touchActive === on) return;
        this.touchActive = on;
        document.body?.classList?.toggle('touch-mode', on);
        window.dispatchEvent(new Event('input_mode_changed'));
    },

    // Cada joystick es flotante: nace donde cae el pulgar, más cómodo que uno fijo. Los dos
    // comparten esta fábrica porque sólo cambian la zona, los elementos y el vector que llenan.
    createStick(zoneId, baseId, thumbId, vector, state) {
        const zone = document.getElementById(zoneId);
        const base = document.getElementById(baseId);
        const thumb = document.getElementById(thumbId);
        if (!zone) return;
        const maxRadius = 52;

        const place = (x, y) => {
            let dx = x - state.baseX, dy = y - state.baseY;
            const length = Math.hypot(dx, dy);
            if (length > maxRadius) { dx = dx / length * maxRadius; dy = dy / length * maxRadius; }
            vector.x = dx / maxRadius;
            vector.y = dy / maxRadius;
            if (thumb) thumb.style.transform = `translate(${state.baseX + dx}px, ${state.baseY + dy}px) translate(-50%, -50%)`;
        };
        const start = e => {
            if (e.pointerType === 'mouse') return;
            this.setTouchMode(true);
            state.id = e.pointerId; state.active = true;
            state.baseX = e.clientX; state.baseY = e.clientY;
            if (base) { base.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`; base.style.opacity = '1'; }
            if (thumb) thumb.style.opacity = '1';
            place(e.clientX, e.clientY);
            // Capturar el puntero puede fallar; si escapara, preventDefault no se ejecutaría y la
            // página haría scroll o zoom en medio de la partida.
            try { zone.setPointerCapture?.(e.pointerId); } catch {}
            e.preventDefault();
        };
        const move = e => {
            if (!state.active || e.pointerId !== state.id) return;
            place(e.clientX, e.clientY);
            e.preventDefault();
        };
        const end = e => {
            if (e.pointerId !== state.id) return;
            state.active = false; state.id = null;
            vector.x = 0; vector.y = 0;
            if (base) base.style.opacity = '0';
            if (thumb) thumb.style.opacity = '0';
        };
        zone.addEventListener('pointerdown', start);
        zone.addEventListener('pointermove', move);
        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);
    },

    initTouch() {
        if (!window.PointerEvent) return;
        this.createStick('touch-move', 'touch-stick-base', 'touch-thumb', this.move, this.stick);
        this.createStick('touch-aim', 'touch-aim-base', 'touch-aim-thumb', this.aim, this.aimStick);

        // Botones de habilidad: el disparo es automático, así que sólo hacen falta estos.
        for (const [id, key] of [['touch-jump', 'space'], ['touch-dash', 'shift'], ['touch-power', 'q']]) {
            const button = document.getElementById(id);
            if (!button) continue;
            button.addEventListener('pointerdown', e => {
                if (e.pointerType === 'mouse') return;
                this.setTouchMode(true);
                this.pressed.add(key); this.keys[key] = true;
                button.classList.add('pressed');
                e.preventDefault();
            });
            // El salto mira la tecla mantenida, no el flanco: si un toque rápido se soltara antes
            // del siguiente fotograma, el juego no lo vería nunca. Se sostiene un instante.
            const release = () => { button.classList.remove('pressed'); setTimeout(() => { this.keys[key] = false; }, 90); };
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
            button.addEventListener('pointerleave', release);
        }
        const pause = document.getElementById('touch-pause');
        pause?.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse') return;
            this.setTouchMode(true);
            window.dispatchEvent(new Event('pause_toggle'));
            e.preventDefault();
        });

        // Si aparece un ratón de verdad, se vuelve al modo de escritorio.
        window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') this.setTouchMode(false); });
        window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') this.setTouchMode(true); });
    },

    handleKey(code, isDown) {
        const edge = (key) => {
            if (isDown && !this.keys[key]) this.pressed.add(key);
            this.keys[key] = isDown;
        };
        switch (code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.w = isDown;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.a = isDown;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.s = isDown;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.d = isDown;
                break;
            case 'Space':
                edge('space');
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                edge('shift');
                break;
            case 'KeyQ':
                edge('q');
                break;
            case 'Escape':
                this.keys.escape = isDown;
                if (isDown) window.dispatchEvent(new Event('pause_toggle'));
                break;
        }
    },

    consume(key) {
        if (!this.pressed.has(key)) return false;
        this.pressed.delete(key);
        return true;
    },

    clearPressed() {
        this.pressed.clear();
    },

    reset() {
        for (const key of Object.keys(this.keys)) this.keys[key] = false;
        this.pressed.clear();
        this.move.x = 0; this.move.y = 0;
        this.aim.x = 0; this.aim.y = 0;
        this.stick.active = false; this.stick.id = null;
        this.aimStick.active = false; this.aimStick.id = null;
        for (const id of ['touch-stick-base', 'touch-thumb', 'touch-aim-base', 'touch-aim-thumb']) {
            const el = document.getElementById(id);
            if (el) el.style.opacity = '0';
        }
    }
};
