class Particle {
    constructor() {
        this.active = false;
    }
    
    // Con un ángulo la partícula sale en esa dirección, para que una muerte se disperse hacia donde
    // apuntaba el disparo. Sin ángulo mantiene el reparto aleatorio de siempre.
    init(x, y, color, speed = 2, size = 3, life = 1, angle = null, spread = Math.PI) {
        this.x = x;
        this.y = y;
        if (angle === null) {
            this.vx = (Math.random() - 0.5) * speed;
            this.vy = (Math.random() - 0.5) * speed;
        } else {
            const direction = angle + (Math.random() - 0.5) * spread;
            const velocity = speed * (0.35 + Math.random() * 0.65);
            this.vx = Math.cos(direction) * velocity;
            this.vy = Math.sin(direction) * velocity;
        }
        this.color = color;
        this.life = life;
        this.size = size;
        this.decay = Math.random() * 0.05 + 0.02;
        this.active = true;
        return this;
    }
    
    update(dt) {
        if (!this.active) return;
        this.x += this.vx * (dt / 16);
        this.y += this.vy * (dt / 16);
        this.life -= this.decay * (dt / 16);
        this.size *= 0.95;
        if (this.life <= 0 || this.size <= 0.1) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        if (this.life <= 0) return;
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}
