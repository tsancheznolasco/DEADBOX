// Catálogo de aspectos comprables con chatarra. Solo afectan al dibujo: ningún objeto cambia
// estadísticas, dificultad ni recompensas, así que equiparlos no altera el equilibrio del juego.
const COSMETICS = {
    box: [
        {id:'default',price:0,color:'#60a5fa'},
        {id:'crimson',price:60,color:'#ef4444'},
        {id:'toxic',price:90,color:'#84cc16'},
        {id:'void',price:120,color:'#a78bfa'},
        {id:'bone',price:160,color:'#e2e8f0'},
        {id:'gold',price:250,color:'#fbbf24'}
    ],
    gun: [
        {id:'default',price:0,color:'#94a3b8',length:20,width:8,barrels:1},
        {id:'snub',price:70,color:'#cbd5e1',length:14,width:11,barrels:1},
        {id:'heavy',price:100,color:'#64748b',length:22,width:13,barrels:1},
        {id:'twin',price:140,color:'#94a3b8',length:20,width:5,barrels:2},
        {id:'lance',price:180,color:'#38bdf8',length:29,width:6,barrels:1},
        {id:'gold',price:250,color:'#fbbf24',length:22,width:9,barrels:1}
    ],
    bullet: [
        {id:'default',price:0,color:'#fbbf24',shape:'circle'},
        {id:'plasma',price:60,color:'#22d3ee',shape:'circle'},
        {id:'ember',price:90,color:'#f97316',shape:'square'},
        {id:'shard',price:130,color:'#e879f9',shape:'diamond'},
        {id:'venom',price:170,color:'#a3e635',shape:'diamond'},
        {id:'gold',price:250,color:'#fde047',shape:'square'}
    ]
};
const COSMETIC_SLOTS = ['box','gun','bullet'];

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
function scrapForRun(runScore,roundsCleared){return Math.floor(Math.max(0,runScore)/100)+Math.max(0,roundsCleared)*5;}
