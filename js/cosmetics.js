// Catálogo de aspectos comprables con chatarra. Solo afectan al dibujo: ningún objeto cambia
// estadísticas, dificultad ni recompensas, así que equiparlos no altera el equilibrio del juego.
const COSMETICS = {
    // finish: solid | outline | split | stripe | core. accent es el segundo color del acabado.
    box: [
        {id:'default',price:0,color:'#60a5fa'},
        {id:'dot',price:40,color:'#f8fafc'},
        {id:'crimson',price:60,color:'#ef4444'},
        {id:'rust',price:80,color:'#c2410c'},
        {id:'toxic',price:90,color:'#84cc16'},
        {id:'ice',price:110,color:'#7dd3fc'},
        {id:'void',price:120,color:'#a78bfa'},
        {id:'hollow',price:150,color:'#22d3ee',finish:'outline'},
        {id:'bone',price:160,color:'#e2e8f0'},
        {id:'split',price:190,color:'#f472b6',accent:'#6d28d9',finish:'split'},
        {id:'hazard',price:210,color:'#facc15',accent:'#18181b',finish:'stripe'},
        {id:'reactor',price:230,color:'#ef4444',accent:'#111827',finish:'core'},
        {id:'gold',price:250,color:'#fbbf24'}
    ],
    gun: [
        {id:'default',price:0,color:'#94a3b8',length:20,width:8,barrels:1},
        {id:'stub',price:50,color:'#a8a29e',length:13,width:9,barrels:1},
        {id:'snub',price:70,color:'#cbd5e1',length:14,width:11,barrels:1},
        {id:'heavy',price:100,color:'#64748b',length:22,width:13,barrels:1},
        {id:'rail',price:130,color:'#c4b5fd',length:26,width:5,barrels:1},
        {id:'twin',price:140,color:'#94a3b8',length:20,width:5,barrels:2},
        {id:'bulk',price:160,color:'#57534e',length:18,width:16,barrels:1},
        {id:'lance',price:180,color:'#38bdf8',length:29,width:6,barrels:1},
        {id:'spike',price:200,color:'#f87171',length:32,width:4,barrels:1},
        {id:'trident',price:220,color:'#34d399',length:22,width:4,barrels:3},
        {id:'slab',price:240,color:'#1f2937',length:16,width:18,barrels:1},
        {id:'gold',price:250,color:'#fbbf24',length:22,width:9,barrels:1}
    ],
    // shape: circle | square | diamond | triangle | ring | star
    bullet: [
        {id:'default',price:0,color:'#fbbf24',shape:'circle'},
        {id:'pellet',price:40,color:'#f8fafc',shape:'circle'},
        {id:'plasma',price:60,color:'#22d3ee',shape:'circle'},
        {id:'ember',price:90,color:'#f97316',shape:'square'},
        {id:'bolt',price:110,color:'#60a5fa',shape:'triangle'},
        {id:'shard',price:130,color:'#e879f9',shape:'diamond'},
        {id:'halo',price:150,color:'#f472b6',shape:'ring'},
        {id:'venom',price:170,color:'#a3e635',shape:'diamond'},
        {id:'spark',price:190,color:'#fcd34d',shape:'triangle'},
        {id:'eclipse',price:210,color:'#a78bfa',shape:'ring'},
        {id:'gold',price:250,color:'#fde047',shape:'square'},
        {id:'nova',price:280,color:'#fb7185',shape:'star'}
    ]
};
const COSMETIC_SLOTS = ['box','gun','bullet'];
const BULLET_SHAPES = ['circle','square','diamond','triangle','ring','star'];
const BOX_FINISHES = ['solid','outline','split','stripe','core'];

// El juego y la vista previa del taller dibujan con estas funciones, así que lo que se ve antes
// de comprar es exactamente lo que se lleva a la arena.
function traceBulletShape(ctx,shape,x,y,r){
    switch(shape){
        case 'square': ctx.rect(x-r,y-r,r*2,r*2); break;
        case 'diamond': ctx.moveTo(x,y-r*1.3);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r*1.3);ctx.lineTo(x-r,y);ctx.closePath(); break;
        case 'triangle': ctx.moveTo(x,y-r*1.35);ctx.lineTo(x+r*1.2,y+r*.95);ctx.lineTo(x-r*1.2,y+r*.95);ctx.closePath(); break;
        // El agujero se traza en sentido contrario para que quede hueco.
        case 'ring': ctx.arc(x,y,r,0,Math.PI*2);ctx.moveTo(x+r*.46,y);ctx.arc(x,y,r*.46,0,Math.PI*2,true); break;
        case 'star':
            for(let i=0;i<10;i++){
                const angle=-Math.PI/2+i*Math.PI/5,radius=i%2?r*.5:r*1.25;
                const px=x+Math.cos(angle)*radius,py=y+Math.sin(angle)*radius;
                if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
            }
            ctx.closePath();
            break;
        default: ctx.arc(x,y,r,0,Math.PI*2);
    }
}

// Dibuja la caja centrada en el origen. Deja shadowBlur a 0 al salir.
function drawBoxSkin(ctx,skin,size){
    const half=size/2,color=skin?.color||'#60a5fa',accent=skin?.accent||'#111827',finish=skin?.finish||'solid';
    ctx.shadowBlur=10;ctx.shadowColor=color;
    if(finish==='outline'){
        ctx.fillStyle='#0b1220';ctx.fillRect(-half,-half,size,size);
        ctx.shadowBlur=0;
        const border=Math.max(3,size*.15);
        ctx.strokeStyle=color;ctx.lineWidth=border;
        ctx.strokeRect(-half+border/2,-half+border/2,size-border,size-border);
        return;
    }
    if(finish==='core'){
        ctx.fillStyle=accent;ctx.fillRect(-half,-half,size,size);
        ctx.shadowBlur=0;
        ctx.fillStyle=color;ctx.fillRect(-size*.26,-size*.26,size*.52,size*.52);
        return;
    }
    ctx.fillStyle=color;ctx.fillRect(-half,-half,size,size);
    ctx.shadowBlur=0;
    if(finish==='split'){ctx.fillStyle=accent;ctx.fillRect(0,-half,half,size);}
    else if(finish==='stripe'){ctx.fillStyle=accent;ctx.fillRect(-half,-size*.17,size,size*.34);}
}

// En los acabados de dos tonos la cara cruza ambos colores al girar, así que lleva un halo tenue
// para leerse sobre cualquiera de los dos.
function boxFaceHalo(skin){const finish=skin?.finish||'solid';return finish==='split'||finish==='stripe';}
// Sobre acabados oscuros la cara negra desaparecía, así que se aclara según el fondo que le toca.
function boxFaceColor(skin){
    const finish=skin?.finish||'solid';
    return finish==='outline'||finish==='core'?(skin?.color||'#60a5fa'):'#0f172a';
}

// Cañones repartidos simétricamente, para que valga igual con uno, dos o tres.
function drawGunBarrels(ctx,skin,startX,recoil){
    const length=skin?.length||20,width=skin?.width||8,barrels=skin?.barrels||1;
    ctx.fillStyle=skin?.color||'#94a3b8';
    const gap=width+2,first=-(barrels-1)/2*gap;
    for(let i=0;i<barrels;i++)ctx.fillRect(startX-recoil,first+i*gap-width/2,length,width);
}

function cosmeticItem(slot,id){const list=COSMETICS[slot]||[];return list.find(item=>item.id===id)||list[0];}
function cosmeticOwned(slot,id){return !!gameMeta?.owned?.[slot]?.includes(id);}
function equippedCosmetic(slot){return cosmeticItem(slot,gameMeta?.equipped?.[slot]);}

// Sanea lo guardado: los aspectos gratuitos siempre se poseen y nunca queda equipado algo no comprado.
function normalizeCosmetics(meta){
    meta.scrap=Math.max(0,Math.floor(Number(meta.scrap)||0));
    const owned={},equipped={};
    for(const slot of COSMETIC_SLOTS){
        const list=COSMETICS[slot],saved=Array.isArray(meta.owned?.[slot])?meta.owned[slot]:[];
        owned[slot]=list.filter(item=>item.price===0||saved.includes(item.id)).map(item=>item.id);
        const wanted=meta.equipped?.[slot];
        equipped[slot]=owned[slot].includes(wanted)?wanted:list[0].id;
    }
    meta.owned=owned;meta.equipped=equipped;
    return meta;
}

function buyCosmetic(slot,id){
    const item=(COSMETICS[slot]||[]).find(entry=>entry.id===id);
    if(!item||cosmeticOwned(slot,id)||gameMeta.scrap<item.price)return false;
    gameMeta.scrap-=item.price;gameMeta.owned[slot].push(id);saveMeta();return true;
}
function equipCosmetic(slot,id){
    if(!cosmeticOwned(slot,id))return false;
    gameMeta.equipped[slot]=id;saveMeta();return true;
}
function awardScrap(amount){
    const gain=Math.max(0,Math.floor(Number(amount)||0));
    if(gain>0){gameMeta.scrap+=gain;saveMeta();}
    return gain;
}
// Recompensa de una partida: puntuación más una prima por cada ronda superada.
// Ritmo deliberadamente lento: un aspecto debe costar varias partidas, no una.
function scrapForRun(runScore,roundsCleared){return Math.floor(Math.max(0,runScore)/220)+Math.max(0,roundsCleared)*3;}
