const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

class Zombie {
    constructor() {
        this.active = false;
        this.baseSize = 26; this.baseSpeed = 1.5; this.baseHealth = 30;
        this.baseDamage = 10; this.baseColor = '#10b981';
        this.type = 'normal'; this.scoreValue = 10;
    }

    init(x, y, difficulty = 1) {
        this.x = x; this.y = y; this.active = true;
        this.size = this.baseSize;
        this.speed = this.baseSpeed * (1 + Math.min(.25, difficulty * .008));
        const earlyEase = difficulty <= 5 ? lerp(.5, 1, (difficulty - 1) / 4) : 1;
        // La vida seguía un tope que se alcanzaba hacia la ronda 32, así que a partir de ahí los
        // enemigos dejaban de endurecerse mientras el daño del jugador seguía creciendo sin límite.
        this.maxHealth = this.baseHealth * (1 + Math.min(.8, difficulty * .025) + Math.max(0, difficulty - 18) * .06 + Math.pow(Math.max(0, difficulty - 25) / 10, 2) * .3) * earlyEase;
        this.health = this.maxHealth;
        this.damage = this.baseDamage * (1 + Math.min(.8, difficulty * .035));
        this.color = this.baseColor;
        this.hitTimer = 0; this.stunTimer = 0; this.attackCooldown = 0;
        this.pushX = 0; this.pushY = 0; this.deadHandled = false;
        this.isBoss = false; this.isMiniBoss = false; this.isMini = false;
        this.isElite = false; this.eliteAbility = null; this.eliteTimer = 0; this.lastDamaged = 0;
        this.behaviorTick = Math.random() * 80;
        return this;
    }

    update(dt, targetX, targetY) {
        if (!this.active) return;
        this.hitTimer = Math.max(0, this.hitTimer - dt);
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        if (this.isElite && this.eliteAbility === 'shield') { this.eliteTimer -= dt; if (this.eliteTimer < -3400) this.eliteTimer = 1500; }
        this.behaviorTick -= dt;
        this.lastDamaged += dt;
        if (this.isElite && this.eliteAbility === 'regen' && this.lastDamaged > 2200) this.health = Math.min(this.maxHealth, this.health + this.maxHealth * .002 * dt / 16);
        if (this.isElite && this.eliteAbility === 'projectile') {
            this.eliteTimer -= dt;
            if (this.eliteTimer <= 0 && typeof spawnEnemyProjectile === 'function') { this.eliteTimer = 2600; spawnEnemyProjectile(this.x,this.y,Math.atan2(targetY-this.y,targetX-this.x),4.2,this.damage*.45,6,'#fbbf24'); }
        }
        const step = Math.min(dt, 50) / 16;
        if (Math.abs(this.pushX) > .1 || Math.abs(this.pushY) > .1) {
            this.x += this.pushX * step; this.y += this.pushY * step;
            this.pushX *= .84; this.pushY *= .84;
        }
        if (this.stunTimer > 0) { this.stunTimer -= dt; return; }
        const angle = Math.atan2(targetY - this.y, targetX - this.x);
        this.move(angle, this.speed, step);
    }

    move(angle, speed, step) {
        this.x = clamp(this.x + Math.cos(angle) * speed * step, 18, arena.width - 18);
        this.y = clamp(this.y + Math.sin(angle) * speed * step, 18, arena.height - 18);
    }

    takeDamage(amount) {
        if (!this.active || !Number.isFinite(amount)) return false;
        if(this.relaySource&&this.relaySource.active){this.relaySource.health-=Math.max(0,amount)*.18;amount*=.82;}else this.relaySource=null;
        if (this.isElite && this.eliteAbility === 'shield' && this.eliteTimer > 0) amount *= .35;
        this.health -= Math.max(0, amount); this.hitTimer = 100; this.lastDamaged = 0;
        if (this.health <= 0) { this.health = 0; this.active = false; }
        return !this.active;
    }

    applyStun(duration, forceX = 0, forceY = 0) {
        if (this.isBoss) duration *= .25;
        else if (this.isMiniBoss) duration *= .5;
        else if (this.isElite && this.eliteAbility === 'quakeResist') duration *= .35;
        this.stunTimer = Math.max(this.stunTimer, duration);
        this.pushX += forceX; this.pushY += forceY;
    }

    onDeath() {}

    makeElite(ability) {
        this.isElite = true; this.eliteAbility = ability; this.size *= 1.13;
        this.maxHealth *= 1.65; this.health = this.maxHealth; this.scoreValue = Math.round(this.scoreValue * 2.4);
        if (ability === 'speed') this.speed *= 1.3;
        if (ability === 'shield') this.eliteTimer = 1600;
        return this;
    }

    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y);
        ctx.fillStyle = this.hitTimer > 0 ? '#fff' : this.color;
        ctx.shadowBlur = this.isBoss ? 22 : (this.isMiniBoss ? 14 : 5);
        ctx.shadowColor = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(this.size / 4 - 2, -this.size / 4, 4, 4);
        ctx.fillRect(this.size / 4 - 2, this.size / 4 - 4, 4, 4);
        if (this.isElite) { ctx.strokeStyle='#fbbf24';ctx.lineWidth=3;ctx.strokeRect(-this.size/2-4,-this.size/2-4,this.size+8,this.size+8); }
        ctx.restore();
    }
}

class FastZombie extends Zombie {
    constructor() { super(); this.baseSize=20; this.baseSpeed=2.65; this.baseHealth=15; this.baseDamage=5; this.baseColor='#38bdf8'; this.type='fast'; }
}

class TankZombie extends Zombie {
    constructor() { super(); this.baseSize=40; this.baseSpeed=.78; this.baseHealth=110; this.baseDamage=22; this.baseColor='#7f1d1d'; this.type='tank'; this.scoreValue=22; }
}

class ExplosiveZombie extends Zombie {
    constructor() { super(); this.baseSize=28; this.baseSpeed=1.18; this.baseHealth=26; this.baseDamage=10; this.baseColor='#ef4444'; this.type='explosive'; this.scoreValue=18; }
    init(x,y,d){ super.init(x,y,d); this.fuse=0; return this; }
    takeDamage(amount) {
        const died = super.takeDamage(amount);
        if (died) window.dispatchEvent(new CustomEvent('zombie_explosion_warning',{detail:{x:this.x,y:this.y,radius:105,damage:22}}));
        return died;
    }
    draw(ctx){ super.draw(ctx); ctx.save(); ctx.strokeStyle=`rgba(254,202,202,${.45+.4*Math.sin(performance.now()/90)})`; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(this.x,this.y,this.size*.75,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
}

class JumperZombie extends Zombie {
    constructor(){ super(); this.baseSize=30; this.baseSpeed=.85; this.baseHealth=48; this.baseDamage=12; this.baseColor='#a78bfa'; this.type='jumper'; this.scoreValue=24; }
    init(x,y,d){ super.init(x,y,d); this.jumpTimer=2600+Math.random()*1300; this.jumpState='walk'; this.telegraph=0; this.targetX=x; this.targetY=y; return this; }
    update(dt,tx,ty){
        if(this.stunTimer>0){ super.update(dt,tx,ty); return; }
        if(this.jumpState==='walk'){
            super.update(dt,tx,ty); this.jumpTimer-=dt;
            if(this.jumpTimer<=0){ this.jumpState='warn'; this.telegraph=850; this.targetX=clamp(tx+(Math.random()-.5)*90,60,arena.width-60); this.targetY=clamp(ty+(Math.random()-.5)*90,60,arena.height-60); }
        } else if(this.jumpState==='warn'){
            this.telegraph-=dt; if(this.telegraph<=0){ this.jumpState='leap'; this.telegraph=420; }
        } else {
            const amount=Math.min(1,dt/Math.max(1,this.telegraph)); this.x+=(this.targetX-this.x)*amount; this.y+=(this.targetY-this.y)*amount; this.telegraph-=dt;
            if(this.telegraph<=0){ this.jumpState='walk'; this.jumpTimer=3500+Math.random()*1300; createHazard('quake',this.x,this.y,{radius:115,warning:0,duration:550,damage:9,slow:.55}); }
        }
    }
    draw(ctx){ if(this.jumpState==='warn'||this.jumpState==='leap'){ctx.save();ctx.strokeStyle='rgba(167,139,250,.8)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(this.targetX,this.targetY,55,0,Math.PI*2);ctx.stroke();ctx.restore();} super.draw(ctx); }
}

class RunnerZombie extends Zombie {
    constructor(){ super(); this.baseSize=25; this.baseSpeed=1.6; this.baseHealth=42; this.baseDamage=15; this.baseColor='#fb923c'; this.type='runner'; this.scoreValue=24; }
    init(x,y,d){super.init(x,y,d);this.dashTimer=2200+Math.random()*1600;this.dashState='chase';this.dashAngle=0;this.telegraph=0;return this;}
    update(dt,tx,ty){
        if(this.stunTimer>0){super.update(dt,tx,ty);return;}
        if(this.dashState==='chase'){super.update(dt,tx,ty);this.dashTimer-=dt;if(this.dashTimer<=0){this.dashState='aim';this.telegraph=650;this.dashAngle=Math.atan2(ty-this.y,tx-this.x);}}
        else if(this.dashState==='aim'){this.telegraph-=dt;if(this.telegraph<=0){this.dashState='dash';this.telegraph=520;}}
        else {const step=Math.min(dt,40)/16;this.x+=Math.cos(this.dashAngle)*8*step;this.y+=Math.sin(this.dashAngle)*8*step;this.telegraph-=dt;const hitWall=this.x<22||this.x>arena.width-22||this.y<22||this.y>arena.height-22;if(hitWall){this.x=clamp(this.x,22,arena.width-22);this.y=clamp(this.y,22,arena.height-22);this.applyStun(1250);this.telegraph=0;}if(this.telegraph<=0){this.dashState='chase';this.dashTimer=2600+Math.random()*1600;}}
    }
    draw(ctx){if(this.dashState==='aim'){ctx.save();ctx.strokeStyle='rgba(251,146,60,.8)';ctx.lineWidth=3;ctx.setLineDash([12,8]);ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(this.x+Math.cos(this.dashAngle)*240,this.y+Math.sin(this.dashAngle)*240);ctx.stroke();ctx.restore();}super.draw(ctx);}
}

class ShooterZombie extends Zombie {
    constructor(){super();this.baseSize=28;this.baseSpeed=1;this.baseHealth=38;this.baseDamage=9;this.baseColor='#e879f9';this.type='shooter';this.scoreValue=28;}
    init(x,y,d){super.init(x,y,d);this.shotTimer=1300+Math.random()*900;this.charge=0;return this;}
    update(dt,tx,ty){const dist=distance(this.x,this.y,tx,ty);const angle=Math.atan2(ty-this.y,tx-this.x);if(this.stunTimer>0){super.update(dt,tx,ty);return;}if(dist<250)this.move(angle+Math.PI,this.speed,Math.min(dt,50)/16);else if(dist>420)this.move(angle,this.speed,Math.min(dt,50)/16);this.shotTimer-=dt;if(this.charge>0){this.charge-=dt;if(this.charge<=0){spawnEnemyProjectile(this.x,this.y,angle,4.7,this.damage,7,'#f472b6');this.shotTimer=1900+Math.random()*900;}}else if(this.shotTimer<=0)this.charge=600;}
    draw(ctx){if(this.charge>0){ctx.save();ctx.fillStyle=`rgba(244,114,182,${.35+.45*(1-this.charge/600)})`;ctx.beginPath();ctx.arc(this.x,this.y,this.size*.9,0,Math.PI*2);ctx.fill();ctx.restore();}super.draw(ctx);}
}

class MiniZombie extends FastZombie {
    constructor(){super();this.baseSize=13;this.baseSpeed=3.1;this.baseHealth=8;this.baseDamage=4;this.baseColor='#86efac';this.type='mini';this.scoreValue=4;}
    init(x,y,d){super.init(x,y,d);this.isMini=true;return this;}
}

class ParentZombie extends Zombie {
    constructor(){super();this.baseSize=37;this.baseSpeed=1.05;this.baseHealth=92;this.baseDamage=13;this.baseColor='#22c55e';this.type='parent';this.scoreValue=32;}
    onDeath(){const children=Math.min(4,2+Math.floor(currentRound/15));for(let i=0;i<children;i++)queueDirectSpawn('mini',this.x+(Math.random()-.5)*50,this.y+(Math.random()-.5)*50);}
}

class ShieldZombie extends Zombie {
    constructor(){super();this.baseSize=34;this.baseSpeed=.82;this.baseHealth=85;this.baseDamage=14;this.baseColor='#64748b';this.type='shield';this.scoreValue=28;}
    init(x,y,d){super.init(x,y,d);this.facing=0;return this;}
    update(dt,tx,ty){this.facing=Math.atan2(ty-this.y,tx-this.x);super.update(dt,tx,ty);}
    takeDamage(amount,sourceAngle){let multiplier=1;if(Number.isFinite(sourceAngle)){const front=Math.abs(Math.atan2(Math.sin(sourceAngle-this.facing),Math.cos(sourceAngle-this.facing)));multiplier=front<1.05 ? .3 : 1.2;}return super.takeDamage(amount*multiplier);}
    draw(ctx){super.draw(ctx);ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.facing);ctx.strokeStyle='#cbd5e1';ctx.lineWidth=7;ctx.beginPath();ctx.arc(0,0,this.size*.7,-1.05,1.05);ctx.stroke();ctx.restore();}
}

class HealerZombie extends Zombie {
    constructor(){super();this.baseSize=24;this.baseSpeed=1.15;this.baseHealth=26;this.baseDamage=5;this.baseColor='#34d399';this.type='healer';this.scoreValue=32;}
    init(x,y,d){super.init(x,y,d);this.healTimer=900;this.healLinks=[];return this;}
    update(dt,tx,ty){super.update(dt,tx,ty);this.healTimer-=dt;if(this.healTimer<=0){this.healTimer=1000;this.healLinks=[];let healed=0;for(const z of zombies){if(z!==this&&z.active&&distance(this.x,this.y,z.x,z.y)<190&&z.health<z.maxHealth&&healed<3){const amount=z.isBoss?1:z.isMiniBoss?2:5;z.health=Math.min(z.maxHealth,z.health+amount);this.healLinks.push(z);healed++;}}}}
    draw(ctx){super.draw(ctx);ctx.save();ctx.strokeStyle='rgba(52,211,153,.55)';ctx.lineWidth=2;for(const z of this.healLinks){if(z.active){ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(z.x,z.y);ctx.stroke();}}ctx.restore();}
}

class GhostZombie extends Zombie {
    constructor(){super();this.baseSize=27;this.baseSpeed=1.75;this.baseHealth=34;this.baseDamage=11;this.baseColor='#c4b5fd';this.type='ghost';this.scoreValue=30;}
    init(x,y,d){super.init(x,y,d);this.phaseTimer=1200+Math.random()*1200;this.phased=false;return this;}
    update(dt,tx,ty){this.phaseTimer-=dt;if(this.phaseTimer<=0){this.phased=!this.phased;this.phaseTimer=this.phased?1300:900;}if(distance(this.x,this.y,tx,ty)<100)this.phased=false;const boost=this.phased?this.speed*1.25:this.speed;const old=this.speed;this.speed=boost;super.update(dt,tx,ty);this.speed=old;}
    takeDamage(amount,a){return super.takeDamage(amount*(this.phased ? .45 : 1),a);}
    draw(ctx){ctx.save();ctx.globalAlpha=this.phased ? .25 : .9;super.draw(ctx);ctx.globalAlpha=.22;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(this.x,this.y+this.size*.65,this.size*.55,this.size*.2,0,0,Math.PI*2);ctx.fill();ctx.restore();}
}

class MagneticZombie extends Zombie {
    constructor(){super();this.baseSize=36;this.baseSpeed=.72;this.baseHealth=105;this.baseDamage=12;this.baseColor='#06b6d4';this.type='magnetic';this.scoreValue=38;}
    init(x,y,d){super.init(x,y,d);this.magnetRadius=220;return this;}
    update(dt,tx,ty){super.update(dt,tx,ty);if(gameState==='PLAYING'&&player&&distance(this.x,this.y,player.x,player.y)<this.magnetRadius){const a=Math.atan2(this.y-player.y,this.x-player.x);const strength=.32*Math.min(dt,40)/16;player.x+=Math.cos(a)*strength;player.y+=Math.sin(a)*strength;}}
    draw(ctx){ctx.save();ctx.strokeStyle='rgba(34,211,238,.28)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(this.x,this.y,this.magnetRadius,0,Math.PI*2);ctx.stroke();ctx.restore();super.draw(ctx);}
}

const MINIBOSS_ROTATION=['breaker','broodmother','arenaWarden','redMaw','signal','hollowKnight'];
const BOSS_ROTATION=['graveEngine','theMaw','paleChoir','blackSun','butcher','rootKing'];
const ENCOUNTER_MODIFIERS=['armored','frenzied','corrupted','brood','volatile','phasebound','warden','bloodless'];
function encounterName(id){return typeof ENEMY_CATALOG!=='undefined'&&ENEMY_CATALOG[id]?ENEMY_CATALOG[id].name:id;}
function radialShot(source,count,speed,damage,color,offset=0){for(let i=0;i<count;i++)spawnEnemyProjectile(source.x,source.y,offset+i*Math.PI*2/count,speed,damage,7,color);}

class MiniBossZombie extends Zombie {
    constructor(){super();this.baseSize=62;this.baseSpeed=.95;this.baseHealth=420;this.baseDamage=20;this.baseColor='#f97316';this.type='miniboss';this.scoreValue=250;}
    init(x,y,d){
        super.init(x,y,d);this.isMiniBoss=true;this.variant=chooseMinibossForEncounter(d);this.bestiaryId=this.variant;this.displayName=encounterName(this.variant);this.color=ENEMY_CATALOG[this.variant]?.color||this.baseColor;this.phase=1;
        const cycle=Math.floor(Math.max(0,d-5)/60);this.modifier=difficultyProfile.bossTier>=3?ENCOUNTER_MODIFIERS[(cycle+Math.floor(selectedDifficulty/100))%ENCOUNTER_MODIFIERS.length]:null;this.maxHealth=this.baseHealth*(1+d*.075+Math.pow(Math.max(0,d-8)/10,2)*.35)*(this.modifier==='armored'?1.22:this.modifier==='frenzied' ? .88 : 1);this.health=this.maxHealth;if(this.modifier==='frenzied')this.speed*=1.25;
        this.skillTimer=1500;this.moveSkill=2600;this.arenaSkill=4400;return this;
    }
    update(dt,tx,ty){
        this.phase=this.health/this.maxHealth<.5?2:1;const a=Math.atan2(ty-this.y,tx-this.x);this.skillTimer-=dt;this.moveSkill-=dt;this.arenaSkill-=dt;
        const old=this.speed;this.speed*=this.phase===2?1.15:1;super.update(dt,tx,ty);this.speed=old;
        if(this.moveSkill<=0){this.moveSkill=this.phase===2?2400:3400;if(['breaker','redMaw','hollowKnight'].includes(this.variant)){this.pushX=Math.cos(a)*(this.phase===2?17:13);this.pushY=Math.sin(a)*(this.phase===2?17:13);}else if(['broodmother','signal'].includes(this.variant)){const nx=clamp(tx+(Math.random()-.5)*380,100,arena.width-100),ny=clamp(ty+(Math.random()-.5)*300,100,arena.height-100);createHazard('quake',nx,ny,{radius:95,warning:800,duration:500,damage:8});this.x=nx;this.y=ny;}}
        if(this.skillTimer<=0){this.skillTimer=this.phase===2?1650:2400;if(this.variant==='breaker'||this.variant==='hollowKnight'){for(let i=-2;i<=2;i++)spawnEnemyProjectile(this.x,this.y,a+i*.18,4.8,this.damage*.55,7,this.color);}else if(this.variant==='broodmother'){for(let i=0;i<(this.phase===2?3:2);i++)queueDirectSpawn('mini',this.x+(Math.random()-.5)*100,this.y+(Math.random()-.5)*100);}else if(this.variant==='arenaWarden')radialShot(this,8+this.phase*2,3.8,this.damage*.4,this.color);else if(this.variant==='redMaw')createHazard('fire',tx,ty,{radius:90,warning:850,duration:2500,damage:10});else if(this.variant==='signal'){if(Spawner.activeType('turret')<2)queueDirectSpawn('turret',this.x+(Math.random()-.5)*240,this.y+(Math.random()-.5)*240);radialShot(this,6,4.2,this.damage*.4,this.color,a);} }
        if(this.arenaSkill<=0){this.arenaSkill=this.phase===2?3400:5000;if(this.variant==='arenaWarden'||this.variant==='hollowKnight')createHazard('wall',clamp(tx+(Math.random()-.5)*360,120,arena.width-120),clamp(ty+(Math.random()-.5)*300,120,arena.height-120),{radius:75,warning:900,duration:4200,health:55});else if(this.variant==='broodmother')createHazard('crate',this.x+(Math.random()-.5)*160,this.y+(Math.random()-.5)*160,{radius:35,warning:500,duration:5500,health:22});else if(this.variant==='redMaw'){const prey=zombies.find(z=>z!==this&&z.active&&!z.isBoss&&!z.isMiniBoss&&distance(this.x,this.y,z.x,z.y)<210);if(prey){prey.active=false;this.health=Math.min(this.maxHealth,this.health+this.maxHealth*.045);}createHazard('fire',this.x,this.y,{radius:110,warning:850,duration:2200,damage:10});}else createHazard(this.modifier==='corrupted'?'poison':'quake',tx,ty,{radius:130,warning:900,duration:900,damage:12});}
    }
}

class BossZombie extends Zombie {
    constructor(){super();this.baseSize=94;this.baseSpeed=.68;this.baseHealth=1100;this.baseDamage=25;this.baseColor='#dc2626';this.type='boss';this.scoreValue=1000;}
    init(x,y,d){super.init(x,y,d);this.isBoss=true;this.evolution=Math.max(1,Math.floor(d/10));this.variant=chooseBossForEncounter(d);this.bestiaryId=this.variant;this.displayName=encounterName(this.variant);this.color=ENEMY_CATALOG[this.variant]?.color||this.baseColor;this.modifier=difficultyProfile.bossTier>=3?ENCOUNTER_MODIFIERS[(this.evolution+Math.floor(selectedDifficulty/100))%ENCOUNTER_MODIFIERS.length]:null;this.maxHealth=this.baseHealth*(1+d*.11+Math.pow(Math.max(0,d-8)/10,2)*.6)*(this.modifier==='armored'?1.2:this.modifier==='frenzied' ? .86 : 1);this.health=this.maxHealth;if(this.modifier==='frenzied')this.speed*=1.22;this.skillTimer=1400;this.phase=1;this.arenaSkillTimer=4200;this.moveSkillTimer=2900;return this;}
    update(dt,tx,ty){
        const ratio=this.health/this.maxHealth,maxPhase=difficultyProfile.bossTier===1?2:3;this.phase=Math.min(maxPhase,ratio<=.25?3:ratio<=.6?2:1);
        const old=this.speed;this.speed*=1+(this.phase-1)*.18;super.update(dt,tx,ty);this.speed=old;
        this.skillTimer-=dt;this.arenaSkillTimer-=dt;this.moveSkillTimer-=dt;const a=Math.atan2(ty-this.y,tx-this.x);
        if(this.skillTimer<=0){this.skillTimer=Math.max(850,2350-(this.phase-1)*390-this.evolution*35);const tierBonus=difficultyProfile.bossTier>=4?2:difficultyProfile.bossTier>=3?1:0;if(this.variant==='blackSun'||this.variant==='paleChoir')radialShot(this,5+this.phase*2+tierBonus,3.8+this.phase*.25,this.damage*.38,this.color,a);else{const shots=3+this.phase*2+tierBonus;for(let i=0;i<shots;i++)spawnEnemyProjectile(this.x,this.y,a+(i-(shots-1)/2)*.17,4.2+this.phase*.3,this.damage*.42,8,this.color);}if((this.variant==='rootKing'||this.variant==='graveEngine')&&difficultyProfile.bossTier>=2)createHazard(this.variant==='rootKing'?'poison':'fire',tx,ty,{radius:105,warning:900,duration:2400,damage:10});}
        if(this.moveSkillTimer<=0){this.moveSkillTimer=Math.max(1900,3600-this.phase*380);if(['theMaw','butcher','graveEngine'].includes(this.variant)){this.pushX=Math.cos(a)*(14+this.phase*3);this.pushY=Math.sin(a)*(14+this.phase*3);}else if(this.variant==='blackSun'&&this.phase>=2){this.x=clamp(tx+(Math.random()-.5)*620,110,arena.width-110);this.y=clamp(ty+(Math.random()-.5)*480,110,arena.height-110);}else if(this.variant==='paleChoir')radialShot(this,4+this.phase*2,5,this.damage*.35,this.color,a+Math.PI/4);}
        if(this.arenaSkillTimer<=0){this.arenaSkillTimer=Math.max(3000,5900-this.phase*650);if(difficultyProfile.bossTier===1&&this.phase===1){createHazard('quake',tx,ty,{radius:115,warning:1250,duration:700,damage:8});return;}if(this.variant==='graveEngine'){if(Spawner.activeType('turret')<2)queueDirectSpawn('turret',this.x+180,this.y);createHazard('fire',tx,ty,{radius:125,warning:1000,duration:2600,damage:11});}else if(this.variant==='theMaw'){createHazard('hole',tx,ty,{radius:90,warning:1300,duration:4200,damage:12});for(let i=0;i<this.phase;i++)queueDirectSpawn('leech',this.x+(Math.random()-.5)*150,this.y+(Math.random()-.5)*150);}else if(this.variant==='paleChoir'){for(let i=0;i<Math.min(3,this.phase+1);i++)queueDirectSpawn('ghost',this.x+(Math.random()-.5)*240,this.y+(Math.random()-.5)*240);}else if(this.variant==='blackSun'){document.body.classList.add('round-darkness');setTimeout(()=>{if(!hasModifier('Oscuridad'))document.body.classList.remove('round-darkness');},3500);createHazard('quake',tx,ty,{radius:150,warning:1000,duration:800,damage:12});}else if(this.variant==='butcher'){for(let i=-1;i<=1;i++)spawnEnemyProjectile(this.x,this.y,a+i*.38,6.8,this.damage*.5,10,this.color);}else{createHazard('wall',clamp(tx+(Math.random()-.5)*320,120,arena.width-120),clamp(ty+(Math.random()-.5)*280,120,arena.height-120),{radius:85,warning:1000,duration:5000,health:70});createHazard('poison',tx,ty,{radius:100,warning:850,duration:3300,damage:8});if(this.phase>=2)queueDirectSpawn('sporeCarrier',this.x+140,this.y);}}
    }
}

class SummonerZombie extends Zombie {
    constructor(){super();this.baseSize=29;this.baseSpeed=.9;this.baseHealth=36;this.baseDamage=6;this.baseColor='#8b5cf6';this.type='summoner';this.scoreValue=36;}
    init(x,y,d){super.init(x,y,d);this.summonTimer=2200;this.summonCharge=0;return this;}
    update(dt,tx,ty){const dist=distance(this.x,this.y,tx,ty),a=Math.atan2(ty-this.y,tx-this.x),step=Math.min(dt,50)/16;if(dist<270)this.move(a+Math.PI,this.speed,step);else if(dist>430)this.move(a,this.speed,step);this.summonTimer-=dt;if(this.summonCharge>0){this.summonCharge-=dt;if(this.summonCharge<=0){const available=Math.max(0,ENTITY_LIMITS.minis-zombies.filter(z=>z.active&&z.isMini).length);for(let i=0;i<Math.min(3,available);i++)queueDirectSpawn('mini',this.x+(Math.random()-.5)*70,this.y+(Math.random()-.5)*70);this.summonTimer=4300;}}else if(this.summonTimer<=0)this.summonCharge=900;}
    draw(ctx){if(this.summonCharge>0){ctx.save();ctx.strokeStyle='#c4b5fd';ctx.lineWidth=3;ctx.beginPath();ctx.arc(this.x,this.y,22+18*(1-this.summonCharge/900),0,Math.PI*2);ctx.stroke();ctx.restore();}super.draw(ctx);}
}

class ChainZombie extends Zombie {
    constructor(){super();this.baseSize=31;this.baseSpeed=1.05;this.baseHealth=58;this.baseDamage=10;this.baseColor='#a16207';this.type='chain';this.scoreValue=38;}
    init(x,y,d){super.init(x,y,d);this.chainTimer=1900;this.chainState='move';this.chainAngle=0;this.telegraph=0;return this;}
    update(dt,tx,ty){const dist=distance(this.x,this.y,tx,ty);if(this.chainState==='move'){super.update(dt,tx,ty);this.chainTimer-=dt;if(this.chainTimer<=0&&dist<380){this.chainState='aim';this.telegraph=800;this.chainAngle=Math.atan2(ty-this.y,tx-this.x);}}else{this.telegraph-=dt;if(this.telegraph<=0){const current=Math.atan2(ty-this.y,tx-this.x),diff=Math.abs(Math.atan2(Math.sin(current-this.chainAngle),Math.cos(current-this.chainAngle)));if(diff<.18&&dist<390){player.x+=(this.x-player.x)*.18;player.y+=(this.y-player.y)*.18;}else this.stunTimer=850;this.chainState='move';this.chainTimer=3000;}}}
    draw(ctx){if(this.chainState==='aim'){ctx.save();ctx.strokeStyle='rgba(250,204,21,.75)';ctx.lineWidth=3;ctx.setLineDash([10,7]);ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(this.x+Math.cos(this.chainAngle)*390,this.y+Math.sin(this.chainAngle)*390);ctx.stroke();ctx.restore();}super.draw(ctx);}
}

class PoisonZombie extends Zombie {
    constructor(){super();this.baseSize=27;this.baseSpeed=1.25;this.baseHealth=44;this.baseDamage=8;this.baseColor='#84cc16';this.type='poison';this.scoreValue=32;}
    init(x,y,d){super.init(x,y,d);this.trailTimer=1700+Math.random()*800;return this;}
    update(dt,tx,ty){super.update(dt,tx,ty);this.trailTimer-=dt;if(this.trailTimer<=0){this.trailTimer=2600;createHazard('poison',this.x,this.y,{radius:48,warning:250,duration:4300,damage:5});}}
    onDeath(){createHazard('poison',this.x,this.y,{radius:65,warning:350,duration:4800,damage:6});}
}

class FreezerZombie extends Zombie {
    constructor(){super();this.baseSize=29;this.baseSpeed=.95;this.baseHealth=46;this.baseDamage=7;this.baseColor='#67e8f9';this.type='freezer';this.scoreValue=38;}
    init(x,y,d){super.init(x,y,d);this.shotTimer=1700;this.charge=0;return this;}
    update(dt,tx,ty){const dist=distance(this.x,this.y,tx,ty),a=Math.atan2(ty-this.y,tx-this.x),step=Math.min(dt,50)/16;if(dist<260)this.move(a+Math.PI,this.speed,step);else if(dist>430)this.move(a,this.speed,step);this.shotTimer-=dt;if(this.charge>0){this.charge-=dt;if(this.charge<=0){spawnEnemyProjectile(this.x,this.y,a,3.2,this.damage,9,'#67e8f9','freeze');this.shotTimer=2600;}}else if(this.shotTimer<=0)this.charge=650;}
    draw(ctx){if(this.charge>0){ctx.save();ctx.strokeStyle='#cffafe';ctx.lineWidth=3;ctx.beginPath();ctx.arc(this.x,this.y,this.size*.8,0,Math.PI*2);ctx.stroke();ctx.restore();}super.draw(ctx);}
}

class DuplicateMiniZombie extends Zombie {
    constructor(){super();this.baseSize=18;this.baseSpeed=2;this.baseHealth=17;this.baseDamage=5;this.baseColor='#f0abfc';this.type='duplicateMini';this.scoreValue=7;}
    init(x,y,d){super.init(x,y,d);this.isMini=true;return this;}
}

class DuplicatorZombie extends Zombie {
    constructor(){super();this.baseSize=35;this.baseSpeed=1.18;this.baseHealth=74;this.baseDamage=11;this.baseColor='#d946ef';this.type='duplicator';this.scoreValue=42;}
    init(x,y,d){super.init(x,y,d);this.hasSplit=false;return this;}
    takeDamage(amount,a){const died=super.takeDamage(amount,a);if(!died&&!this.hasSplit&&this.health<this.maxHealth*.52&&zombies.filter(z=>z.active&&z.isMini).length<ENTITY_LIMITS.minis-2){this.hasSplit=true;this.active=false;queueDirectSpawn('duplicateMini',this.x-18,this.y);queueDirectSpawn('duplicateMini',this.x+18,this.y);return true;}return died;}
}

class BombZombie extends Zombie {
    constructor(){super();this.baseSize=30;this.baseSpeed=1.45;this.baseHealth=34;this.baseDamage=18;this.baseColor='#be123c';this.type='bomb';this.scoreValue=34;}
    init(x,y,d){super.init(x,y,d);this.armed=false;this.fuse=0;return this;}
    update(dt,tx,ty){const dist=distance(this.x,this.y,tx,ty);if(!this.armed&&dist<360){this.armed=true;this.fuse=2200;}if(this.armed){this.fuse-=dt;const old=this.speed;this.speed*=1.75;super.update(dt,tx,ty);this.speed=old;if(this.fuse<=0){this.active=false;window.dispatchEvent(new CustomEvent('zombie_explosion_warning',{detail:{x:this.x,y:this.y,radius:135,damage:30}}));}}else super.update(dt,tx,ty);}
    draw(ctx){super.draw(ctx);if(this.armed){ctx.save();ctx.strokeStyle=Math.floor(this.fuse/180)%2?'#fff':'#fb7185';ctx.lineWidth=4;ctx.beginPath();ctx.arc(this.x,this.y,this.size*.72,0,Math.PI*2);ctx.stroke();ctx.restore();}}
}

class SniperZombie extends Zombie {
    constructor(){super();this.baseSize=24;this.baseSpeed=.65;this.baseHealth=27;this.baseDamage=15;this.baseColor='#f43f5e';this.type='sniper';this.scoreValue=48;}
    init(x,y,d){super.init(x,y,d);this.aimTimer=1500;this.cooldown=2100;this.aiming=false;this.aimAngle=0;return this;}
    update(dt,tx,ty){if(!this.aiming&&this.cooldown>0){this.cooldown-=dt;const wallDist=Math.min(this.x,arena.width-this.x,this.y,arena.height-this.y);if(wallDist>90)super.update(dt,this.x<arena.width/2?35:arena.width-35,this.y);}else if(!this.aiming){this.aiming=true;this.aimTimer=1400;this.aimAngle=Math.atan2(ty-this.y,tx-this.x);}else{this.aimTimer-=dt;if(this.aimTimer<=0){spawnEnemyProjectile(this.x,this.y,this.aimAngle,9.2,this.damage,6,'#fb7185','sniper');this.aiming=false;this.cooldown=3000;}}}
    draw(ctx){if(this.aiming){ctx.save();ctx.strokeStyle='rgba(251,113,133,.9)';ctx.lineWidth=2;ctx.setLineDash([18,7]);ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(this.x+Math.cos(this.aimAngle)*900,this.y+Math.sin(this.aimAngle)*900);ctx.stroke();ctx.restore();}super.draw(ctx);}
}

class BuilderZombie extends Zombie {
    constructor(){super();this.baseSize=32;this.baseSpeed=.9;this.baseHealth=62;this.baseDamage=8;this.baseColor='#78716c';this.type='builder';this.scoreValue=44;}
    init(x,y,d){super.init(x,y,d);this.buildTimer=1700+Math.random()*1200;this.buildCharge=0;return this;}
    update(dt,tx,ty){super.update(dt,tx,ty);this.buildTimer-=dt;if(this.buildCharge>0){this.buildCharge-=dt;if(this.buildCharge<=0){const a=Math.atan2(ty-this.y,tx-this.x)+Math.PI/2;createHazard('wall',this.x+Math.cos(a)*55,this.y+Math.sin(a)*55,{radius:58,warning:450,duration:6500,health:38});this.buildTimer=4300;}}else if(this.buildTimer<=0)this.buildCharge=700;}
    draw(ctx){if(this.buildCharge>0){ctx.save();ctx.strokeStyle='#d6d3d1';ctx.strokeRect(this.x-24,this.y-24,48,48);ctx.restore();}super.draw(ctx);}
}

class CamouflageZombie extends Zombie {
    constructor(){super();this.baseSize=27;this.baseSpeed=1.85;this.baseHealth=36;this.baseDamage=14;this.baseColor='#65a30d';this.type='camouflage';this.scoreValue=45;}
    init(x,y,d){super.init(x,y,d);this.revealed=false;return this;}
    update(dt,tx,ty){if(distance(this.x,this.y,tx,ty)<175)this.revealed=true;if(this.revealed)super.update(dt,tx,ty);}
    draw(ctx){if(!this.revealed){ctx.save();ctx.globalAlpha=.78;ctx.fillStyle='#92400e';ctx.fillRect(this.x-17,this.y-15,34,30);ctx.strokeStyle='rgba(239,68,68,.45)';ctx.lineWidth=2;ctx.strokeRect(this.x-17,this.y-15,34,30);ctx.beginPath();ctx.arc(this.x,this.y,22,0,Math.PI*2);ctx.stroke();ctx.restore();}else super.draw(ctx);}
}

class MirrorZombie extends Zombie {
    constructor(){super();this.baseSize=33;this.baseSpeed=1.2;this.baseHealth=66;this.baseDamage=10;this.baseColor='#94a3b8';this.type='mirror';this.scoreValue=48;}
    init(x,y,d){super.init(x,y,d);this.copyTimer=6000;this.copied=Math.random()>.5?'speed':'projectile';if(this.copied==='speed'&&player)this.speed=Math.min(3.2,player.speed*.55);return this;}
    update(dt,tx,ty){super.update(dt,tx,ty);this.copyTimer-=dt;if(this.copied==='projectile'){this.eliteTimer-=dt;if(this.eliteTimer<=0){this.eliteTimer=2400;spawnEnemyProjectile(this.x,this.y,Math.atan2(ty-this.y,tx-this.x),Math.min(6,player.projectileSpeed*.55),this.damage,Math.min(9,player.projectileSize),'#cbd5e1');}}if(this.copyTimer<=0)this.copied='resistance';}
    takeDamage(amount,a){return super.takeDamage(amount*(this.copied==='resistance' ? .65 : 1),a);}
    draw(ctx){ctx.save();ctx.strokeStyle='#e2e8f0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(this.x,this.y,this.size*.75,0,Math.PI*2);ctx.stroke();ctx.restore();super.draw(ctx);}
}

class BerserkerZombie extends Zombie {
    constructor(){super();this.baseSize=31;this.baseSpeed=.75;this.baseHealth=55;this.baseDamage=13;this.baseColor='#b91c1c';this.type='berserker';this.scoreValue=38;}
    update(dt,tx,ty){const ratio=Math.max(.12,this.health/this.maxHealth),old=this.speed;this.speed*=1+(1-ratio)*2.1;super.update(dt,tx,ty);this.speed=old;}
}

class TurretZombie extends Zombie {
    constructor(){super();this.baseSize=34;this.baseSpeed=0;this.baseHealth=68;this.baseDamage=9;this.baseColor='#475569';this.type='turret';this.scoreValue=46;}
    init(x,y,d){super.init(x,y,d);this.patternTimer=1400;this.patternAngle=Math.random()*Math.PI*2;return this;}
    update(dt){this.hitTimer=Math.max(0,this.hitTimer-dt);this.attackCooldown=Math.max(0,this.attackCooldown-dt);this.patternTimer-=dt;if(this.patternTimer<=0){this.patternTimer=2200;this.patternAngle+=.35;for(let i=0;i<6;i++)spawnEnemyProjectile(this.x,this.y,this.patternAngle+i/6*Math.PI*2,3.7,this.damage*.7,6,'#94a3b8');}}
    draw(ctx){super.draw(ctx);ctx.save();ctx.strokeStyle='#cbd5e1';ctx.lineWidth=4;ctx.beginPath();ctx.arc(this.x,this.y,this.size*.62,0,Math.PI*2);ctx.stroke();ctx.restore();}
}

class PowerThiefZombie extends Zombie {
    constructor(){super();this.baseSize=30;this.baseSpeed=1.45;this.baseHealth=52;this.baseDamage=9;this.baseColor='#7c3aed';this.type='powerThief';this.scoreValue=65;}
    init(x,y,d){super.init(x,y,d);this.stole=false;this.marked=true;return this;}
    update(dt,tx,ty){super.update(dt,tx,ty);if(!this.stole&&distance(this.x,this.y,tx,ty)<210&&typeof stealPlayerBuff==='function'){this.stole=stealPlayerBuff();}}
    onDeath(){if(this.stole&&typeof restoreStolenPower==='function')restoreStolenPower();spawnFood(this.x,this.y,'cookie');}
    draw(ctx){ctx.save();ctx.strokeStyle='#facc15';ctx.lineWidth=4;ctx.beginPath();ctx.arc(this.x,this.y,this.size+8+Math.sin(Date.now()/130)*3,0,Math.PI*2);ctx.stroke();ctx.restore();super.draw(ctx);}
}

const ADVANCED_CONFIG = {
    burrower:[28,1.45,48,11,'#a16207',38],warden:[38,.72,105,9,'#6366f1',52],leech:[15,3.2,13,4,'#e11d48',26],beacon:[23,.8,30,5,'#f59e0b',46],
    splitter:[34,1.1,72,10,'#c026d3',44],splitterMini:[18,2.1,19,5,'#e879f9',9],mimic:[28,1.8,42,14,'#84cc16',45],anchor:[44,.55,140,16,'#334155',55],
    sporeCarrier:[31,1.1,62,9,'#65a30d',42],shambler:[35,.8,95,13,'#4c1d95',45],screecher:[27,.9,38,7,'#f97316',48],parasiteHost:[32,1.1,67,10,'#16a34a',46],
    parasite:[12,3.4,7,2,'#4ade80',8],wallCrawler:[24,1.8,31,11,'#f97316',44],mortar:[34,.55,60,13,'#ef4444',55],suppressor:[32,.68,58,9,'#0ea5e9',50],
    reanimator:[26,.72,34,5,'#22c55e',58],phaseWalker:[29,1.55,53,11,'#a5b4fc',48],mirrorling:[22,2.25,28,8,'#cbd5e1',42],swapper:[28,1.05,42,7,'#8b5cf6',54],
    husk:[40,.65,135,17,'#78716c',54],harvester:[34,1.05,83,12,'#a21caf',58],sentinel:[34,0,72,12,'#64748b',54],stalker:[24,1.75,34,13,'#312e81',52],
    relay:[24,.75,31,5,'#38bdf8',60],blight:[31,.75,65,8,'#3f6212',54],rammer:[38,.72,105,18,'#991b1b',55],drifter:[27,1.1,41,9,'#0891b2',48],
    collector:[29,2.15,54,8,'#ca8a04',50],gatekeeper:[36,.65,92,8,'#7c3aed',62],timekeeper:[39,.5,120,10,'#0ea5e9',65],undertaker:[38,.7,115,13,'#292524',68]
};

class AdvancedRoleZombie extends Zombie {
    constructor(role){super();const c=ADVANCED_CONFIG[role];this.role=role;this.type=role;this.baseSize=c[0];this.baseSpeed=c[1];this.baseHealth=c[2];this.baseDamage=c[3];this.baseColor=c[4];this.scoreValue=c[5];}
    init(x,y,d){super.init(x,y,d);this.state=this.role==='mimic'?'hidden':'move';this.skillTimer=1200+Math.random()*1400;this.charge=0;this.angle=0;this.targetX=x;this.targetY=y;this.phaseVisible=true;this.attached=false;this.transformed=false;this.energy=0;this.generation=this.role==='splitterMini'?1:0;this.spawnedZones=[];this.linked=[];this.lastSporeHealth=this.health;return this;}
    takeDamage(amount,a){
        if((this.role==='burrower'&&this.state==='buried')||(this.role==='phaseWalker'&&!this.phaseVisible))return false;
        if(this.role==='sporeCarrier'&&this.health<this.lastSporeHealth-this.maxHealth*.16){this.lastSporeHealth=this.health;for(let i=0;i<2;i++)spawnEnemyProjectile(this.x,this.y,Math.random()*Math.PI*2,1.5,5,6,'#84cc16','spore');}
        const died=super.takeDamage(amount,a);
        if(this.role==='husk'&&!died&&!this.transformed&&this.health<this.maxHealth*.48){this.transformed=true;this.speed*=2.7;this.size*=.72;this.color='#f97316';this.maxHealth*=.55;this.health=Math.min(this.health,this.maxHealth);}
        return died;
    }
    update(dt,tx,ty){
        const step=Math.min(dt,50)/16,dist=distance(this.x,this.y,tx,ty),toward=Math.atan2(ty-this.y,tx-this.x);this.skillTimer-=dt;
        if(this.role==='burrower')return this.updateBurrower(dt,tx,ty);
        if(this.role==='leech'&&this.attached){this.x=player.x;this.y=player.y;this.charge-=dt;player.addBuff('leechSlow',180,.82,'LC','Leech');if(this.charge<=0){if(typeof damagePlayer==='function')damagePlayer(2,{kind:'enemy',label:enemyLabel(this)});else player.takeDamage(2);this.charge=700;}return;}
        if(this.role==='mimic'&&this.state==='hidden'){if(dist<165){this.state='move';this.speed*=1.5;}else return;}
        if(this.role==='phaseWalker'){if(this.skillTimer<=0){this.phaseVisible=!this.phaseVisible;this.skillTimer=this.phaseVisible?1500:1100;}if(!this.phaseVisible){this.move(toward,this.speed*1.2,step);return;}}
        if(this.role==='mirrorling'){const leadX=(Input.keys.d?130:0)-(Input.keys.a?130:0),leadY=(Input.keys.s?130:0)-(Input.keys.w?130:0);return super.update(dt,tx+leadX,ty+leadY);}
        if(this.role==='warden'){super.update(dt,tx,ty);if(dist<210)player.addBuff('wardenSlow',180,.72,'WD','Warden');return;}
        if(this.role==='beacon'){if(dist<320)this.move(toward+Math.PI,this.speed,step);else if(dist>500)this.move(toward,this.speed,step);for(const z of zombies)if(z!==this&&z.active&&distance(this.x,this.y,z.x,z.y)<330)z.targetBoost=1.18;return;}
        if(this.role==='anchor'){super.update(dt,tx,ty);return;}
        if(this.role==='parasite'){const host=zombies.find(z=>z.active&&z!==this&&!z.isBoss&&!z.isMiniBoss&&!z.isMini&&distance(this.x,this.y,z.x,z.y)<280);if(host){const a=Math.atan2(host.y-this.y,host.x-this.x);this.move(a,this.speed,step);if(distance(this.x,this.y,host.x,host.y)<host.size){host.speed*=1.22;host.damage*=1.2;host.color='#4ade80';this.active=false;}}else super.update(dt,tx,ty);return;}
        if(this.role==='collector'&&foods.length&&player.health/player.maxHealth>.32){const food=foods.reduce((best,f)=>distance(this.x,this.y,f.x,f.y)<distance(this.x,this.y,best.x,best.y)?f:best,foods[0]);this.move(Math.atan2(food.y-this.y,food.x-this.x),this.speed,step);if(distance(this.x,this.y,food.x,food.y)<35){food.active=false;this.speed*=1.2;this.health=Math.min(this.maxHealth,this.health+this.maxHealth*.3);}return;}
        if(this.role==='drifter'){this.move(toward+Math.PI/2,this.speed,step);if(dist>460)this.move(toward,this.speed*.6,step);if(this.skillTimer<=0){this.skillTimer=1800;spawnEnemyProjectile(this.x,this.y,toward,4.4,this.damage,6,this.color);}return;}
        if(this.role==='sentinel')return this.updateSentinel(dt,tx,ty);
        if(this.role==='stalker'){const facing=player.aimAngle||0,diff=Math.abs(Math.atan2(Math.sin(toward+Math.PI-facing),Math.cos(toward+Math.PI-facing)));if(diff>1.25){this.move(toward,this.speed,step);if(dist<260&&this.skillTimer<=0){this.phaseVisible=true;this.skillTimer=1700;spawnEnemyProjectile(this.x,this.y,toward,6.2,this.damage,6,'#818cf8');}}else this.phaseVisible=false;return;}
        if(this.role==='timekeeper'){super.update(dt,tx,ty);if(dist<230)player.addBuff('timeSlow',180,.68,'TM','Time field');for(const z of zombies)if(z!==this&&z.active&&distance(this.x,this.y,z.x,z.y)<230)z.stunTimer=Math.max(z.stunTimer,18);for(const p of [...projectiles,...enemyProjectiles])if(p.active&&distance(this.x,this.y,p.x,p.y)<230){p.x-=p.vx*dt/32;p.y-=p.vy*dt/32;}return;}
        if(this.role==='relay'){this.linked=[];for(const z of zombies){if(z!==this&&z.active&&distance(this.x,this.y,z.x,z.y)<240&&this.linked.length<3){z.relaySource=this;this.linked.push(z);}}super.update(dt,tx,ty);return;}
        if(this.role==='wallCrawler')return this.updateWallCrawler(dt,tx,ty);
        if(this.role==='rammer')return this.updateRammer(dt,tx,ty);
        if(this.role==='gatekeeper'){super.update(dt,tx,ty);if(this.skillTimer<=0){this.skillTimer=6000;this.portalA={x:clamp(this.x+260,100,arena.width-100),y:clamp(this.y-160,100,arena.height-100)};this.portalB={x:clamp(this.x-260,100,arena.width-100),y:clamp(this.y+160,100,arena.height-100)};}if(this.portalA)for(const z of zombies){if(z!==this&&z.active&&distance(z.x,z.y,this.portalA.x,this.portalA.y)<28){z.x=this.portalB.x;z.y=this.portalB.y;}}return;}
        if(this.role==='swapper'){super.update(dt,tx,ty);if(this.charge>0){this.charge-=dt;if(this.charge<=0){const candidate=zombies.find(z=>z!==this&&z.active&&!z.isBoss&&distance(z.x,z.y,player.x,player.y)>180);if(candidate&&isSafePlayerPosition(candidate.x,candidate.y)){const px=player.x,py=player.y;player.x=candidate.x;player.y=candidate.y;candidate.x=px;candidate.y=py;}}}else if(this.skillTimer<=0){this.charge=1100;this.skillTimer=5000;}return;}
        if(this.role==='screecher'){if(this.charge>0){this.charge-=dt;if(this.charge<=0){const a=Math.atan2(player.y-this.y,player.x-this.x);if(dist<300){player.x+=Math.cos(a)*80;player.y+=Math.sin(a)*80;}for(const z of zombies)if(z!==this&&z.active&&distance(this.x,this.y,z.x,z.y)<300)z.speed*=1.08;this.skillTimer=4500;}}else{super.update(dt,tx,ty);if(this.skillTimer<=0)this.charge=1200;}return;}
        if(this.role==='mortar'||this.role==='suppressor'){if(dist<390)this.move(toward+Math.PI,this.speed,step);else if(dist>600)this.move(toward,this.speed,step);if(this.skillTimer<=0){this.skillTimer=this.role==='mortar'?3000:2400;createHazard(this.role==='mortar'?'mortar':'fire',clamp(tx+(Math.random()-.5)*110,70,arena.width-70),clamp(ty+(Math.random()-.5)*110,70,arena.height-70),{radius:this.role==='mortar'?72:92,warning:this.role==='mortar'?1400:900,duration:this.role==='mortar'?650:2600,damage:this.damage});}return;}
        if(this.role==='reanimator'){if(dist<380)this.move(toward+Math.PI,this.speed,step);else if(dist>560)this.move(toward,this.speed,step);if(this.skillTimer<=0){this.skillTimer=6000;reviveRecentBasic(this.x,this.y);}return;}
        if(this.role==='blight'){super.update(dt,tx,ty);if(this.skillTimer<=0){this.skillTimer=2400;const zone=createHazard('poison',this.x,this.y,{radius:42+Math.min(38,this.spawnedZones.length*8),warning:300,duration:9000,damage:5});if(zone){zone.owner=this;this.spawnedZones.push(zone);}}return;}
        if(this.role==='undertaker'){super.update(dt,tx,ty);if(this.energy>=4){this.energy=0;queueDirectSpawn('tank',this.x+45,this.y,true);}return;}
        super.update(dt,tx,ty);
        if(this.role==='leech'&&dist<player.size){this.attached=true;this.charge=500;}
        if(this.role==='sporeCarrier'&&this.skillTimer<=0){this.skillTimer=3000;spawnEnemyProjectile(this.x,this.y,Math.random()*Math.PI*2,1.3,5,6,'#84cc16','spore');}
        if(this.role==='shambler'&&this.skillTimer<=0){this.skillTimer=900;createHazard('shadow',this.x,this.y,{radius:30,warning:200,duration:1800,damage:7});}
        if(this.role==='builder'&&this.skillTimer<=0)this.skillTimer=3000;
    }
    updateBurrower(dt,tx,ty){if(this.state==='move'&&this.skillTimer<=0){this.state='buried';this.charge=1500;this.targetX=clamp(tx+(Math.random()-.5)*120,70,arena.width-70);this.targetY=clamp(ty+(Math.random()-.5)*120,70,arena.height-70);}if(this.state==='buried'){const a=Math.atan2(this.targetY-this.y,this.targetX-this.x);this.move(a,this.speed*1.5,Math.min(dt,50)/16);this.charge-=dt;if(this.charge<=0){this.state='warning';this.charge=700;}}else if(this.state==='warning'){this.charge-=dt;if(this.charge<=0){this.state='move';this.skillTimer=3500;createHazard('quake',this.x,this.y,{radius:75,warning:0,duration:550,damage:8});}}else super.update(dt,tx,ty);}
    updateSentinel(dt,tx,ty){this.angle+=dt*.00065;const target=Math.atan2(ty-this.y,tx-this.x),diff=Math.abs(Math.atan2(Math.sin(target-this.angle),Math.cos(target-this.angle)));if(diff<.12&&this.skillTimer<=0){this.skillTimer=1200;spawnEnemyProjectile(this.x,this.y,this.angle,6.4,this.damage,6,'#94a3b8');}}
    updateWallCrawler(dt,tx,ty){if(this.state==='move'){const nearest=[{x:this.x,y:30},{x:this.x,y:arena.height-30},{x:30,y:this.y},{x:arena.width-30,y:this.y}].sort((a,b)=>distance(this.x,this.y,a.x,a.y)-distance(this.x,this.y,b.x,b.y))[0];this.move(Math.atan2(nearest.y-this.y,nearest.x-this.x),this.speed,Math.min(dt,50)/16);if(this.skillTimer<=0){this.state='aim';this.charge=800;this.angle=Math.atan2(ty-this.y,tx-this.x);}}else{this.charge-=dt;if(this.charge<=0){this.x+=Math.cos(this.angle)*8*Math.min(dt,50)/16;this.y+=Math.sin(this.angle)*8*Math.min(dt,50)/16;this.state='move';this.skillTimer=2800;}}}
    updateRammer(dt,tx,ty){if(this.state==='move'){super.update(dt,tx,ty);if(this.skillTimer<=0){this.state='aim';this.charge=850;this.angle=Math.atan2(ty-this.y,tx-this.x);}}else if(this.state==='aim'){this.charge-=dt;if(this.charge<=0){this.state='dash';this.charge=850;}}else{const step=Math.min(dt,40)/16;this.x+=Math.cos(this.angle)*9*step;this.y+=Math.sin(this.angle)*9*step;for(const z of zombies)if(z!==this&&z.active&&distance(this.x,this.y,z.x,z.y)<this.size+z.size){z.pushX+=Math.cos(this.angle)*12;z.pushY+=Math.sin(this.angle)*12;}this.charge-=dt;if(this.x<25||this.x>arena.width-25||this.y<25||this.y>arena.height-25){this.takeDamage(this.maxHealth*.18);this.applyStun(1500);this.charge=0;}if(this.charge<=0){this.state='move';this.skillTimer=3300;}}}
    onDeath(){
        if(this.role==='splitter'){for(let i=0;i<2;i++)queueDirectSpawn('splitterMini',this.x+(i?20:-20),this.y);}
        if(this.role==='splitterMini'&&this.generation===1){for(let i=0;i<2;i++)queueDirectSpawn('mini',this.x+(i?12:-12),this.y);}
        if(this.role==='parasiteHost')queueDirectSpawn('parasite',this.x,this.y);
        if(this.role==='blight')for(const o of obstacles)if(o.owner===this)o.duration=Math.min(o.duration,900);
        if(this.role==='relay')for(const z of this.linked)if(z.relaySource===this)z.relaySource=null;
    }
    draw(ctx){
        if(this.role==='burrower'&&this.state==='buried'){ctx.save();ctx.strokeStyle='#a16207';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(this.x-15,this.y);ctx.lineTo(this.x-4,this.y-5);ctx.lineTo(this.x+5,this.y+4);ctx.lineTo(this.x+16,this.y-2);ctx.stroke();ctx.restore();return;}
        if(this.role==='mimic'&&this.state==='hidden'){ctx.save();ctx.fillStyle='#92400e';ctx.globalAlpha=.85;ctx.fillRect(this.x-16,this.y-16,32,32);ctx.strokeStyle='#65a30d';ctx.strokeRect(this.x-12,this.y-12,24,24);ctx.restore();return;}
        if(this.role==='phaseWalker'||this.role==='stalker'){ctx.save();ctx.globalAlpha=this.phaseVisible ? .95 : .22;super.draw(ctx);ctx.restore();}
        else super.draw(ctx);
        ctx.save();
        if(['warden','anchor','timekeeper'].includes(this.role)){ctx.strokeStyle=this.color+'55';ctx.lineWidth=2;ctx.beginPath();ctx.arc(this.x,this.y,this.role==='anchor'?190:220,0,Math.PI*2);ctx.stroke();}
        if(this.role==='sentinel'){ctx.strokeStyle='rgba(203,213,225,.55)';ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(this.x+Math.cos(this.angle)*420,this.y+Math.sin(this.angle)*420);ctx.stroke();}
        if(['swapper','screecher'].includes(this.role)&&this.charge>0){ctx.strokeStyle=this.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(this.x,this.y,this.size+12*(1-this.charge/1200),0,Math.PI*2);ctx.stroke();}
        if(this.role==='relay')for(const z of this.linked){ctx.strokeStyle='rgba(56,189,248,.5)';ctx.beginPath();ctx.moveTo(this.x,this.y);ctx.lineTo(z.x,z.y);ctx.stroke();}
        if(this.role==='gatekeeper'&&this.portalA){for(const p of[this.portalA,this.portalB]){ctx.strokeStyle='#8b5cf6';ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y,28,0,Math.PI*2);ctx.stroke();}}
        ctx.restore();
    }
}

function advancedCtor(role){return class extends AdvancedRoleZombie{constructor(){super(role);}};}
const BurrowerZombie=advancedCtor('burrower'),WardenZombie=advancedCtor('warden'),LeechZombie=advancedCtor('leech'),BeaconZombie=advancedCtor('beacon'),SplitterZombie=advancedCtor('splitter'),SplitterMiniZombie=advancedCtor('splitterMini'),MimicZombie=advancedCtor('mimic'),AnchorZombie=advancedCtor('anchor'),SporeCarrierZombie=advancedCtor('sporeCarrier'),ShamblerZombie=advancedCtor('shambler'),ScreecherZombie=advancedCtor('screecher'),ParasiteHostZombie=advancedCtor('parasiteHost'),ParasiteZombie=advancedCtor('parasite'),WallCrawlerZombie=advancedCtor('wallCrawler'),MortarZombie=advancedCtor('mortar'),SuppressorZombie=advancedCtor('suppressor'),ReanimatorZombie=advancedCtor('reanimator'),PhaseWalkerZombie=advancedCtor('phaseWalker'),MirrorlingZombie=advancedCtor('mirrorling'),SwapperZombie=advancedCtor('swapper'),HuskZombie=advancedCtor('husk'),HarvesterZombie=advancedCtor('harvester'),SentinelZombie=advancedCtor('sentinel'),StalkerZombie=advancedCtor('stalker'),RelayZombie=advancedCtor('relay'),BlightZombie=advancedCtor('blight'),RammerZombie=advancedCtor('rammer'),DrifterZombie=advancedCtor('drifter'),CollectorZombie=advancedCtor('collector'),GatekeeperZombie=advancedCtor('gatekeeper'),TimekeeperZombie=advancedCtor('timekeeper'),UndertakerZombie=advancedCtor('undertaker');
