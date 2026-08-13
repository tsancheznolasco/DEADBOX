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
        this.chain = 0;                 // se reinicia aquí porque los proyectiles vienen de un pool
        // Un proyectil que perfora seguía solapando al mismo enemigo y volvía a dañarlo cada
        // fotograma, así que se recuerda a quién ya ha golpeado.
        if (this.hits) this.hits.clear(); else this.hits = new Set();
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
            traceBulletShape(ctx, skin?.shape, this.x, this.y, this.size);
        }
        ctx.fill();
        ctx.restore();
    }
}
