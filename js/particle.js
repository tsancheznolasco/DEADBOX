class Particle {
    constructor() {
        this.active = false;
    }
    
    init(x, y, color, speed = 2, size = 3, life = 1) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * speed;
        this.vy = (Math.random() - 0.5) * speed;
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
