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
            const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
            this.mouse.x=(e.clientX-rect.left)*((canvas?.width||width)/width);
            this.mouse.y=(e.clientY-rect.top)*((canvas?.height||height)/height);
        });
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
    }
};
