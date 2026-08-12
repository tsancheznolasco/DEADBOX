class Projectile {
    constructor() { this.active = false; }

    init(x, y, angle, speed, damage, size, color, owner = 'player', pierce = 0) {
        this.x = x; this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.damage = Number.isFinite(damage) ? damage : 0;
        this.size = Number.isFinite(size) ? size : 4;
        this.color = color || '#fbbf24';
        this.owner = owner;
        this.pierce = pierce;
        this.bounces = 0;
        this.effect = null;
        this.secondary = false;
        this.life = owner === 'enemy' ? 5000 : 3000;
        this.active = true;
        return this;
    }

    update(dt) {
        if (!this.active) return;
        const step = Math.min(dt, 50) / 16;
        this.x += this.vx * step;
        this.y += this.vy * step;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.shadowBlur = this.owner === 'enemy' ? 16 : 10;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        if (this.owner === 'enemy') {
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(this.vy, this.vx));
            ctx.moveTo(this.size * 1.7, 0);
            ctx.lineTo(-this.size, this.size);
            ctx.lineTo(-this.size, -this.size);
        } else {
            // La forma sale del aspecto equipado; los proyectiles enemigos no se ven afectados.
            const skin = typeof equippedCosmetic === 'function' ? equippedCosmetic('bullet') : null;
            const r = this.size;
            if (skin?.shape === 'square') {
                ctx.rect(this.x - r, this.y - r, r * 2, r * 2);
            } else if (skin?.shape === 'diamond') {
                ctx.moveTo(this.x, this.y - r * 1.3);
                ctx.lineTo(this.x + r, this.y);
                ctx.lineTo(this.x, this.y + r * 1.3);
                ctx.lineTo(this.x - r, this.y);
                ctx.closePath();
            } else {
                ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            }
        }
        ctx.fill();
        ctx.restore();
    }
}
