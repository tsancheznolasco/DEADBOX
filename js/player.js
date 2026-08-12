class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 30; // Tamaño del cubo
        this.speed = 4;
        
        // Atributos de Vida
        this.maxHealth = 100;
        this.health = 100;
        this.invulnerable = false;
        this.invulnerableTimer = 0;
        this.invulnerableDuration = 1000; // 1 segundo
        
        // Atributos de Disparo
        this.fireRate = 300; 
        this.lastFireTime = 0;
        this.weaponLevel = 1;
        this.baseDamage = 10;
        this.projectileSpeed = 10;
        this.projectileSize = 5;
        this.criticalChance = 0;
        this.pierceChance = 0;
        
        // Atributos base mejorables
        this.bonusDamage = 0;
        this.bonusSpeed = 0;
        
        // Retroceso visual
        this.recoil = 0;
        this.aimAngle = 0;
        
        // Atributos de Salto (Eje Z simulado)
        this.z = 0;
        this.vz = 0;
        this.isJumping = false;
        this.jumpCooldown = 5000; // 5 segundos
        this.lastJumpTime = -5000; // Disponible desde el inicio
        this.buffs = {};
        this.shieldHits = 0;
        this.damageReduction = 0;
        this.regen = null;
        this.kills = 0;
        this.bestCombo = 0;
        this.orbs = 0;
        this.noJump = false;
        // Dash permanente de DEADBOX. Las mejoras modifican estos valores, no el movimiento base.
        this.dashCooldown = 4000;
        this.dashDistance = 140;
        this.dashDuration = 160;
        this.dashSpeed = 1;
        this.dashInvulnerability = 140;
        this.maxDashCharges = 1;
        this.dashCharges = 1;
        this.dashRechargeTimer = 0;
        this.isDashing = false;
        this.dashAvailable = true;
        this.dashDirection = {x:0,y:0};
        this.dashTimeRemaining = 0;
        this.dashDistanceRemaining = 0;
        this.dashStart = null;
        this.shockDash = false;
        this.trailBurn = false;
        this.powers = {};
        this.storedPower = null;
        this.baseSize = this.size;
        this.stuckTime = 0;
    }

    update(dt, input, projectiles, arenaBounds, time) {
        this.dashUsedThisFrame = false;
        this.updateBuffs(dt);
        const angleToMouse = Math.atan2(input.mouse.y - this.y, input.mouse.x - this.x);
        this.aimAngle = Number.isFinite(angleToMouse) ? angleToMouse : this.aimAngle;

        // Dirección normal. Se calcula incluso durante el dash para recordar la intención,
        // pero solo se aplica cuando el estado de dash está inactivo.
        let dx = 0;
        let dy = 0;
        
        if (input.keys.w) dy -= 1;
        if (input.keys.s) dy += 1;
        if (input.keys.a) dx -= 1;
        if (input.keys.d) dx += 1;
        
        const moveLength=Math.hypot(dx,dy);
        if(moveLength>0){dx/=moveLength;dy/=moveLength;}

        this.updateDashCooldown(dt);
        if (!this.isDashing && input.consume?.('shift')) this.tryDash(input);
        if(input.consume?.('q')&&this.storedPower==='selfDestruct'){this.storedPower=null;window.dispatchEvent(new CustomEvent('power_activate',{detail:{type:'selfDestruct'}}));}

        const moveMultiplier = (this.buffs.speed?.value || 1) * (this.buffs.slow?.value || 1) * (this.buffs.frozen?.value || 1) * (this.buffs.leechSlow?.value || 1) * (this.buffs.wardenSlow?.value || 1) * (this.buffs.timeSlow?.value || 1) * (this.buffs.chiliCrash ? .72 : 1) * (this.hasPower('giant') ? .78 : 1) * (this.hasPower('miniMode') ? 1.3 : 1);
        const beforeX=this.x,beforeY=this.y;
        if(this.isDashing)this.updateDashMovement(dt);
        else{
            const mx=dx*this.speed*moveMultiplier*(dt/16),my=dy*this.speed*moveMultiplier*(dt/16);
            if(typeof movePlayerByAxes==='function')movePlayerByAxes(mx,my);else{this.x+=mx;this.y+=my;}
        }
        if (!this.isDashing&&(dx||dy)&&Math.hypot(this.x-beforeX,this.y-beforeY)<.08) this.stuckTime+=dt; else this.stuckTime=0;
        if(this.stuckTime>520&&typeof ensurePlayerSafe==='function'){ensurePlayerSafe(true);this.stuckTime=0;}
        
        // Limitar dentro de la arena (teniendo en cuenta el tamaño)
        this.x = Math.max(arenaBounds.left + this.size/2, Math.min(this.x, arenaBounds.right - this.size/2));
        this.y = Math.max(arenaBounds.top + this.size/2, Math.min(this.y, arenaBounds.bottom - this.size/2));

        this.updatePowers(dt);

        // Lógica de Salto (Eje Z)
        if (this.isJumping) {
            this.z += this.vz * (dt / 16);
            this.vz -= 0.5 * (dt / 16); // Gravedad
            
            if (this.z <= 0) {
                this.z = 0;
                this.isJumping = false;
                this.triggerEarthquake();
            }
        } else if (!this.noJump && !this.dashUsedThisFrame && input.keys.space && time - this.lastJumpTime >= this.jumpCooldown / (this.buffs.jumpRate?.value || 1)) {
            this.isJumping = true;
            this.vz = 10; // Fuerza del salto
            this.lastJumpTime = time;
        }

        // Actualizar invulnerabilidad
        if (this.invulnerable) {
            this.invulnerableTimer -= dt;
            if (this.invulnerableTimer <= 0) {
                this.invulnerable = false;
            }
        }
        
        // Recuperar retroceso
        if (this.recoil > 0) {
            this.recoil -= dt * 0.05;
            if (this.recoil < 0) this.recoil = 0;
        }

        // Disparo automático
        const effectiveFireRate = this.fireRate / (this.buffs.fireRate?.value || 1) / (this.hasPower('bulletStorm') ? 2.15 : 1);
        if (time - this.lastFireTime >= effectiveFireRate) {
            this.shoot(projectiles, angleToMouse);
            this.lastFireTime = time;
        }
    }

    updateDashCooldown(dt){
        if(this.dashCharges<this.maxDashCharges){
            this.dashRechargeTimer=Math.max(0,this.dashRechargeTimer-dt);
            if(this.dashRechargeTimer<=0){
                this.dashCharges++;
                if(this.dashCharges<this.maxDashCharges)this.dashRechargeTimer=this.getDashCooldown();
            }
        }
        this.dashAvailable=!this.isDashing&&this.dashCharges>0;
    }

    getDashCooldown(){return Math.max(850,this.dashCooldown/(this.hasPower('overdrive')?2.25:1));}

    tryDash(input){
        if(this.isDashing||this.dashCharges<=0||this.health<=0)return false;
        const dx=input.mouse.x-this.x,dy=input.mouse.y-this.y;
        const length=Math.hypot(dx,dy);
        if(!Number.isFinite(length)||length<.001)return false;
        const directionX=dx/length,directionY=dy/length;
        const overdrive=this.hasPower('overdrive'),distanceBoost=overdrive?1.5:1,speedBoost=overdrive?1.3:1;
        this.dashDirection={x:directionX,y:directionY};
        this.dashDistanceRemaining=Math.min(320,this.dashDistance*distanceBoost);
        this.dashTimeRemaining=Math.max(70,this.dashDuration/(this.dashSpeed*speedBoost));
        this.dashStart={x:this.x,y:this.y};
        this.isDashing=true;
        this.dashAvailable=false;
        this.dashCharges--;
        if(this.dashCharges<this.maxDashCharges&&this.dashRechargeTimer<=0)this.dashRechargeTimer=this.getDashCooldown();
        this.dashUsedThisFrame=true;
        this.invulnerable=true;
        this.invulnerableTimer=Math.max(this.invulnerableTimer,this.dashInvulnerability+(overdrive?60:0));
        return true;
    }

    updateDashMovement(dt){
        if(!this.isDashing)return;
        const frameTime=Math.min(Math.max(0,dt),this.dashTimeRemaining);
        const speed=this.dashDistanceRemaining/Math.max(1,this.dashTimeRemaining);
        const requested=Math.min(this.dashDistanceRemaining,speed*frameTime);
        let result={moved:requested,collided:false};
        if(typeof dashPlayerSafely==='function')result=dashPlayerSafely(this.dashDirection.x*requested,this.dashDirection.y*requested);
        else{this.x+=this.dashDirection.x*requested;this.y+=this.dashDirection.y*requested;}
        this.dashDistanceRemaining=Math.max(0,this.dashDistanceRemaining-(result?.moved??requested));
        this.dashTimeRemaining=Math.max(0,this.dashTimeRemaining-frameTime);
        if(result?.collided||this.dashDistanceRemaining<=.01||this.dashTimeRemaining<=.01)this.finishDash(!!result?.collided);
    }

    finishDash(collided=false){
        if(!this.isDashing)return;
        this.isDashing=false;
        this.dashAvailable=this.dashCharges>0;
        this.dashTimeRemaining=0;
        this.dashDistanceRemaining=0;
        if(typeof ensurePlayerSafe==='function')ensurePlayerSafe(false);
        const from=this.dashStart||{x:this.x,y:this.y};
        window.dispatchEvent(new CustomEvent('dash_used',{detail:{from,to:{x:this.x,y:this.y},shock:this.shockDash,burn:this.trailBurn,overdrive:this.hasPower('overdrive'),collided}}));
        this.dashStart=null;
    }

    addPower(type,duration){
        if(type==='selfDestruct'){this.storedPower=type;return true;}
        const active=Object.keys(this.powers);if(!this.powers[type]&&active.length>=2)return false;
        const old=this.powers[type];this.powers[type]={time:Math.min((old?.time||0)+duration,duration*1.75),duration,label:type};if(type==='overdrive'&&!old)this.dashCharges=Math.min(this.maxDashCharges+1,this.dashCharges+1);return true;
    }
    hasPower(type){return !!this.powers[type];}
    updatePowers(dt){for(const key of Object.keys(this.powers)){this.powers[key].time-=dt;if(this.powers[key].time<=0){delete this.powers[key];if(key==='orbitals')this.orbs=Math.max(0,this.orbs-4);if(key==='overdrive')this.dashCharges=Math.min(this.dashCharges,this.maxDashCharges);if((key==='giant'||key==='miniMode'||key==='ghost')&&typeof ensurePlayerSafe==='function')ensurePlayerSafe(true);}}}

    updateBuffs(dt) {
        for (const key of Object.keys(this.buffs)) {
            const buff = this.buffs[key];
            if (!buff || !Number.isFinite(buff.time)) continue;
            buff.time -= dt;
            if (buff.time <= 0) {
                delete this.buffs[key];
                if (key === 'chili') this.buffs.chiliCrash = {time: 1400};
            }
        }
        if (this.regen) {
            this.regen.time -= dt; this.regen.tick -= dt;
            if (this.regen.tick <= 0) { this.health = Math.min(this.maxHealth, this.health + this.regen.amount); this.regen.tick = 500; }
            if (this.regen.time <= 0) this.regen = null;
        }
    }

    addBuff(name, duration, value = 1, icon = '✨', label = name) {
        const previous = this.buffs[name];
        if (previous) {
            previous.time = Math.min(Math.max(previous.time, duration) + duration * .35, duration * 1.8);
            previous.duration = Math.max(previous.duration || duration, duration);
            previous.value = Math.max(previous.value || 1, value);
            previous.icon = icon; previous.label = label;
            return;
        }
        this.buffs[name] = {time: duration, duration, value, icon, label};
    }
    
    triggerEarthquake() {
        // Disparamos un evento personalizado o usamos una variable global en main.js 
        // Para mantenerlo simple, crearemos un evento en window
        const event = new CustomEvent('earthquake', {
            detail: { x: this.x, y: this.y, radius: 150, pushForce: 20 }
        });
        window.dispatchEvent(event);
    }

    shoot(projectiles, angle) {
        if (typeof playSound === 'function') playSound('shoot');
        // Añadir retroceso visual
        this.recoil = 8;
        
        const pSpeed = this.projectileSpeed * (this.buffs.projectileSpeed?.value || 1);
        const pDamage = (this.baseDamage + this.bonusDamage) * (this.buffs.damage?.value || 1) * (this.buffs.chili?.value || 1) * (this.hasPower('bulletStorm')?1.22:1) * (this.hasPower('giant')?1.4:1) * (this.hasPower('miniMode') ? .86 : 1);
        const pSize = this.projectileSize * (this.buffs.projectileSize?.value || 1);
        const color = '#fbbf24';
        
        // Determinar patrón de disparo según nivel
        const barrelOffsetX = Math.cos(angle) * (this.size/2 + 10);
        const barrelOffsetY = Math.sin(angle) * (this.size/2 + 10);
        const startX = this.x + barrelOffsetX;
        const startY = this.y + barrelOffsetY;
        
        if (this.weaponLevel < 4) {
            // Un proyectil
            spawnProjectile(startX, startY, angle, pSpeed, pDamage, pSize, color, this.buffs.pierce ? 1 : 0);
        } else if (this.weaponLevel < 6) {
            // Dos proyectiles (paralelos)
            const spread = 5; // Pixeles de separación
            const offsetX = Math.cos(angle + Math.PI/2) * spread;
            const offsetY = Math.sin(angle + Math.PI/2) * spread;
            spawnProjectile(startX + offsetX, startY + offsetY, angle, pSpeed, pDamage, pSize, color, this.buffs.pierce ? 1 : 0);
            spawnProjectile(startX - offsetX, startY - offsetY, angle, pSpeed, pDamage, pSize, color, this.buffs.pierce ? 1 : 0);
        } else {
            // Tres proyectiles (abanico)
            const spreadAngle = 0.15; // Radianes
            spawnProjectile(startX, startY, angle, pSpeed, pDamage, pSize, color, this.buffs.pierce ? 1 : 0);
            spawnProjectile(startX, startY, angle - spreadAngle, pSpeed, pDamage, pSize, color, this.buffs.pierce ? 1 : 0);
            spawnProjectile(startX, startY, angle + spreadAngle, pSpeed, pDamage, pSize, color, this.buffs.pierce ? 1 : 0);
        }
        if(this.hasPower('backfire'))spawnProjectile(this.x-Math.cos(angle)*(this.size/2+8),this.y-Math.sin(angle)*(this.size/2+8),angle+Math.PI,pSpeed,pDamage*.72,pSize,color,this.hasPower('piercingCore')?2:0);
        if(this.hasPower('clone'))spawnProjectile(startX+Math.cos(angle+Math.PI/2)*18,startY+Math.sin(angle+Math.PI/2)*18,angle,pSpeed,pDamage*.55,pSize*.85,'#93c5fd',0);
    }
    
    levelUpWeapon(silent = false) {
        this.weaponLevel++;
        switch(this.weaponLevel) {
            case 2: this.bonusDamage += 5; break;
            case 3: this.fireRate = 220; break;
            case 4: /* Desbloquea 2 proyectiles */ break;
            case 5: this.projectileSize += 3; break;
            case 6: /* Desbloquea 3 proyectiles */ break;
            default:
                // A partir del nivel 7, mejorar aleatoriamente daño o velocidad
                if (Math.random() > 0.5) {
                    this.bonusDamage += 3;
                } else {
                    this.fireRate = Math.max(100, this.fireRate - 20);
                }
                break;
        }
        
        // Evento de notificación
        if(!silent)window.dispatchEvent(new CustomEvent('notification', { detail: { key: 'messages.weaponUp', vars: { level: this.weaponLevel } } }));
    }

    takeDamage(amount) {
        // Inmune si está invulnerable o en el punto más alto del salto (z > 40)
        if (this.invulnerable || this.z > 40 || this.hasPower('ghost')) return false;
        
        if (this.shieldHits > 0) { this.shieldHits--; this.invulnerable = true; this.invulnerableTimer = 450; return false; }
        amount *= Math.max(.25, 1 - this.damageReduction - (this.buffs.armor?.value || 0));amount=Math.min(amount,this.maxHealth*.72);
        if (typeof registerPlayerDamage === 'function') registerPlayerDamage(amount);
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        
        this.invulnerable = true;
        this.invulnerableTimer = this.invulnerableDuration*(typeof difficultyProfile!=='undefined'?difficultyProfile.invulnerability:1);
        return true; // Retorna true si recibió daño
    }

    draw(ctx) {
        // Efecto de parpadeo si es invulnerable
        if (this.invulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        } else {
            ctx.globalAlpha = 1.0;
        }
        if(this.isDashing)ctx.globalAlpha=Math.min(ctx.globalAlpha,.68);

        const powerScale=this.hasPower('giant') ? 1.5 : (this.hasPower('miniMode') ? .68 : 1);
        ctx.save();
        // Sombra (se queda en el piso)
        if (this.z > 0) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.ellipse(this.x, this.y + this.size/2, this.size/2, this.size/4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Translación incluyendo el salto (Eje Z afecta Y visualmente)
        ctx.translate(this.x, this.y - this.z);
        ctx.scale(powerScale,powerScale);

        // Dibujar cuerpo (Caja)
        ctx.fillStyle = '#60a5fa'; // Azul claro
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#60a5fa';
        ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size);
        ctx.shadowBlur = 0;
        
        // Dibujar Cara Feliz
        // La cara mira hacia el ratón, por lo que rotamos el contexto del cuerpo
        ctx.rotate(this.aimAngle);
        
        // Ojos
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(this.size/4, -this.size/4, 4, 4);
        ctx.fillRect(this.size/4, this.size/4 - 4, 4, 4);
        
        // Boca (Curva)
        ctx.beginPath();
        ctx.arc(this.size/4 + 2, 0, 8, Math.PI/4, -Math.PI/4, true);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pistola giratoria
        // La dibujamos teniendo en cuenta el retroceso
        ctx.fillStyle = '#94a3b8'; // Gris arma
        ctx.fillRect(this.size/2 - this.recoil, -4, 20, 8); // Cañón

        ctx.restore();
        if(this.hasPower('ghost')){ctx.save();ctx.globalAlpha=.22+.12*Math.sin(Date.now()/90);ctx.strokeStyle='#c4b5fd';ctx.lineWidth=3;ctx.strokeRect(this.x-this.size*.65,this.y-this.z-this.size*.65,this.size*1.3,this.size*1.3);ctx.restore();}
        if(this.hasPower('clone')){ctx.save();ctx.globalAlpha=.42;ctx.fillStyle='#93c5fd';ctx.fillRect(this.x-34-this.size/2,this.y-this.z+24-this.size/2,this.size,this.size);ctx.restore();}
        if (this.shieldHits > 0) {
            ctx.save(); ctx.strokeStyle = 'rgba(96,165,250,.9)'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(this.x, this.y - this.z, this.size * .85, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        if (this.buffs.chili) {
            ctx.save(); ctx.strokeStyle = 'rgba(249,115,22,.8)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(this.x, this.y - this.z, this.size + 7 + Math.sin(Date.now()/80)*3, 0, Math.PI*2); ctx.stroke(); ctx.restore();
        }
        if (this.buffs.garlic || this.buffs.cheese) {
            ctx.save(); ctx.strokeStyle = this.buffs.garlic ? 'rgba(253,224,71,.38)' : 'rgba(250,204,21,.28)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.buffs.garlic ? 115 : 145, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
        if (this.orbs > 0) {
            ctx.save(); ctx.fillStyle = '#c4b5fd';
            for (let i=0;i<this.orbs;i++) { const a=Date.now()/650+i/this.orbs*Math.PI*2; ctx.beginPath(); ctx.arc(this.x+Math.cos(a)*42,this.y+Math.sin(a)*42,6,0,Math.PI*2); ctx.fill(); }
            ctx.restore();
        }
        ctx.globalAlpha = 1.0; // Reset
    }
}
