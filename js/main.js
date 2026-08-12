const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ENTITY_LIMITS = Object.freeze({ zombies: 120, minis: 30, playerProjectiles: 220, enemyProjectiles: 76, particles: 620, rings: 26, foods: 3, superPickups:1, dashTrails:18, obstacles: 13, poison: 5 });
const SAVE_KEY = 'deadboxSaveDataV3';
const BACKUP_KEY = 'deadboxSaveDataV3Backup';
const RECORD_KEY = 'deadboxRecordsV3';
const OPTIONS_KEY = 'deadboxOptionsV1';
const BESTIARY_KEY = 'deadboxBestiaryV1';
for(const[next,legacy]of[[SAVE_KEY,'arenaSaveDataV2'],[BACKUP_KEY,'arenaSaveDataV2Backup'],[RECORD_KEY,'arenaRecordsV2'],[OPTIONS_KEY,'arenaOptionsV1'],[BESTIARY_KEY,'arenaBestiaryV1']])if(!localStorage.getItem(next)&&localStorage.getItem(legacy))localStorage.setItem(next,localStorage.getItem(legacy));
const ROUND_DURATIONS = [22, 27, 32, 37, 42];
// Se declaran antes que loadOptions() porque se usan durante su primera llamada.
const OPTIONS_VERSION = 2;
const VOLUME_EXPONENT = 1.7;
// Combo: multiplicador visible que sube con cada baja y cuya ventana se acorta al crecer, para que
// mantener la racha sea una decisión y no un accidente.
// Quién ha causado el último daño, para poder decir de qué murió el jugador sin adivinarlo.
let lastDamageSource = null;
let firingZombie = null;
// Quedarse quieto en una esquina disparando era la estrategia dominante: los enemigos entraban
// siempre por el mismo lado. Se mide cuánto se mueve el jugador y, si acampa, las oleadas empiezan
// a llegar por los bordes que tiene al lado.
let campSamples = [], campSampleTimer = 0, campPressure = 0;
function updateCampPressure(dt){
    campSampleTimer-=dt;
    if(campSampleTimer>0||!player)return;
    campSampleTimer=500;
    campSamples.push({x:player.x,y:player.y});
    if(campSamples.length>10)campSamples.shift();
    if(campSamples.length<6){campPressure=0;return;}
    const cx=campSamples.reduce((s,p)=>s+p.x,0)/campSamples.length,cy=campSamples.reduce((s,p)=>s+p.y,0)/campSamples.length;
    const spread=campSamples.reduce((s,p)=>s+distance(p.x,p.y,cx,cy),0)/campSamples.length;
    campPressure=clamp(1-spread/220,0,1);
}
function campEdges(){
    if(!player)return null;
    const left=player.x,right=arena.width-player.x,top=player.y,bottom=arena.height-player.y;
    const edges=[{edge:2,d:left},{edge:3,d:right},{edge:0,d:top},{edge:1,d:bottom}].sort((a,b)=>a.d-b.d);
    return [edges[0].edge,edges[1].edge];
}
function enemyLabel(z){if(!z)return null;return z.displayName||(typeof ENEMY_CATALOG!=='undefined'?ENEMY_CATALOG[z.type]?.name:null)||z.type||null;}
function damagePlayer(amount,source){if(source)lastDamageSource=source;return player.takeDamage(amount);}
// El arco hacía daño pero sólo dibujaba un anillo diminuto, así que parecía no funcionar.
// Se reutiliza la estela del dash (sin daño) para trazar el rayo entre objetivos.
function addChainArc(from,to){
    dashTrails.push({from:{x:from.x,y:from.y},to:{x:to.x,y:to.y},life:200,maxLife:200,color:'#7fd4d0',damage:0,hit:new Set()});
    if(dashTrails.length>ENTITY_LIMITS.dashTrails)dashTrails.shift();
    addRing(to.x,to.y,22,'#7fd4d0');
}
const COMBO_CAP = 25;
const COMBO_STEP = 0.08;
function comboMultiplier(){return 1+Math.min(combo,COMBO_CAP)*COMBO_STEP;}
function comboWindow(){return Math.max(1500,3000-Math.min(combo,COMBO_CAP)*60);}

let gameState = 'START';
let lastTime = performance.now();
let audioCtx = null;
let soundEnabled = true;
let lastSoundAt = 0;

const arena = {x:0,y:0,width:2000,height:1500,color:'#1e293b',wallColor:'#334155',gridColor:'rgba(255,255,255,.05)',themeId:'containment'};
function arenaSizeForRound(r){const t=clamp((r-1)/7,0,1);return{width:Math.round(lerp(1000,2000,t)),height:Math.round(lerp(700,1500,t))};}
// Cada 10 rondas la arena cambia de zona: mismo diseño, distinta identidad visual.
const ARENA_THEMES=[
    {id:'containment',floor:'#1e293b',wall:'#334155',grid:'rgba(255,255,255,.05)'},
    {id:'foundry',floor:'#2a1d16',wall:'#6b3f1d',grid:'rgba(251,191,36,.07)'},
    {id:'bloom',floor:'#132419',wall:'#2f5d38',grid:'rgba(134,239,172,.07)'},
    {id:'cryo',floor:'#142531',wall:'#2b5f7d',grid:'rgba(125,211,252,.08)'},
    {id:'void',floor:'#1c1630',wall:'#4b3a7d',grid:'rgba(196,181,253,.08)'},
    {id:'ember',floor:'#2b1315',wall:'#7f1d1d',grid:'rgba(248,113,113,.08)'},
    {id:'null',floor:'#0a0c11',wall:'#3f4756',grid:'rgba(226,232,240,.07)'}
];
function arenaThemeForRound(r){return ARENA_THEMES[clamp(Math.floor((r-1)/10),0,ARENA_THEMES.length-1)];}
let lastAnnouncedZone=null;
function applyArenaTheme(r){
    const theme=arenaThemeForRound(r);
    arena.themeId=theme.id;arena.color=theme.floor;arena.wallColor=theme.wall;arena.gridColor=theme.grid;
    document.documentElement.style.setProperty('--arena-glow',theme.floor);
    return theme.id;
}
const camera = {x:0,y:0};
const uiHUD = document.getElementById('hud');
const uiStartScreen = document.getElementById('start-screen');
const uiGameOverScreen = document.getElementById('game-over-screen');
const uiUpgradeScreen = document.getElementById('upgrade-screen');
const uiUpgradeOptions = document.getElementById('upgrade-options');
const uiPauseScreen = document.getElementById('pause-screen');
const uiRecoveryScreen = document.getElementById('recovery-screen');
const healthBar = document.getElementById('health-bar');
const healthText = document.getElementById('health-text');
const healthBarContainer = document.getElementById('health-bar-container');
const roundTimerBar = document.getElementById('round-timer-bar');
const jumpCooldownBar = document.getElementById('jump-cooldown-bar');
const dashCooldownBar = document.getElementById('dash-cooldown-bar');
const scoreText = document.getElementById('score');
const bossHUD = document.getElementById('boss-hud');
const bossBar = document.getElementById('boss-bar');
const bossName = document.getElementById('boss-name');
const uiBestiaryScreen = document.getElementById('bestiary-screen');
const uiWorkshopScreen = document.getElementById('workshop-screen');
const uiOptionsScreen = document.getElementById('options-screen');

let player;
let zombies = [], projectiles = [], enemyProjectiles = [], particles = [], earthquakeRings = [], foods = [], superPickups=[], dashTrails=[], obstacles = [], damageNumbers = [];
let score = 0, combo = 0, comboTimer = 0, kills = 0, bestCombo = 0;
let currentRound = 1, roundTimeLeft = 15, spawnTimer = 0, spawnRate = 1700, enemiesBudget = 10, enemiesQueued = 0;
let roundModifier = 'Horda', bossForRound = null, roundEnded = false, autosaveTimer = 0;
let shakeTime = 0, shakeMagnitude = 0;
let records = loadRecords();
let options = loadOptions();
let bestiaryState = loadBestiary();
let optionsReturn = 'menu';
let roundModifiers = ['Horda'], modifierHistory = [], enemyIdentityHistory = [];
let roundDuration = 22, roundPhase = 'start', roundEvents = [], eventCount = 0, lastWaveTriggered = false;
let adaptivePressure = 0, roundsWithoutDamage = 0, damageTakenThisRound = 0, roundKills = 0, roundStartedAt = 0;
let stolenPower = null, hudEffectsTimer = 0;
let currentRoundIdentity = 'Horda de supervivencia';
let garlicTick = 0;
let synergyHistory = [];
let recentDeadBasics = [];
let obstacleHistory=[];
let runInfo={startRound:1,difficulty:selectedDifficulty,advanced:false,startedAt:Date.now()};
let preparedLoadout=null,loadoutRerolls=0;

const POWER_DEFS={
    selfDestruct:{duration:0,color:'#fb7185',glyph:'SD'},ghost:{duration:7000,color:'#c4b5fd',glyph:'GH'},overdrive:{duration:8500,color:'#38bdf8',glyph:'OD'},backfire:{duration:9000,color:'#f59e0b',glyph:'BF'},orbitals:{duration:10000,color:'#a78bfa',glyph:'OR'},timeFreeze:{duration:6500,color:'#67e8f9',glyph:'TF'},bulletStorm:{duration:7000,color:'#fde047',glyph:'BS'},ricochet:{duration:9000,color:'#fb923c',glyph:'RC'},chainLightning:{duration:8000,color:'#60a5fa',glyph:'CL'},gravityWell:{duration:8000,color:'#818cf8',glyph:'GW'},giant:{duration:9000,color:'#f87171',glyph:'GI'},miniMode:{duration:9000,color:'#86efac',glyph:'MI'},piercingCore:{duration:9000,color:'#fbbf24',glyph:'PC'},clone:{duration:8500,color:'#93c5fd',glyph:'CN'}
};
class SuperPickup{
    constructor(x,y,type){this.x=x;this.y=y;this.type=type;this.life=10500;this.active=true;this.phase=0;}
    update(dt){this.life-=dt;this.phase+=dt*.004;if(this.life<=0)this.active=false;}
    draw(c){const d=POWER_DEFS[this.type];c.save();c.translate(this.x,this.y);c.rotate(this.phase*.25);c.fillStyle=d.color;c.strokeStyle='#f8fafc';c.lineWidth=2;c.shadowBlur=18;c.shadowColor=d.color;c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?13:21;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();c.stroke();c.rotate(-this.phase*.25);c.shadowBlur=0;c.fillStyle='#07111f';c.font='800 9px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillText(d.glyph,0,1);c.restore();}
}

function loadOptions(){
    const saved=loadJSON(OPTIONS_KEY)||{};
    const loaded={master:finite(saved.master,1,0,1),music:finite(saved.music,.55,0,1),effects:finite(saved.effects,.8,0,1),screenShake:saved.screenShake!==false,damageNumbers:saved.damageNumbers!==false,reducedEffects:!!saved.reducedEffects,version:OPTIONS_VERSION};
    // Los deslizadores se aplicaban en lineal y ahora pasan por una curva perceptual: la misma
    // posición sonaría mucho más baja. Se convierte la posición guardada para conservar el volumen
    // que el jugador ya había elegido, en vez de bajárselo en silencio.
    if(finite(saved.version,1,1,99)<2){
        for(const key of['master','music','effects'])if(loaded[key]>0)loaded[key]=Math.min(1,Math.pow(loaded[key],1/VOLUME_EXPONENT));
    }
    return loaded;
}
function saveOptions(){localStorage.setItem(OPTIONS_KEY,JSON.stringify(options));}
function loadBestiary(){const saved=loadJSON(BESTIARY_KEY);return saved&&saved.entries? saved : {version:1,entries:{}};}
function saveBestiary(){try{localStorage.setItem(BESTIARY_KEY,JSON.stringify(bestiaryState));}catch(e){console.warn('Bestiary save skipped',e);}}
function bestiaryRecord(id){return bestiaryState.entries[id]||(bestiaryState.entries[id]={discovered:false,killed:false,encounters:0,total:0,elite:0,bestTime:null,highestRound:0,firstEncounterRound:null,maxDifficulty:0,eliteAbilities:[]});}
function registerEncounter(id){if(!ENEMY_CATALOG[id])return;const stat=bestiaryRecord(id),first=!stat.discovered;stat.discovered=true;stat.encounters++;stat.firstEncounterRound=stat.firstEncounterRound==null?currentRound:Math.min(stat.firstEncounterRound,currentRound);if(first||['boss','miniboss'].includes(ENEMY_CATALOG[id].category))saveBestiary();}
function registerDefeat(z){const id=z.bestiaryId||z.type;if(!ENEMY_CATALOG[id])return;const stat=bestiaryRecord(id);stat.discovered=true;stat.killed=true;stat.total++;stat.maxDifficulty=Math.max(stat.maxDifficulty||0,selectedDifficulty);if(z.isElite){stat.elite++;stat.eliteAbilities=[...new Set([...(stat.eliteAbilities||[]),z.eliteAbility])];const variant=bestiaryRecord('elite');variant.discovered=true;variant.killed=true;variant.total++;variant.eliteAbilities=[...new Set([...(variant.eliteAbilities||[]),z.eliteAbility])];variant.maxDifficulty=Math.max(variant.maxDifficulty||0,selectedDifficulty);variant.highestRound=Math.max(variant.highestRound,currentRound);}stat.highestRound=Math.max(stat.highestRound,currentRound);if(z.isBoss||z.isMiniBoss){const elapsed=(performance.now()-(z.spawnedAt||roundStartedAt))/1000;stat.bestTime=stat.bestTime==null?elapsed:Math.min(stat.bestTime,elapsed);}saveBestiary();}
function isSafePlayerPosition(x,y){return x>60&&x<arena.width-60&&y>60&&y<arena.height-60&&!obstacles.some(o=>o.active&&['hole','wall','fire','poison'].includes(o.type)&&distance(x,y,o.x,o.y)<o.radius+35);}
function solidObstacle(o){return o&&o.active&&o.duration>0&&o.health>0&&['hole','wall','crate'].includes(o.type);}
function circleHitsObstacle(x,y,r,o){
    if(o.type==='wall'){const nearX=clamp(x,o.x-o.radius,o.x+o.radius),nearY=clamp(y,o.y-28,o.y+28);return (x-nearX)**2+(y-nearY)**2<(r+3)**2;}
    return (x-o.x)**2+(y-o.y)**2<(r+o.radius+3)**2;
}
function playerRadius(){return (player?.size||30)*.48*(player?.hasPower?.('giant')?1.35:(player?.hasPower?.('miniMode') ? .7 : 1));}
function playerCollidesAt(x,y,r=playerRadius()){
    if(x-r<arena.x+2||x+r>arena.width-2||y-r<arena.y+2||y+r>arena.height-2)return true;
    return obstacles.some(o=>solidObstacle(o)&&circleHitsObstacle(x,y,r,o));
}
function movePlayerByAxes(dx,dy){
    if(!player)return;const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/7)),sx=dx/steps,sy=dy/steps;
    for(let i=0;i<steps;i++){const nx=player.x+sx;if(!playerCollidesAt(nx,player.y))player.x=nx;const ny=player.y+sy;if(!playerCollidesAt(player.x,ny))player.y=ny;}
}
function dashPlayerSafely(dx,dy){
    if(!player)return{moved:0,collided:true};
    const startX=player.x,startY=player.y,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/4)),sx=dx/steps,sy=dy/steps;
    let collided=false;
    for(let i=0;i<steps;i++){
        const nx=player.x+sx,ny=player.y+sy;
        if(playerCollidesAt(nx,ny)){collided=true;break;}
        player.x=nx;player.y=ny;
    }
    return{moved:Math.hypot(player.x-startX,player.y-startY),collided};
}
function ensurePlayerSafe(force=false){
    if(!player||(!force&&!playerCollidesAt(player.x,player.y)))return true;
    const ox=player.x,oy=player.y;
    for(let radius=24;radius<=260;radius+=16)for(let i=0;i<16;i++){const a=i/16*Math.PI*2,x=clamp(ox+Math.cos(a)*radius,24,arena.width-24),y=clamp(oy+Math.sin(a)*radius,24,arena.height-24),enemyOverlap=force&&zombies.some(z=>z.active&&distance(x,y,z.x,z.y)<player.size*.48+z.size/2+4);if(!playerCollidesAt(x,y)&&!enemyOverlap){player.x=x;player.y=y;return true;}}
    player.x=arena.width/2;player.y=arena.height/2;return !playerCollidesAt(player.x,player.y);
}
function reviveRecentBasic(x,y){const data=recentDeadBasics.pop();if(!data)return false;const revived=queueDirectSpawn(data.type,x+(Math.random()-.5)*50,y+(Math.random()-.5)*50);if(revived){revived.health=revived.maxHealth*.35;revived.color='#86efac';return true;}return false;}

const particlePool = new ObjectPool(() => new Particle(), ENTITY_LIMITS.particles);
const projectilePool = new ObjectPool(() => new Projectile(), ENTITY_LIMITS.playerProjectiles);
const enemyProjectilePool = new ObjectPool(() => new Projectile(), ENTITY_LIMITS.enemyProjectiles);
const poolDefs = {
    normal:[Zombie,70], fast:[FastZombie,42], tank:[TankZombie,16], explosive:[ExplosiveZombie,24],
    jumper:[JumperZombie,18], runner:[RunnerZombie,20], shooter:[ShooterZombie,18], parent:[ParentZombie,14],
    mini:[MiniZombie,ENTITY_LIMITS.minis], shield:[ShieldZombie,18], healer:[HealerZombie,12], ghost:[GhostZombie,18],
    magnetic:[MagneticZombie,8], summoner:[SummonerZombie,8], chain:[ChainZombie,10], poison:[PoisonZombie,10], freezer:[FreezerZombie,10],
    duplicator:[DuplicatorZombie,8], duplicateMini:[DuplicateMiniZombie,16], bomb:[BombZombie,10], sniper:[SniperZombie,4], builder:[BuilderZombie,7],
    camouflage:[CamouflageZombie,5], mirror:[MirrorZombie,6], berserker:[BerserkerZombie,10], turret:[TurretZombie,6], powerThief:[PowerThiefZombie,2],
    burrower:[BurrowerZombie,8],warden:[WardenZombie,4],leech:[LeechZombie,8],beacon:[BeaconZombie,4],splitter:[SplitterZombie,6],splitterMini:[SplitterMiniZombie,12],mimic:[MimicZombie,4],anchor:[AnchorZombie,4],
    sporeCarrier:[SporeCarrierZombie,6],shambler:[ShamblerZombie,6],screecher:[ScreecherZombie,4],parasiteHost:[ParasiteHostZombie,5],parasite:[ParasiteZombie,6],wallCrawler:[WallCrawlerZombie,6],mortar:[MortarZombie,4],suppressor:[SuppressorZombie,5],
    reanimator:[ReanimatorZombie,2],phaseWalker:[PhaseWalkerZombie,6],mirrorling:[MirrorlingZombie,6],swapper:[SwapperZombie,3],husk:[HuskZombie,7],harvester:[HarvesterZombie,4],sentinel:[SentinelZombie,5],stalker:[StalkerZombie,5],relay:[RelayZombie,3],blight:[BlightZombie,4],rammer:[RammerZombie,5],drifter:[DrifterZombie,6],collector:[CollectorZombie,3],gatekeeper:[GatekeeperZombie,2],timekeeper:[TimekeeperZombie,2],undertaker:[UndertakerZombie,2],
    miniboss:[MiniBossZombie,2], boss:[BossZombie,1]
};
const enemyPools = {};
for (const [type,[Ctor,size]] of Object.entries(poolDefs)) enemyPools[type] = new ObjectPool(() => new Ctor(), size);

class FoodPickup {
    constructor(){this.active=false;}
    init(x,y,type){this.x=x;this.y=y;this.type=type;this.size=FOODS[type]?.size||16;this.life=(typeof hasModifier==='function'&&hasModifier('Tormenta de comida'))?6500:9500;this.pulse=Math.random()*6;this.active=true;return this;}
    update(dt){this.life-=dt;this.pulse+=dt*.005;if(this.life<=0)this.active=false;}
    draw(c){const d=FOODS[this.type],rare=d.rarity==='epic'?2:d.rarity==='rare'?1:0;c.save();c.translate(this.x,this.y);c.scale(1+Math.sin(this.pulse)*.08,1+Math.sin(this.pulse)*.08);c.fillStyle=d.color;c.shadowBlur=15+rare*7;c.shadowColor=d.color;c.beginPath();c.arc(0,0,d.size+rare*2,0,Math.PI*2);c.fill();if(rare){c.strokeStyle=d.rarity==='epic'?'#c4b5fd':'#fbbf24';c.lineWidth=2+rare;c.stroke();}c.shadowBlur=0;c.font=`${d.size*1.35}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(d.icon,0,1);c.restore();}
}
const foodPool = new ObjectPool(() => new FoodPickup(), ENTITY_LIMITS.foods);
const FOODS = {
    fry:{name:'Papas fritas',effect:'Velocidad de movimiento +15% durante 4 segundos.',icon:'🍟',color:'#facc15',size:14,weight:20,rarity:'common',apply:p=>p.addBuff('speed',4000,1.15,'🍟','Papas')},
    cookie:{name:'Galleta',effect:'Mejora rápida aleatoria durante 5 segundos.',icon:'🍪',color:'#d97706',size:14,weight:15,rarity:'common',apply:p=>{const list=[['damage',1.18,'Daño'],['speed',1.15,'Velocidad'],['fireRate',1.2,'Cadencia']],pick=list[Math.floor(Math.random()*list.length)];p.addBuff(pick[0],5000,pick[1],'🍪',pick[2])}},
    pretzel:{name:'Pretzel',effect:'Recarga de salto 35% más rápida durante 7 segundos.',icon:'🥨',color:'#b45309',size:15,weight:13,rarity:'common',apply:p=>p.addBuff('jumpRate',7000,1.35,'🥨','Salto')},
    sushi:{name:'Sushi',effect:'Proyectiles 30% más rápidos y precisos durante 7 segundos.',icon:'🍣',color:'#fb7185',size:15,weight:12,rarity:'common',apply:p=>p.addBuff('projectileSpeed',7000,1.3,'🍣','Proyectiles')},
    bacon:{name:'Bacon',effect:'Velocidad de disparo +30% durante 7 segundos.',icon:'🥓',color:'#fb7185',size:16,weight:11,rarity:'uncommon',apply:p=>p.addBuff('fireRate',7000,1.3,'🥓','Cadencia')},
    kebab:{name:'Kebab',effect:'Daño +25% y perforación durante 8 segundos.',icon:'🍢',color:'#f97316',size:17,weight:9,rarity:'uncommon',apply:p=>{p.addBuff('damage',8000,1.25,'🍢','Daño');p.addBuff('pierce',8000,1,'🍢','Perforación')}},
    hotdog:{name:'Hot dog',effect:'Movimiento +20% y daño recibido -12% durante 7 segundos.',icon:'🌭',color:'#f59e0b',size:17,weight:8,rarity:'uncommon',apply:p=>{p.addBuff('speed',7000,1.2,'🌭','Velocidad');p.addBuff('armor',7000,.12,'🌭','Armadura')}},
    icecream:{name:'Helado',effect:'Enemigos cercanos ralentizados durante 6 segundos.',icon:'🍦',color:'#bfdbfe',size:18,weight:7,rarity:'uncommon',apply:p=>p.addBuff('icecream',6000,.65,'🍦','Helado')},
    cheese:{name:'Queso',effect:'Aura que ralentiza enemigos cercanos durante 7 segundos.',icon:'🧀',color:'#fde047',size:17,weight:7,rarity:'uncommon',apply:p=>p.addBuff('cheese',7000,.72,'🧀','Aura lenta')},
    taco:{name:'Taco',effect:'Los disparos rebotan una vez durante 7 segundos.',icon:'🌮',color:'#fbbf24',size:17,weight:7,rarity:'uncommon',apply:p=>p.addBuff('bounce',7000,1,'🌮','Rebote')},
    drumstick:{name:'Drumstick',effect:'Recuperaste 25 de vida.',icon:'🍗',color:'#d97706',size:18,weight:6,rarity:'rare',healing:true,apply:p=>p.health=Math.min(p.maxHealth,p.health+25)},
    donut:{name:'Dona',effect:'Escudo activo: bloquea el siguiente golpe.',icon:'🍩',color:'#f9a8d4',size:18,weight:5,rarity:'rare',apply:p=>p.shieldHits=Math.min(2,p.shieldHits+1)},
    chili:{name:'Chile',effect:'Velocidad y daño +55% durante 4.5 segundos.',icon:'🌶️',color:'#ef4444',size:17,weight:4,rarity:'rare',apply:p=>{p.addBuff('chili',4500,1.55,'🌶️','Chile');p.addBuff('speed',4500,1.45,'🌶️','Velocidad')}},
    soup:{name:'Sopa',effect:'Daño recibido -25% durante 8 segundos.',icon:'🍲',color:'#fb923c',size:18,weight:5,rarity:'rare',apply:p=>p.addBuff('armor',8000,.25,'🍲','Protección')},
    popcorn:{name:'Palomitas',effect:'Disparos secundarios durante 7 segundos.',icon:'🍿',color:'#fef3c7',size:18,weight:4,rarity:'rare',apply:p=>p.addBuff('popcorn',7000,1,'🍿','Palomitas')},
    garlic:{name:'Ajo',effect:'Aura de daño cercano durante 8 segundos.',icon:'🧄',color:'#fef9c3',size:17,weight:4,rarity:'rare',apply:p=>p.addBuff('garlic',8000,1,'🧄','Aura de ajo')},
    coffee:{name:'Café',effect:'Movimiento y cadencia +25% durante 5 segundos.',icon:'☕',color:'#92400e',size:16,weight:5,rarity:'rare',apply:p=>{p.addBuff('speed',5000,1.25,'☕','Café');p.addBuff('fireRate',5000,1.25,'☕','Cadencia')}},
    nachos:{name:'Nachos',effect:'Proyectiles 35% más grandes durante 7 segundos.',icon:'🧀',color:'#f59e0b',size:18,weight:4,rarity:'rare',apply:p=>p.addBuff('projectileSize',7000,1.35,'🧀','Proyectil grande')},
    energy:{name:'Bebida energética',effect:'Salto disponible y recarga mejorada durante 7 segundos.',icon:'🥤',color:'#22d3ee',size:18,weight:4,rarity:'rare',apply:p=>{p.lastJumpTime-=p.jumpCooldown;p.addBuff('jumpRate',7000,1.6,'🥤','Energía')}},
    burger:{name:'Hamburguesa',effect:'Recupera 55 de vida y reduce daño durante 7 segundos.',icon:'🍔',color:'#fbbf24',size:22,weight:2,rarity:'epic',healing:true,apply:p=>{p.health=Math.min(p.maxHealth,p.health+55);p.addBuff('armor',7000,.25,'🍔','Armadura')}},
    pizza:{name:'Pizza',effect:'Regenera vida gradualmente durante 8 segundos.',icon:'🍕',color:'#f59e0b',size:20,weight:2,rarity:'epic',healing:true,apply:p=>{p.regen={time:8000,duration:8000,tick:400,amount:3,icon:'🍕',label:'Regeneración'}}},
    cake:{name:'Pastel',effect:'Recupera 80 de vida. Recompensa épica.',icon:'🍰',color:'#c084fc',size:23,weight:1,rarity:'epic',healing:true,apply:p=>p.health=Math.min(p.maxHealth,p.health+80)},
    grapes:{name:'Uvas',effect:'Tres orbes protectores orbitan al jugador.',icon:'🍇',color:'#a855f7',size:20,weight:2,rarity:'epic',apply:p=>p.orbs=Math.min(3,p.orbs+3)},
    watermelon:{name:'Sandía',effect:'Regenera vida lentamente durante 10 segundos.',icon:'🍉',color:'#22c55e',size:20,weight:3,rarity:'epic',healing:true,apply:p=>{p.regen={time:10000,duration:10000,tick:700,amount:3,icon:'🍉',label:'Sandía'}}}
};
const FOOD_GLYPHS={fry:'FR',cookie:'CK',pretzel:'PZ',sushi:'SU',bacon:'BC',kebab:'KB',hotdog:'HD',icecream:'IC',cheese:'CH',taco:'TC',drumstick:'DR',donut:'DN',chili:'CP',soup:'SP',popcorn:'PC',garlic:'GR',coffee:'CF',nachos:'NC',energy:'EN',burger:'BG',pizza:'PZ',cake:'CA',grapes:'GP',watermelon:'WM'};
for(const[type,data]of Object.entries(FOODS))data.icon=FOOD_GLYPHS[type]||'FD';

function weightedFood(source='normal'){
    const allowed=Object.entries(FOODS).filter(([,f])=>(source==='boss'||source==='elite'||f.rarity!=='epic')&&(!hasModifier('Sin curación')||!f.healing));
    const healthRatio=player?player.health/player.maxHealth:1;
    const list=allowed.map(([k,v])=>[k,{...v,adjusted:v.weight*(v.healing ? (healthRatio>.75 ? .25 : healthRatio<.3 ? 1.45 : 1) : 1)*(source==='boss'&&v.rarity==='epic' ? 5 : source==='elite'&&['rare','epic'].includes(v.rarity) ? 2 : 1)}]);
    const total=list.reduce((s,[,v])=>s+v.adjusted,0);let r=Math.random()*total;for(const[k,v]of list){r-=v.adjusted;if(r<=0)return k;}return'fry';
}
function spawnFood(x,y,type=null,source='normal'){
    if(foods.length>=ENTITY_LIMITS.foods)return;
    type=type||weightedFood(source);
    const f=foodPool.get();if(!f)return;foods.push(f.init(clamp(x,45,arena.width-45),clamp(y,45,arena.height-45),type));
}

function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
window.addEventListener('resize',resize);resize();Input.init();

function ensureAudio(){try{if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();audioCtx.resume?.();}catch(e){console.warn('Audio skipped',e);}return audioCtx;}
// Los efectos suenan por encima del bajo de la música: si comparten banda grave, quedan enmascarados.
const SFX={shoot:{from:760,to:300,dur:.07,wave:'square',level:.13,gap:45},hit:{from:340,to:120,dur:.12,wave:'sawtooth',level:.19,gap:30},earthquake:{from:190,to:55,dur:.24,wave:'triangle',level:.24,gap:80},combo:{from:520,to:390,dur:.06,wave:'square',level:.11,gap:28}};
const lastSoundByType={};
function playSound(type,pitch=1){
    const spec=SFX[type]||SFX.hit;
    if(!soundEnabled||options.master<=0||options.effects<=0||!audioCtx||(typeof hasModifier==='function'&&hasModifier('Silencio')&&type==='shoot'))return;
    const now=performance.now();if(now-(lastSoundByType[type]||0)<spec.gap)return;lastSoundByType[type]=lastSoundAt=now;
    try{
        const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),at=audioCtx.currentTime;
        const bend=clamp(Number(pitch)||1,.5,3);
        osc.type=spec.wave;osc.frequency.setValueAtTime(spec.from*bend,at);osc.frequency.exponentialRampToValueAtTime(spec.to*bend,at+spec.dur);
        gain.gain.setValueAtTime(spec.level*effectsVolume(),at);gain.gain.exponentialRampToValueAtTime(.0005,at+spec.dur+.03);
        osc.connect(gain);gain.connect(audioCtx.destination);osc.start(at);osc.stop(at+spec.dur+.05);
    }catch(e){console.warn('Audio skipped',e);}
}

// Música procedural: una pieza escrita (progresión Am–F–C–G, melodía, bajo, pad y batería).
// Cada zona transpone y retimbra el mismo tema, así el juego mantiene una identidad reconocible.
const MUSIC_BPM=104;                                      // oscuro pero con paso vivo
const MUSIC_ROOT=110;                                     // A2
// i – VI – iv – V en La menor. El V mayor (con SOL#) da el color de menor armónica: tenso y misterioso.
const MUSIC_PROGRESSION=[{root:0,triad:[0,3,7]},{root:-4,triad:[0,4,7]},{root:5,triad:[0,3,7]},{root:7,triad:[0,4,7]}];
const MUSIC_MELODY=[                                      // semitonos sobre la tónica; null = silencio
    12,null,15,null, 19,null,17,null,
    20,null,17,null, 15,null,12,null,
    17,null,20,null, 17,null,15,null,
    14,null,11,null, 12,null,null,null,
    19,null,17,15, 12,null,15,null,
    20,null,19,17, 15,null,17,null,
    17,null,15,14, 12,null,14,null,
    11,null,12,14, 11,null,null,null
];
const MUSIC_ZONES={
    containment:{transpose:0,wave:'triangle',tempo:1,cutoff:1500},
    foundry:{transpose:-2,wave:'sawtooth',tempo:1.03,cutoff:1300},
    bloom:{transpose:3,wave:'triangle',tempo:1.02,cutoff:1700},
    cryo:{transpose:5,wave:'sine',tempo:1.05,cutoff:1950},
    void:{transpose:-4,wave:'triangle',tempo:1.08,cutoff:1400},
    ember:{transpose:-5,wave:'sawtooth',tempo:1.12,cutoff:1250},
    null:{transpose:-7,wave:'triangle',tempo:1.15,cutoff:1100}
};
let musicTimer=null,musicNextTime=0,musicStep=0,musicGain=null,musicDelay=null,musicNoise=null,musicDuck=1;
// El oído percibe el volumen de forma logarítmica: con una curva lineal el control no hace casi nada
// hasta el último tramo. Elevar el valor hace que el recorrido del deslizador se sienta parejo.
function volumeCurve(v){const value=clamp(Number(v)||0,0,1);return value<=0?0:Math.pow(value,VOLUME_EXPONENT);}
function musicVolume(){return soundEnabled?volumeCurve(options.master)*volumeCurve(options.music)*musicDuck:0;}
function effectsVolume(){return volumeCurve(options.master)*volumeCurve(options.effects);}
function musicStepSeconds(zone){return 60/MUSIC_BPM/2/zone.tempo;}
function musicNoiseBuffer(){
    if(musicNoise)return musicNoise;
    const length=Math.floor(audioCtx.sampleRate*.3),buffer=audioCtx.createBuffer(1,length,audioCtx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
    musicNoise=buffer;return buffer;
}
function startMusic(){
    if(!audioCtx||musicTimer)return;
    try{
        audioCtx.resume?.();
        musicGain=audioCtx.createGain();musicGain.gain.value=musicVolume()*.42;musicGain.connect(audioCtx.destination);
        musicDelay=audioCtx.createDelay();musicDelay.delayTime.value=.28;
        const feedback=audioCtx.createGain();feedback.gain.value=.26;
        musicDelay.connect(feedback);feedback.connect(musicDelay);musicDelay.connect(musicGain);
        musicNextTime=audioCtx.currentTime+.15;musicStep=0;musicTimer=setInterval(scheduleMusic,70);
    }catch(e){console.warn('Music skipped',e);musicGain=null;musicDelay=null;}
}
function stopMusic(){
    if(musicTimer){clearInterval(musicTimer);musicTimer=null;}
    const fading=musicGain,fadingDelay=musicDelay;musicGain=null;musicDelay=null;
    if(fading){try{fading.gain.setTargetAtTime(0,audioCtx.currentTime,.12);}catch{}setTimeout(()=>{try{fading.disconnect();fadingDelay?.disconnect();}catch{}},700);}
}
function scheduleMusic(){
    if(!audioCtx||!musicGain)return;
    const zone=MUSIC_ZONES[arena.themeId]||MUSIC_ZONES.containment,stepSeconds=musicStepSeconds(zone);
    // El eco debe caer sobre la rejilla del tempo; si no, suena como notas sueltas fuera de ritmo.
    try{musicGain.gain.value=musicVolume()*.42;if(musicDelay)musicDelay.delayTime.value=stepSeconds*2;}catch{return;}
    let guard=0;
    while(musicNextTime<audioCtx.currentTime+.35&&guard++<24){playMusicStep(zone,musicStep,musicNextTime,stepSeconds);musicNextTime+=stepSeconds;musicStep++;}
    if(musicNextTime<audioCtx.currentTime)musicNextTime=audioCtx.currentTime+.05;
}
function musicTone(freq,at,duration,{wave='square',level=.2,cutoff=2200,send=0}={}){
    if(!musicGain)return;
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();
    osc.type=wave;osc.frequency.setValueAtTime(freq,at);
    filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,at);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(level,at+.015);gain.gain.exponentialRampToValueAtTime(level*.6,at+duration*.7);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(filter);filter.connect(gain);gain.connect(musicGain);
    if(send>0&&musicDelay){const sendGain=audioCtx.createGain();sendGain.gain.value=send;gain.connect(sendGain);sendGain.connect(musicDelay);}
    osc.start(at);osc.stop(at+duration+.03);
}
function musicDrum(kind,at){
    if(!musicGain)return;
    if(kind==='kick'){
        const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
        osc.type='sine';osc.frequency.setValueAtTime(120,at);osc.frequency.exponentialRampToValueAtTime(38,at+.13);
        gain.gain.setValueAtTime(1,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.26);
        osc.connect(gain);gain.connect(musicGain);osc.start(at);osc.stop(at+.28);return;
    }
    // Pulso grave y apagado en lugar de charles: sin brillo agudo que compita con la melodía.
    const source=audioCtx.createBufferSource(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();
    source.buffer=musicNoiseBuffer();
    filter.type='bandpass';filter.frequency.setValueAtTime(650,at);
    gain.gain.setValueAtTime(.14,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.16);
    source.connect(filter);filter.connect(gain);gain.connect(musicGain);
    source.start(at);source.stop(at+.18);
}
function playMusicStep(zone,step,at,stepSeconds){
    if(!musicGain)return;
    try{
        const pos=step%MUSIC_MELODY.length,bar=Math.floor(pos/8)%MUSIC_PROGRESSION.length,beat=pos%8,chord=MUSIC_PROGRESSION[bar];
        const pitch=n=>MUSIC_ROOT*Math.pow(2,(zone.transpose+n)/12);
        if(beat===0||beat===4)musicDrum('kick',at);
        if(beat===6)musicDrum('pulse',at);
        // Bajo sostenido en media nota, con subgrave una octava por debajo para dar peso.
        if(beat===0||beat===4){
            const bassRoot=pitch(chord.root)/2;
            musicTone(bassRoot,at,stepSeconds*3.6,{wave:'sawtooth',level:.24,cutoff:320});
            musicTone(bassRoot/2,at,stepSeconds*3.6,{wave:'sine',level:.14,cutoff:180});
        }
        if(beat===0)for(const interval of chord.triad)musicTone(pitch(chord.root+interval),at,stepSeconds*7.4,{wave:'triangle',level:.06,cutoff:720});
        const note=MUSIC_MELODY[pos];
        if(note!=null)musicTone(pitch(note),at,stepSeconds*(MUSIC_MELODY[(pos+1)%MUSIC_MELODY.length]==null?2.4:1.15),{wave:zone.wave,level:.26,cutoff:zone.cutoff,send:.2});
    }catch(e){}
}

function spawnParticle(x,y,color,speed=2,size=3,life=1){
    if(options.reducedEffects&&Math.random()<.55)return;if(particles.length>=ENTITY_LIMITS.particles)return;const p=particlePool.get();if(p)particles.push(p.init(x,y,color,speed,size,life));
}
function spawnProjectile(x,y,angle,speed,damage,size,color,pierce=0){
    if(projectiles.length>=ENTITY_LIMITS.playerProjectiles)return null;const p=projectilePool.get();if(p){p.init(x,y,angle,speed,damage,size,color,'player',Math.max(pierce,player?.hasPower?.('piercingCore')?3:0));p.bounces=Math.max(player?.perks?.ricochet||0,(player?.buffs?.bounce||player?.hasPower?.('ricochet'))?1:0);p.secondary=!!player?.buffs?.popcorn;p.chain=Math.max(player?.perks?.arc||0,player?.hasPower?.('chainLightning')?1:0);projectiles.push(p);return p;}return null;
}
function spawnEnemyProjectile(x,y,angle,speed,damage,size,color,effect=null){
    const limit=Math.min(ENTITY_LIMITS.enemyProjectiles,getEncounterLimits(currentRound).enemyProjectiles);if(enemyProjectiles.length>=limit)return null;const p=enemyProjectilePool.get();if(p){p.init(x,y,angle,speed*difficultyProfile.projectileSpeed,damage,size,color,'enemy',0);p.effect=effect;p.ownerLabel=enemyLabel(firingZombie);enemyProjectiles.push(p);return p;}return null;
}
function getActiveEnemyCount(){return zombies.length+Spawner.warnings.length;}
const ELITE_ABILITIES=['speed','shield','explosion','regen','projectile','quakeResist','hazard','mini'];
function eliteChance(){const unlock=selectedDifficulty>=225?9:15;if(currentRound<unlock)return 0;const base=currentRound<=20 ? .065 : currentRound<=30 ? .105 : Math.min(.18,.12+(currentRound-30)*.003);return Math.min(.28,(base+adaptivePressure*.025)*difficultyProfile.eliteFactor);}
function shouldSpawnElite(){return Math.random()<eliteChance();}
function queueDirectSpawn(type,x,y,forceElite=false,fromWarning=false){
    if(getActiveEnemyCount()>=ENTITY_LIMITS.zombies)return null;
    if(!fromWarning&&type!=='boss'&&type!=='miniboss'&&!Spawner.canSpawn(type))return null;
    if(type==='mini'&&zombies.filter(z=>z.active&&z.isMini).length>=ENTITY_LIMITS.minis)return null;
    const pool=enemyPools[type]||enemyPools.normal,z=pool.get();if(!z)return null;
    z.init(clamp(x,30,arena.width-30),clamp(y,30,arena.height-30),currentRound);
    z.maxHealth*=difficultyProfile.health;z.health=z.maxHealth;z.damage*=difficultyProfile.damage;
    if(hasModifier('Doble velocidad')){z.speed*=1.4;z.maxHealth*=.82;z.health=z.maxHealth;}
    if(hasModifier('Modo gigante')&&!z.isBoss){z.size*=1.35;z.maxHealth*=1.55;z.health=z.maxHealth;z.damage*=1.18;z.speed*=.85;}
    if(hasModifier('Modo miniatura')&&!z.isBoss){z.size*=.72;z.maxHealth*=.58;z.health=z.maxHealth;z.damage*=.68;z.speed*=1.16;}
    z.speed*=1+adaptivePressure*.055;
    if(forceElite&&!z.isBoss&&!z.isMiniBoss&&!z.isMini)z.makeElite(ELITE_ABILITIES[Math.floor(Math.random()*ELITE_ABILITIES.length)]);z.spawnedAt=performance.now();zombies.push(z);registerEncounter(z.bestiaryId||z.type);if(z.isElite)registerEncounter('elite');if(z.isBoss||z.isMiniBoss)showRoundBanner(z.displayName||t('boss.miniboss'));
    for(let i=0;i<Math.min(6,ENTITY_LIMITS.particles-particles.length);i++)spawnParticle(z.x,z.y,z.color,4,3);
    if(z.isBoss||z.isMiniBoss)bossForRound=z;
    return z;
}

function resetPools(){particlePool.reset();projectilePool.reset();enemyProjectilePool.reset();foodPool.reset();for(const p of Object.values(enemyPools))p.reset();Spawner.reset();}
function resetEntities(){zombies=[];projectiles=[];enemyProjectiles=[];particles=[];earthquakeRings=[];foods=[];superPickups=[];dashTrails=[];obstacles=[];damageNumbers=[];recentDeadBasics=[];bossForRound=null;resetPools();}

function spawnSuperPower(x,y,type=null){
    if(superPickups.some(p=>p.active)||superPickups.length>=ENTITY_LIMITS.superPickups)return false;
    const keys=Object.keys(POWER_DEFS).filter(k=>k==='selfDestruct'||!player?.hasPower?.(k));type=type||keys[Math.floor(Math.random()*keys.length)];
    if(!type)return false;let px=clamp(x,60,arena.width-60),py=clamp(y,60,arena.height-60);if(player&&distance(px,py,player.x,player.y)<100){px=clamp(px+130,60,arena.width-60);}
    superPickups.push(new SuperPickup(px,py,type));return true;
}
function powerCopy(type){const value=t(`powers.${type}`);return Array.isArray(value)?value:[type,''];}
function showPowerPickup(type){const copy=powerCopy(type),el=document.getElementById('pickup-toast');el.textContent=`${POWER_DEFS[type].glyph}  ${copy[0]} · ${copy[1]}`;el.classList.remove('hidden');if(pickupToastTimer)clearTimeout(pickupToastTimer);pickupToastTimer=setTimeout(()=>el.classList.add('hidden'),2400);}
function damageArea(x,y,radius,damage,bossFactor=.16){for(const z of [...zombies]){if(!z.active||distance(x,y,z.x,z.y)>radius+z.size/2)continue;const amount=z.isBoss?Math.min(damage,z.maxHealth*bossFactor):z.isMiniBoss?Math.min(damage,z.maxHealth*.3):damage,died=z.takeDamage(amount);if(died)handleEnemyDeath(z);}}
window.addEventListener('power_activate',e=>{if(gameState!=='PLAYING'||e.detail.type!=='selfDestruct')return;addRing(player.x,player.y,310,'#fb7185');damageArea(player.x,player.y,310,(player.baseDamage+player.bonusDamage)*16,.12);enemyProjectiles.forEach(p=>{if(distance(p.x,p.y,player.x,player.y)<330)p.active=false;});player.invulnerable=true;player.invulnerableTimer=Math.max(player.invulnerableTimer,700);shakeTime=260;shakeMagnitude=14;});
window.addEventListener('dash_used',e=>{const d=e.detail,color=d.overdrive?'#38bdf8':d.burn?'#f97316':'#60a5fa',damaging=d.burn||d.overdrive;dashTrails.push({from:d.from,to:d.to,life:damaging?1200:260,maxLife:damaging?1200:260,color,damage:damaging?(player.baseDamage+player.bonusDamage)*(d.burn ? .42 : .24):0,hit:new Set()});if(d.shock){addRing(d.to.x,d.to.y,105,'#67e8f9');const vx=d.to.x-d.from.x,vy=d.to.y-d.from.y,l2=vx*vx+vy*vy||1;for(const z of zombies){if(!z.active)continue;const q=clamp(((z.x-d.from.x)*vx+(z.y-d.from.y)*vy)/l2,0,1),cx=d.from.x+vx*q,cy=d.from.y+vy*q;if(distance(z.x,z.y,cx,cy)>z.size/2+34)continue;const a=Math.atan2(z.y-cy,z.x-cx);z.applyStun(600,Math.cos(a)*18,Math.sin(a)*18);}}if(dashTrails.length>ENTITY_LIMITS.dashTrails)dashTrails.shift();});

const MODIFIER_DEFS = {
    'Horda':{unlock:1,desc:'Muchos enemigos básicos; pocos especiales.',kind:'quantity'},
    'Velocidad':{unlock:3,desc:'Más rápidos y corredores, con menor resistencia.',kind:'speed'},
    'Artillería':{unlock:7,desc:'Tiradores protegidos y menos enemigos totales.',kind:'ranged'},
    'Nido':{unlock:9,desc:'Progenitores e invocadores aumentan la presión.',kind:'summon'},
    'Terremoto':{unlock:6,desc:'Saltadores y zonas de impacto señalizadas.',kind:'hazard'},
    'Oscuridad':{unlock:8,desc:'Visibilidad reducida; amenazas señalizadas.',kind:'vision'},
    'Arena pequeña':{unlock:11,desc:'Barreras temporales reducen el espacio seguro.',kind:'obstacle'},
    'Comida abundante':{unlock:12,desc:'Más recompensas, pero enemigos más intensos.',kind:'reward'},
    'Niebla':{unlock:13,desc:'La distancia se oculta, las advertencias permanecen.',kind:'vision'},
    'Doble velocidad':{unlock:15,desc:'Enemigos más rápidos, pero algo menos resistentes.',kind:'speed'},
    'Enjambre':{unlock:14,desc:'Muchos enemigos pequeños y frágiles.',kind:'quantity'},
    'Cazadores':{unlock:16,desc:'Corredores, saltadores y rápidos coordinados.',kind:'speed'},
    'Zona de guerra':{unlock:18,desc:'Francotiradores, torretas y fuego cruzado limitado.',kind:'ranged'},
    'Suelo inestable':{unlock:17,desc:'El piso se agrieta y cambia durante la ronda.',kind:'hazard'},
    'Arena cerrándose':{unlock:20,desc:'Paredes móviles reducen el espacio temporalmente.',kind:'obstacle'},
    'Sin curación':{unlock:18,desc:'Sin comida curativa; mayor puntuación y ofensiva.',kind:'restriction'},
    'Regeneración enemiga':{unlock:20,desc:'Prioriza objetivos: recuperan vida si no reciben daño.',kind:'resistance'},
    'Explosiones':{unlock:19,desc:'Bombas y explosivos dañan también a sus aliados.',kind:'hazard'},
    'Caza del objetivo':{unlock:21,desc:'Elimina al objetivo marcado para reducir la presión.',kind:'objective'},
    'Dos frentes':{unlock:16,desc:'Las oleadas llegan desde paredes opuestas.',kind:'formation'},
    'Laberinto temporal':{unlock:22,desc:'Barreras destructibles cambian las rutas.',kind:'obstacle'},
    'Tormenta de comida':{unlock:23,desc:'Recompensas fugaces con enemigos más agresivos.',kind:'reward'},
    'Silencio':{unlock:20,desc:'Menos sonido, con todas las advertencias visuales.',kind:'restriction'},
    'Modo gigante':{unlock:19,desc:'Menos enemigos, más grandes y peligrosos.',kind:'resistance'},
    'Modo miniatura':{unlock:19,desc:'Muchos enemigos pequeños con poca vida.',kind:'quantity'},
    'Sin salto':{unlock:24,desc:'Salto desactivado; ataques adaptados al movimiento.',kind:'restriction'},
    'Terremotos':{unlock:22,desc:'Impactos periódicos señalizados afectan a todos.',kind:'hazard'},
    'Robo de poder':{unlock:26,desc:'Un objetivo marcado retiene temporalmente una mejora.',kind:'objective'}
};
function hasModifier(name){return roundModifiers.includes(name);}
function compatibleModifiers(a,b){const blocked=[['Oscuridad','Zona de guerra'],['Oscuridad','Niebla'],['Sin salto','Terremotos'],['Arena cerrándose','Suelo inestable'],['Enjambre','Nido'],['Modo gigante','Modo miniatura']];return !blocked.some(pair=>pair.includes(a)&&pair.includes(b));}
function chooseModifiers(round){
    if(round<=2)return['Horda'];
    const recent=new Set(modifierHistory.slice(-3).flat()),available=Object.keys(MODIFIER_DEFS).filter(k=>MODIFIER_DEFS[k].unlock<=round&&!recent.has(k));
    const fallback=Object.keys(MODIFIER_DEFS).filter(k=>MODIFIER_DEFS[k].unlock<=round&&k!==modifierHistory.at(-1)?.[0]);
    const first=(available.length?available:fallback)[Math.floor(Math.random()*(available.length?available.length:fallback.length))]||'Horda';
    const result=[first],doubleChance=round<21 ? 0 : (round<31 ? .16 : .27)*(difficultyProfile.bossTier>=4?1.65:difficultyProfile.bossTier>=3?1.25:difficultyProfile.bossTier===1 ? .35 : 1);
    if(Math.random()<doubleChance){const secondPool=Object.keys(MODIFIER_DEFS).filter(k=>MODIFIER_DEFS[k].unlock<=round&&!recent.has(k)&&k!==first&&compatibleModifiers(first,k));if(secondPool.length)result.push(secondPool[Math.floor(Math.random()*secondPool.length)]);}
    modifierHistory.push(result);if(modifierHistory.length>8)modifierHistory.shift();return result;
}
function getCyclicDuration(r){return ROUND_DURATIONS[(r-1)%5];}
function configureRound(r){
    currentRound=r;const arenaSize=arenaSizeForRound(r);arena.width=arenaSize.width;arena.height=arenaSize.height;const zoneId=applyArenaTheme(r),zoneChanged=lastAnnouncedZone!==zoneId;lastAnnouncedZone=zoneId;roundDuration=getCyclicDuration(r);roundTimeLeft=roundDuration;roundModifiers=chooseModifiers(r);roundModifier=roundModifiers.map(roundName).join(' / ');roundEnded=false;enemiesQueued=0;
    roundPhase='start';eventCount=0;lastWaveTriggered=false;damageTakenThisRound=0;roundKills=0;roundStartedAt=performance.now();roundEvents=buildRoundEvents(r);
    const stage=r<=5?1:r<=10?1.08:r<=15?1.16:r<=20?1.24:r<=30?1.34:1.42;
    const base=10+Math.min(34,r*.72);
    let countFactor=(hasModifier('Horda')||hasModifier('Enjambre')||hasModifier('Modo miniatura')) ? 1.3 : (hasModifier('Artillería')||hasModifier('Zona de guerra')||hasModifier('Modo gigante')) ? .65 : 1;
    if(r%10===0)countFactor*=.5;else if(r%5===0)countFactor*=.7;
    const earlyBudgetBoost=r<=5?lerp(1.8,1,(r-1)/4):1,earlySpawnSpeed=r<=5?lerp(1.55,1,(r-1)/4):1;
    enemiesBudget=Math.min(62,Math.round(base*stage*countFactor*earlyBudgetBoost*difficultyProfile.quantity*(1+adaptivePressure*.05)));
    spawnRate=Math.max(500,(1450-Math.min(650,r*18))/earlySpawnSpeed)*(difficultyProfile.value<100?1.18:difficultyProfile.value>=275 ? .84 : 1);if(hasModifier('Horda')||hasModifier('Doble velocidad'))spawnRate*=.88;if(hasModifier('Artillería')||hasModifier('Zona de guerra'))spawnRate*=1.15;
    spawnTimer=700;currentRoundIdentity=buildRoundIdentity();enemyIdentityHistory.push(currentRoundIdentity);if(enemyIdentityHistory.length>8)enemyIdentityHistory.shift();
    document.body.classList.toggle('round-darkness',hasModifier('Oscuridad'));document.body.classList.toggle('round-fog',hasModifier('Niebla'));
    player.noJump=hasModifier('Sin salto');Spawner.preferredEdges=hasModifier('Dos frentes')?[Math.floor(Math.random()*2),2+Math.floor(Math.random()*2)]:null;
    Spawner.configureRoster(r);
    setupRoundObstacles(r,roundModifier);
    showRoundBanner(zoneChanged?`${t(`zones.${arena.themeId}`)} · ${roundModifier}`:roundModifier);
    if(r%10===0){const p=Spawner.edgePoint(Math.floor(Math.random()*4));Spawner.queueSpawn('boss',p.x,p.y,1600);saveProgress('boss-start');}
    else if(r%5===0){const p=Spawner.edgePoint(Math.floor(Math.random()*4));Spawner.queueSpawn('miniboss',p.x,p.y,1400);}
    if(hasModifier('Robo de poder')){const p=Spawner.edgePoint(Math.floor(Math.random()*4));Spawner.queueSpawn('powerThief',p.x,p.y,1500,true);}
}
function buildRoundIdentity(){if(hasModifier('Zona de guerra'))return'Tiradores protegidos por barreras';if(hasModifier('Enjambre'))return'Enjambre de mini zombies';if(hasModifier('Suelo inestable'))return'Arena inestable con atacantes móviles';if(hasModifier('Cazadores'))return'Cazadores coordinados';if(hasModifier('Modo gigante'))return'Horda de enemigos gigantes';return`${roundModifier}: presión progresiva`;}
function showRoundBanner(text){const el=document.getElementById('round-modifier');el.style.whiteSpace='normal';el.textContent=text;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),1700);}
function buildRoundEvents(r){if(r<6)return[];const count=r>=21&&Math.random()<.35 ? 2 : 1;const pool=['horde','elite','crate','hazard','speed','fronts'];if(r>=16)pool.push('target','darkness');const result=[];for(let i=0;i<count;i++){const type=pool.splice(Math.floor(Math.random()*pool.length),1)[0];result.push({progress:i===0 ? .48 : .68,type,fired:false});}return result;}
function triggerRoundEvent(type){
    eventCount++;const edge=Spawner.chooseEdge(),base=Spawner.edgePoint(edge);
    if(type==='horde'){addRing(base.x,base.y,90,'#ef4444');Spawner.spawnFormation(['normal','normal','fast','normal','fast'],edge);}
    else if(type==='elite'){addRing(base.x,base.y,70,'#d6b66b');Spawner.queueSpawn(Spawner.chooseType(currentRound),base.x,base.y,900,true);}
    else if(type==='crate'){createHazard('crate',player.x+220,player.y+120,{radius:42,warning:600,duration:9000,health:35});}
    else if(type==='hazard'){for(let i=0;i<2;i++)createHazard(Math.random()<.5?'spikes':'hole',player.x+(Math.random()-.5)*500,player.y+(Math.random()-.5)*400,{radius:58,warning:1200,duration:5000,damage:9});}
    else if(type==='speed'){for(const z of zombies)if(z.active&&!z.isBoss)z.speed*=1.12;}
    else if(type==='fronts'){Spawner.edgeShift=(Spawner.edgeShift+1)%4;Spawner.preferredEdges=[Spawner.edgeShift,(Spawner.edgeShift+2)%4];}
    else if(type==='target'){Spawner.queueSpawn('powerThief',base.x,base.y,1000,true);}
    else if(type==='darkness'){document.body.classList.add('round-darkness');setTimeout(()=>{if(!hasModifier('Oscuridad'))document.body.classList.remove('round-darkness');},5500);}
}
function registerPlayerDamage(amount){damageTakenThisRound+=Math.max(0,amount);}
function updateAdaptiveDifficulty(){
    const healthRatio=player.health/player.maxHealth,elapsed=Math.max(1,(performance.now()-roundStartedAt)/1000),killRate=roundKills/elapsed;
    if(damageTakenThisRound<1)roundsWithoutDamage++;else roundsWithoutDamage=0;
    let target=0;if(roundsWithoutDamage>=2)target+=.24;if(healthRatio>.86)target+=.18;if(killRate>1.8)target+=.2;if(player.bonusDamage>currentRound*1.6)target+=.15;
    adaptivePressure=clamp(adaptivePressure*.72+target*.28,0,1);
}
function stealPlayerBuff(){const key=Object.keys(player.buffs).find(k=>!['chiliCrash'].includes(k));if(!key)return false;stolenPower={key,buff:{...player.buffs[key]}};delete player.buffs[key];return true;}
function restoreStolenPower(){if(!stolenPower)return;player.buffs[stolenPower.key]=stolenPower.buff;stolenPower=null;}

function createHazard(type,x,y,options={}){
    if(obstacles.length>=Math.min(ENTITY_LIMITS.obstacles,getEncounterLimits(currentRound).hazards))return null;
    if(type==='poison'&&obstacles.filter(o=>o.type==='poison').length>=ENTITY_LIMITS.poison)return null;
    if(player&&distance(x,y,player.x,player.y)<160){const a=Math.atan2(y-player.y,x-player.x)||Math.random()*Math.PI*2;x=player.x+Math.cos(a)*195;y=player.y+Math.sin(a)*195;}
    if(['hole','wall','crate'].includes(type)&&foods.some(f=>f.active&&distance(x,y,f.x,f.y)<(options.radius||65)+f.size+34))return null;
    const o={type,x:clamp(x,70,arena.width-70),y:clamp(y,70,arena.height-70),radius:options.radius||65,warning:(options.warning??900)*difficultyProfile.telegraph,duration:options.duration||5000,damage:options.damage||8,slow:options.slow||.6,active:false,tick:0,angle:Math.random()*Math.PI*2,health:options.health||45,phase:0,direction:Math.random()>.5?1:-1};
    obstacles.push(o);return o;
}
function setupRoundObstacles(r,modifier){
    obstacles=[];if(r<6&&!hasModifier('Terremoto'))return;
    let count=Math.min(5,1+Math.floor(r/8));if(hasModifier('Arena pequeña')||hasModifier('Laberinto temporal')||hasModifier('Arena cerrándose'))count=Math.min(6,count+2);
    const types=[];if(r>=6)types.push('mud','crate');if(r>=9)types.push('spikes');if(r>=12)types.push('fire','hole');if(r>=16)types.push('wall');if(r>=21)types.push('blade');
    for(let i=0;i<count;i++){const fresh=types.filter(type=>!obstacleHistory.slice(-2).includes(type)),pool=fresh.length?fresh:types,type=pool[Math.floor(Math.random()*pool.length)]||'mud';obstacleHistory.push(type);if(obstacleHistory.length>6)obstacleHistory.shift();let x,y,tries=0;do{x=140+Math.random()*(arena.width-280);y=140+Math.random()*(arena.height-280);tries++;}while(player&&distance(x,y,player.x,player.y)<300&&tries<10);createHazard(type,x,y,{radius:type==='wall'?90:55+Math.random()*30,warning:type==='mud'||type==='crate'?450:1100,duration:type==='wall'?12000:9000,health:55});}
    if(hasModifier('Suelo inestable'))for(let i=0;i<2;i++)createHazard('hole',300+Math.random()*(arena.width-600),260+Math.random()*(arena.height-520),{radius:62,warning:1800,duration:7000});
    if(hasModifier('Arena cerrándose')){createHazard('wall',arena.width*.28,arena.height*.35,{radius:125,warning:1000,duration:roundDuration*1000,health:120});createHazard('wall',arena.width*.72,arena.height*.65,{radius:125,warning:1000,duration:roundDuration*1000,health:120});}
}
function updateObstacles(dt){
    for(const o of obstacles){
        if(o.warning>0){o.warning-=dt;if(o.warning<=0){o.active=true;if(solidObstacle(o)&&circleHitsObstacle(player.x,player.y,playerRadius(),o)){o.active=false;o.duration=0;}}continue;}
        o.duration-=dt;o.tick-=dt;o.phase+=dt*.002;
        if(!o.active)continue;
        if(o.type==='blade'){o.x+=Math.cos(o.angle)*1.4*dt/16;o.y+=Math.sin(o.angle)*1.4*dt/16;if(o.x<70||o.x>arena.width-70)o.angle=Math.PI-o.angle;if(o.y<70||o.y>arena.height-70)o.angle=-o.angle;}
        if(o.type==='wall'){const oldX=o.x;o.x+=o.direction*.42*dt/16;if(o.x<o.radius+50||o.x>arena.width-o.radius-50)o.direction*=-1;if(circleHitsObstacle(player.x,player.y,player.size*.48,o)){o.x=oldX;o.direction*=-1;}}
        const d=distance(o.x,o.y,player.x,player.y);
        if(d<o.radius+player.size/2){
            if(o.type==='mud')player.addBuff('slow',180,.6,'🟤','Lodo');
            else if(o.type==='hole'||o.type==='wall'||o.type==='crate')ensurePlayerSafe(true);
            else if(o.tick<=0&&['fire','poison','spikes','blade','quake','shadow','mortar'].includes(o.type)){damagePlayer(o.damage,{kind:'hazard',id:o.type});o.tick=(o.type==='fire'||o.type==='poison'||o.type==='shadow')?600:900;}
        }
        if(o.type==='mud'||o.type==='spikes'||o.type==='fire'||o.type==='poison'||o.type==='blade'){
            let hazardHit=false;
            for(const z of zombies){
                if(!z.active||distance(o.x,o.y,z.x,z.y)>=o.radius+z.size/2)continue;
                if(o.type==='mud')z.stunTimer=Math.max(z.stunTimer,35);
                else if(o.tick<=0){const died=z.takeDamage(o.damage*.45);hazardHit=true;if(died)handleEnemyDeath(z);}
            }
            if(hazardHit)o.tick=500;
        }
    }
    obstacles=obstacles.filter(o=>o.duration>0&&o.health>0);
    ensurePlayerSafe(false);
}
function drawObstacles(){
    for(const o of obstacles){ctx.save();const warn=o.warning>0;ctx.globalAlpha=warn ? .35 : .82;ctx.strokeStyle=warn?'#fbbf24':o.type==='fire'?'#f97316':o.type==='poison'?'#84cc16':o.type==='shadow'?'#818cf8':o.type==='mortar'?'#38bdf8':o.type==='mud'?'#713f12':o.type==='hole'?'#020617':o.type==='spikes'?'#cbd5e1':'#94a3b8';ctx.fillStyle=warn?'rgba(251,191,36,.12)':o.type==='fire'?'rgba(239,68,68,.42)':o.type==='poison'?'rgba(101,163,13,.4)':o.type==='shadow'?'rgba(99,102,241,.28)':o.type==='mortar'?'rgba(14,165,233,.32)':o.type==='mud'?'rgba(120,53,15,.55)':o.type==='hole'?'#020617':o.type==='crate'?'#92400e':o.type==='wall'?'#475569':'rgba(148,163,184,.55)';ctx.lineWidth=4;ctx.beginPath();if(o.type==='wall')ctx.rect(o.x-o.radius,o.y-28,o.radius*2,56);else ctx.arc(o.x,o.y,o.radius,0,Math.PI*2);ctx.fill();ctx.stroke();if(o.type==='spikes'&&!warn){ctx.fillStyle='#e2e8f0';for(let i=0;i<8;i++){const a=i/8*Math.PI*2;ctx.beginPath();ctx.moveTo(o.x+Math.cos(a)*12,o.y+Math.sin(a)*12);ctx.lineTo(o.x+Math.cos(a)*o.radius,o.y+Math.sin(a)*o.radius);ctx.lineTo(o.x+Math.cos(a+.18)*22,o.y+Math.sin(a+.18)*22);ctx.fill();}}if(o.type==='blade'&&!warn){ctx.translate(o.x,o.y);ctx.rotate(o.phase*3);ctx.fillStyle='#e2e8f0';for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.fillRect(0,-8,o.radius,16);}}ctx.restore();}
}

function beginRun(startRound=1,preparedPlayer=null){
    Input.reset();document.activeElement?.blur?.();
    ensureAudio();
    const beginSize=arenaSizeForRound(startRound);arena.width=beginSize.width;arena.height=beginSize.height;applyArenaTheme(startRound);lastAnnouncedZone=null;
    player=preparedPlayer||new Player(arena.width/2,arena.height/2);player.x=arena.width/2;player.y=arena.height/2;player.health=player.maxHealth;player.buffs={};player.powers={};player.storedPower=null;player.regen=null;player.orbs=0;player.dashCharges=player.maxDashCharges;player.dashRechargeTimer=0;resetEntities();score=0;combo=0;comboTimer=0;kills=0;bestCombo=0;autosaveTimer=0;adaptivePressure=0;roundsWithoutDamage=0;modifierHistory=[];enemyIdentityHistory=[];synergyHistory=[];obstacleHistory=[];stolenPower=null;lastDamageSource=null;firingZombie=null;campSamples=[];campSampleTimer=0;campPressure=0;Spawner.resetSession();resetEncounterRotation();
    runInfo={startRound,difficulty:selectedDifficulty,advanced:startRound>1,startedAt:Date.now()};
    uiStartScreen.classList.add('hidden');document.getElementById('loadout-screen').classList.add('hidden');uiRecoveryScreen.classList.add('hidden');uiGameOverScreen.classList.add('hidden');uiPauseScreen.classList.add('hidden');uiHUD.classList.remove('hidden');
    configureRound(startRound);gameState='PLAYING';markSessionActive();saveProgress(startRound>1?'advanced-start':'new-game');lastTime=performance.now();musicDuck=1;startMusic();startTutorial();
}
function initGame(){if(selectedStartRound>1)prepareAdvancedStart();else beginRun(1);}

// En pausa la música se atenúa en vez de detenerse: Opciones se abre desde aquí y el deslizador
// de música necesita algo que oír para poder ajustarse.
// silent = el jugador no está mirando: la música se corta del todo en vez de atenuarse.
function pauseGame({silent=false}={}){
    if(gameState!=='PLAYING')return false;
    Input.reset();gameState='PAUSED';uiPauseScreen.classList.remove('hidden');
    if(silent)stopMusic();else musicDuck=.35;
    return true;
}
window.addEventListener('pause_toggle',()=>{if(gameState==='PLAYING')pauseGame();else if(gameState==='PAUSED')resumeFromPause();});
function resumeFromPause(){Input.pressed.clear();gameState='PLAYING';uiPauseScreen.classList.add('hidden');lastTime=performance.now();musicDuck=1;startMusic();}
document.getElementById('btn-resume').addEventListener('click',resumeFromPause);
document.getElementById('btn-quit').addEventListener('click',()=>{saveProgress('quit');stopMusic();musicDuck=1;gameState='START';uiPauseScreen.classList.add('hidden');uiHUD.classList.add('hidden');uiStartScreen.classList.remove('hidden');setupRunSelectors();refreshMenuStats();checkRecovery();});

window.addEventListener('earthquake',e=>{
    if(gameState!=='PLAYING')return;const d=e.detail;playSound('earthquake');shakeTime=300;shakeMagnitude=10;
    addRing(d.x,d.y,d.radius,'#fbbf24');for(const z of zombies){if(!z.active)continue;const dist=distance(z.x,z.y,d.x,d.y);if(dist<=d.radius){if(z.type==='leech'&&z.attached){const died=z.takeDamage(z.maxHealth);if(died)handleEnemyDeath(z);continue;}if(z.type==='harvester')z.energy=0;const anchor=zombies.find(a=>a.active&&a.type==='anchor'&&distance(a.x,a.y,z.x,z.y)<190),a=Math.atan2(z.y-d.y,z.x-d.x),force=d.pushForce*(1-dist/d.radius)*(anchor ? .4 : 1);z.applyStun(1500*(anchor ? .55 : 1),Math.cos(a)*force,Math.sin(a)*force);}}
});
window.addEventListener('zombie_explosion_warning',e=>{if(gameState!=='PLAYING')return;const d=e.detail,delay=650*difficultyProfile.telegraph;createHazard('fire',d.x,d.y,{radius:d.radius,warning:650,duration:1800,damage:currentRound>=8?d.damage*.45:0});setTimeout(()=>{if(gameState!=='PLAYING')return;addRing(d.x,d.y,d.radius,'#ef4444');for(const z of zombies){if(z.active&&distance(z.x,z.y,d.x,d.y)<=d.radius){const died=z.takeDamage(d.damage);if(died)handleEnemyDeath(z);}}for(let i=0;i<14;i++)spawnParticle(d.x,d.y,'#f97316',8,4);},delay);});
function addRing(x,y,maxRadius,color){if(earthquakeRings.length>=ENTITY_LIMITS.rings)earthquakeRings.shift();earthquakeRings.push({x,y,radius:0,maxRadius,opacity:1,color});}

function updateCamera(){camera.x=arena.width<=canvas.width?(arena.width-canvas.width)/2:clamp(player.x-canvas.width/2,0,arena.width-canvas.width);camera.y=arena.height<=canvas.height?(arena.height-canvas.height)/2:clamp(player.y-canvas.height/2,0,arena.height-canvas.height);if(options.screenShake&&shakeTime>0){camera.x+=(Math.random()-.5)*shakeMagnitude;camera.y+=(Math.random()-.5)*shakeMagnitude;}}

function updateRound(dt){
    roundTimeLeft-=dt/1000;spawnTimer-=dt;const progress=clamp(1-roundTimeLeft/roundDuration,0,1);
    const nextPhase=progress<.34?'start':progress<.72?'mid':'final';if(nextPhase!==roundPhase){roundPhase=nextPhase;if(roundPhase==='final'&&!lastWaveTriggered){lastWaveTriggered=true;const combo=Spawner.synergy(currentRound);if(combo)Spawner.spawnFormation(combo,Spawner.chooseEdge(),shouldSpawnElite()?0:-1);}}
    for(const event of roundEvents)if(!event.fired&&progress>=event.progress){event.fired=true;triggerRoundEvent(event.type);}
    if(hasModifier('Terremotos')&&Math.floor(progress*5)>eventCount){eventCount++;createHazard('quake',player.x+(Math.random()-.5)*420,player.y+(Math.random()-.5)*360,{radius:105,warning:1100,duration:700,damage:10});}
    const bossTimedOut=currentRound%5===0&&roundTimeLeft<=0;
    // Arena limpia con presupuesto pendiente: las siguientes oleadas entran encadenadas en vez de
    // esperar el temporizador, con un tope de avisos simultáneos para que no aparezca un muro de golpe.
    if(!bossTimedOut&&enemiesQueued<enemiesBudget&&!zombies.some(z=>z.active)&&Spawner.warnings.length<4&&spawnTimer>120)spawnTimer=120;
    if(!bossTimedOut&&spawnTimer<=0&&enemiesQueued<enemiesBudget&&getActiveEnemyCount()<getEncounterLimits(currentRound).activeEnemies){const count=Spawner.spawnGroup(currentRound);enemiesQueued+=Math.max(1,count);const phaseFactor=roundPhase==='start' ? 1.2 : roundPhase==='mid' ? .92 : .76,targetPressure=zombies.some(z=>z.active&&z.type==='powerThief') ? .82 : 1;spawnTimer=spawnRate*phaseFactor*targetPressure*(.86+Math.random()*.28);}
    const bossRound=currentRound%5===0,bossAlive=bossForRound&&bossForRound.active,regularAlive=zombies.some(z=>z.active&&!z.isBoss&&!z.isMiniBoss)||Spawner.warnings.length>0;
    // Ronda despejada: ya se gastó el presupuesto de la ronda y no queda nada vivo ni por aparecer.
    const arenaCleared=enemiesBudget>0&&enemiesQueued>=enemiesBudget&&!zombies.some(z=>z.active)&&Spawner.warnings.length===0;
    if(!roundEnded&&((!bossRound&&(roundTimeLeft<=0||arenaCleared))||(bossRound&&!bossAlive&&(roundTimeLeft<=0||!regularAlive)))){
        if(!bossRound&&arenaCleared&&roundTimeLeft>0)showNotification(t('hud.arenaCleared'));
        endRound();
    }
}
function endRound(){
    roundEnded=true;Input.reset();if(player.isDashing)player.finishDash(false);gameState='UPGRADING';updateAdaptiveDifficulty();restoreStolenPower();player.noJump=false;saveBestiary();
    for(const p of enemyProjectiles)p.active=false;enemyProjectiles=[];obstacles=[];Spawner.reset();
    for(const z of zombies)z.active=false;zombies=[];
    updateRecords(true);saveProgress('round-complete');showUpgrades();
}

function buildZombieGrid(){
    const grid=new Map(),cellSize=140;
    for(const z of zombies){if(!z.active)continue;const key=`${Math.floor(z.x/cellSize)},${Math.floor(z.y/cellSize)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(z);}
    return{grid,cellSize};
}
function nearbyZombies(spatial,x,y){
    const cx=Math.floor(x/spatial.cellSize),cy=Math.floor(y/spatial.cellSize),result=[];
    for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++){const bucket=spatial.grid.get(`${gx},${gy}`);if(bucket)result.push(...bucket);}
    return result;
}
function checkCollisions(){
    const spatial=buildZombieGrid();
    for(const p of projectiles){
        if(!p.active)continue;if(p.x<0||p.x>arena.width||p.y<0||p.y>arena.height){if(p.bounces>0){p.bounces--;p.damage*=.62;if(p.x<0||p.x>arena.width)p.vx*=-1;if(p.y<0||p.y>arena.height)p.vy*=-1;p.x=clamp(p.x,2,arena.width-2);p.y=clamp(p.y,2,arena.height-2);}else p.active=false;continue;}
        for(const o of obstacles){if(!p.active||!o.active||!['crate','wall'].includes(o.type))continue;if(circleHitsObstacle(p.x,p.y,p.size,o)){if(p.bounces>0){p.bounces--;p.damage*=.62;const nx=Math.abs(p.x-o.x)>o.radius*.75?Math.sign(p.x-o.x):0,ny=nx?0:Math.sign(p.y-o.y);if(nx)p.vx*=-1;if(ny)p.vy*=-1;p.x+=nx*5;p.y+=ny*5;}else p.active=false;o.health-=p.damage;if(o.type==='crate'&&o.health<=0&&Math.random()<.14)spawnFood(o.x,o.y,null,'elite');}}
        for(const z of nearbyZombies(spatial,p.x,p.y)){if(!p.active||!z.active||p.hits?.has(z))continue;const dx=p.x-z.x,dy=p.y-z.y,reach=p.size+z.size/2;if(dx*dx+dy*dy<reach*reach){p.hits?.add(z);for(let i=0;i<4;i++)spawnParticle(p.x,p.y,z.color,3,3);const sourceAngle=Math.atan2(-p.vy,-p.vx);const died=z.takeDamage(p.damage,sourceAngle);if(options.damageNumbers&&damageNumbers.length<32)damageNumbers.push({x:z.x,y:z.y-z.size/2,value:Math.round(p.damage),life:650});if(p.chain>0){const arc=p.chain,targets=zombies.filter(other=>other.active&&other!==z&&distance(other.x,other.y,z.x,z.y)<170+arc*30).sort((a,b)=>distance(a.x,a.y,z.x,z.y)-distance(b.x,b.y,z.x,z.y)).slice(0,1+arc);const arcDamage=p.damage*(.45+.12*arc);for(const target of targets){addChainArc(z,target);const chained=target.takeDamage(arcDamage);if(options.damageNumbers&&damageNumbers.length<32)damageNumbers.push({x:target.x,y:target.y-target.size/2,value:Math.round(arcDamage),life:650});if(chained)handleEnemyDeath(target);}p.chain=0;}if(p.secondary){const a=Math.atan2(p.vy,p.vx);for(const off of[-.48,.48]){const child=spawnProjectile(p.x,p.y,a+off,Math.hypot(p.vx,p.vy)*.8,p.damage*.28,Math.max(2,p.size*.55),'#fef3c7',0);if(child)child.secondary=false;}p.secondary=false;}if(p.pierce>0){p.pierce--;p.damage*=.82;}else p.active=false;if(died)handleEnemyDeath(z);}}
    }
    for(const p of enemyProjectiles){if(!p.active)continue;if(p.x<0||p.x>arena.width||p.y<0||p.y>arena.height){p.active=false;continue;}if(distance(p.x,p.y,player.x,player.y)<p.size+playerRadius()){p.active=false;if(player.orbs>0){player.orbs--;continue;}if(p.effect==='freeze')player.addBuff('frozen',3500,.68,'FR','Frozen');if(damagePlayer(p.damage,{kind:'enemy',label:p.ownerLabel})){playSound('hit');shakeTime=140;shakeMagnitude=9;}}}
    for(const z of zombies){if(!z.active)continue;const d=distance(player.x,player.y,z.x,z.y);if(!player.hasPower('ghost')&&d<playerRadius()+z.size/2&&z.attackCooldown<=0){if(player.orbs>0&&!z.isBoss){player.orbs--;const died=z.takeDamage((player.baseDamage+player.bonusDamage)*1.5);if(died)handleEnemyDeath(z);z.attackCooldown=700;continue;}if(damagePlayer(z.damage,{kind:'enemy',label:enemyLabel(z)})){playSound('hit');shakeTime=150;shakeMagnitude=12;const safe=Math.max(1,d);movePlayerByAxes((player.x-z.x)/safe*14,(player.y-z.y)/safe*14);}z.attackCooldown=650;}}
    for(const f of foods){if(f.active&&distance(f.x,f.y,player.x,player.y)<f.size+player.size/2+20){const data=FOODS[f.type];data.apply(player);f.active=false;showPickup(data);saveProgress('food');}}
    for(const pickup of superPickups){if(pickup.active&&distance(pickup.x,pickup.y,player.x,player.y)<42+player.size/2){if(player.addPower(pickup.type,POWER_DEFS[pickup.type].duration)){pickup.active=false;if(pickup.type==='orbitals')player.orbs=Math.min(6,player.orbs+4);showPowerPickup(pickup.type);saveProgress('super-power');}}}
    projectiles=projectiles.filter(p=>p.active);enemyProjectiles=enemyProjectiles.filter(p=>p.active);zombies=zombies.filter(z=>z.active);foods=foods.filter(f=>f.active);superPickups=superPickups.filter(p=>p.active);
}
function handleEnemyDeath(z){
    if(z.deadHandled)return;z.deadHandled=true;registerDefeat(z);kills++;roundKills++;player.kills=kills;combo++;bestCombo=Math.max(bestCombo,combo);player.bestCombo=bestCombo;comboTimer=comboWindow();
    score+=(z.scoreValue+combo)*comboMultiplier()*(hasModifier('Sin curación')?1.2:1);
    playSound('combo',1+Math.min(combo,COMBO_CAP)*.045);
    if(['normal','fast'].includes(z.type)){recentDeadBasics.push({type:z.type});if(recentDeadBasics.length>8)recentDeadBasics.shift();}for(const collector of zombies)if(collector.active&&['harvester','undertaker'].includes(collector.type))collector.energy++;
    try{z.onDeath();}catch(e){console.warn('Entity cleanup skipped',e);}
    if(z.isElite){if(z.eliteAbility==='explosion')window.dispatchEvent(new CustomEvent('zombie_explosion_warning',{detail:{x:z.x,y:z.y,radius:90,damage:16}}));if(z.eliteAbility==='hazard')createHazard('poison',z.x,z.y,{radius:58,warning:400,duration:3600,damage:5});if(z.eliteAbility==='mini')queueDirectSpawn('mini',z.x,z.y);}
    for(let i=0;i<(z.isBoss?35:z.isMiniBoss?24:z.isElite?16:8);i++)spawnParticle(z.x,z.y,z.color,z.isBoss?9:5,z.isBoss?6:4);
    const critical=player.health/player.maxHealth<.28;let chance=(.015+(z.isElite ? .105 : 0)+(critical ? .012 : 0)+((hasModifier('Comida abundante')||hasModifier('Tormenta de comida')) ? .045 : 0))*difficultyProfile.foodFactor;
    if(z.isMiniBoss){const reward={breaker:'bacon',broodmother:'popcorn',arenaWarden:'soup',redMaw:'chili',signal:'energy',hollowKnight:'donut'}[z.bestiaryId];spawnFood(z.x-18,z.y,reward,'elite');if(Math.random()<.45*difficultyProfile.foodFactor)spawnFood(z.x+18,z.y,null,'elite');saveProgress('miniboss');}
    else if(z.isBoss){const reward={graveEngine:'cake',theMaw:'burger',paleChoir:'grapes',blackSun:'donut',butcher:'chili',rootKing:'pizza'}[z.bestiaryId]||'cake';spawnFood(z.x-28,z.y,hasModifier('Sin curación')?'grapes':reward,'boss');spawnFood(z.x+28,z.y,weightedFood('boss'),'boss');if(!hasModifier('Sin curación'))player.health=Math.min(player.maxHealth,player.health+player.maxHealth*.3);enemyProjectiles.forEach(p=>p.active=false);obstacles=[];saveProgress('boss');addRing(z.x,z.y,260,'#fbbf24');}
    else if(Math.random()<chance)spawnFood(z.x,z.y,null,z.isElite?'elite':'normal');
    const powerChance=z.isBoss ? .72 : z.isMiniBoss ? .2 : z.isElite ? .025 : .0015;if(Math.random()<powerChance*difficultyProfile.foodFactor)spawnSuperPower(z.x,z.y);
    updateRecords(false);
}

function updateHUD(time){
    const hp=clamp(player.health/player.maxHealth*100,0,100);healthBar.style.width=`${hp}%`;healthText.textContent=`${Math.ceil(player.health)} / ${player.maxHealth}`;scoreText.textContent=t('hud.score',{score:Math.floor(score)});
    healthBarContainer.classList.toggle('low-health',hp<=30);
    document.getElementById('run-scrap').textContent=t('hud.runScrap',{amount:runScrapSoFar()});
    const comboWrap=document.getElementById('combo-wrap'),comboEl=document.getElementById('combo'),comboBar=document.getElementById('combo-bar');
    const comboActive=combo>1&&comboTimer>0;
    comboWrap.classList.toggle('hidden',!comboActive);
    if(comboActive){
        comboEl.textContent=t('hud.combo',{combo:comboMultiplier().toFixed(1),kills:combo});
        comboBar.style.width=`${clamp(comboTimer/comboWindow()*100,0,100)}%`;
        comboWrap.classList.toggle('hot',combo>=12);
    }
    document.getElementById('round-info').textContent=gameState==='UPGRADING'?t('hud.safePause'):gameState==='COUNTDOWN'?t('hud.preparing'):t('hud.round',{round:currentRound,time:Math.max(0,Math.ceil(roundTimeLeft)),name:roundModifier});
    if(roundTimerBar){const timerPct=gameState==='PLAYING'&&roundDuration>0?clamp(roundTimeLeft/roundDuration*100,0,100):100;roundTimerBar.style.width=`${timerPct}%`;roundTimerBar.classList.toggle('low',timerPct<=25);}
    document.getElementById('weapon-level').textContent=t('hud.weapon',{level:player.weaponLevel});
    const elapsed=time-player.lastJumpTime,effectiveJump=player.jumpCooldown/(player.buffs.jumpRate?.value||1),jump=document.getElementById('jump-cooldown');if(player.noJump){jump.textContent=t('hud.jumpBlocked');jump.style.color='#f87171';if(jumpCooldownBar){jumpCooldownBar.style.width='100%';jumpCooldownBar.className='cooldown-fill blocked';}}else if(elapsed>=effectiveJump){jump.textContent=t('hud.jumpReady');jump.style.color='#34d399';if(jumpCooldownBar)jumpCooldownBar.className='cooldown-fill ready';}else{jump.textContent=t('hud.jumpTime',{time:((effectiveJump-elapsed)/1000).toFixed(1)});jump.style.color='#94a3b8';if(jumpCooldownBar){jumpCooldownBar.className='cooldown-fill';jumpCooldownBar.style.width=`${clamp(elapsed/effectiveJump*100,0,100)}%`;}}
    const dash=document.getElementById('dash-cooldown');if(player.isDashing){dash.textContent=t('hud.dashActive');dash.style.color='#7dd3fc';if(dashCooldownBar)dashCooldownBar.className='cooldown-fill active';}else if(player.dashAvailable){dash.textContent=player.maxDashCharges>1?t('hud.dashCharges',{count:player.dashCharges}):t('hud.dashReady');dash.style.color='#38bdf8';if(dashCooldownBar)dashCooldownBar.className='cooldown-fill ready';}else{dash.textContent=t('hud.dashTime',{time:Math.max(0,player.dashRechargeTimer/1000).toFixed(1)});dash.style.color='#94a3b8';if(dashCooldownBar){dashCooldownBar.className='cooldown-fill';dashCooldownBar.style.width=`${clamp((1-player.dashRechargeTimer/player.getDashCooldown())*100,0,100)}%`;}}
    if(bossForRound&&bossForRound.active){bossHUD.classList.remove('hidden');bossName.textContent=t('boss.phase',{name:bossForRound.displayName||t('boss.miniboss'),phase:bossForRound.phase||1});bossBar.style.width=`${clamp(bossForRound.health/bossForRound.maxHealth*100,0,100)}%`;}else bossHUD.classList.add('hidden');
    if(time-hudEffectsTimer>100){hudEffectsTimer=time;renderActiveEffects();}
}

function renderActiveEffects(){
    const el=document.getElementById('active-effects'),entries=[];
    for(const [key,b] of Object.entries(player.buffs)){if(!b||!Number.isFinite(b.time)||key==='chiliCrash')continue;entries.push({icon:effectGlyph(key),label:effectLabel(key),time:b.time,duration:b.duration||b.time});}
    if(player.regen)entries.push({icon:'RG',label:currentLanguage==='es'?'Regeneración':'Regeneration',time:player.regen.time,duration:player.regen.duration||player.regen.time});
    if(player.shieldHits)entries.push({icon:'SH',label:currentLanguage==='es'?'Escudo':'Shield',hits:player.shieldHits});if(player.orbs)entries.push({icon:'OR',label:currentLanguage==='es'?'Orbes':'Orbs',hits:player.orbs});
    el.innerHTML=entries.slice(0,8).map(e=>`<div class="effect-chip"><span>${e.icon}</span><span>${e.label}</span><span>${e.hits!=null?t(e.hits===1?'hud.shieldHit':'hud.shieldHits',{count:e.hits}):`${(e.time/1000).toFixed(1)}s`}</span>${e.time!=null?`<span class="effect-progress" style="transform:scaleX(${clamp(e.time/e.duration,0,1)})"></span>`:''}</div>`).join('');
    const powers=document.getElementById('super-powers'),active=Object.entries(player.powers).map(([key,p])=>({key,...p}));if(player.storedPower)active.unshift({key:player.storedPower,time:0,duration:0,stored:true});powers.innerHTML=active.map(p=>{const copy=powerCopy(p.key),remaining=p.stored?'Q':`${(p.time/1000).toFixed(1)}s`;return`<div class="power-chip" style="--power:${POWER_DEFS[p.key].color}"><b>${POWER_DEFS[p.key].glyph}</b><span>${copy[0]}</span><em>${remaining}</em>${!p.stored?`<i style="transform:scaleX(${clamp(p.time/p.duration,0,1)})"></i>`:''}</div>`;}).join('');
}
const EFFECT_GLYPHS={speed:'MV',slow:'SL',frozen:'FR',fireRate:'FR',damage:'DM',pierce:'PR',jumpRate:'JP',projectileSpeed:'PS',projectileSize:'SZ',armor:'AR',icecream:'IC',cheese:'CH',bounce:'RC',popcorn:'SP',garlic:'AU',chili:'HT',energy:'EN'};
function effectGlyph(key){return EFFECT_GLYPHS[key]||'FX';}
function effectLabel(key){const labels={speed:['Movement','Movimiento'],slow:['Slowed','Lento'],frozen:['Frozen','Congelado'],fireRate:['Fire rate','Cadencia'],damage:['Damage','Daño'],pierce:['Piercing','Perforación'],jumpRate:['Jump recovery','Recarga de salto'],projectileSpeed:['Projectile speed','Velocidad de proyectil'],projectileSize:['Projectile size','Tamaño de proyectil'],armor:['Armor','Armadura'],icecream:['Cold field','Campo frío'],cheese:['Slow field','Campo lento'],bounce:['Ricochet','Rebote'],popcorn:['Split shot','Disparo dividido'],garlic:['Damage field','Campo de daño'],chili:['Overdrive','Impulso'],energy:['Energy','Energía']};return(labels[key]||[key,key])[currentLanguage==='es'?1:0];}

function update(dt,time){
    if(gameState!=='PLAYING')return;
    try{
        if(shakeTime>0)shakeTime-=dt;if(comboTimer>0){comboTimer-=dt;if(comboTimer<=0)combo=0;}
        const input={keys:Input.keys,mouse:{x:Input.mouse.x+camera.x,y:Input.mouse.y+camera.y},consume:key=>Input.consume(key)};
        player.update(dt,input,projectiles,{left:0,right:arena.width,top:0,bottom:arena.height},time);
        updateRound(dt);Spawner.update(dt);updateObstacles(dt);
        for(const r of earthquakeRings){r.radius+=300*dt/1000;r.opacity-=1.5*dt/1000;}earthquakeRings=earthquakeRings.filter(r=>r.opacity>0);
        for(const p of particles)p.update(dt);for(const p of projectiles)p.update(dt);for(const p of enemyProjectiles)p.update(dt*(player.hasPower('timeFreeze') ? .2 : 1));
        for(const f of foods)f.update(dt);for(const p of superPickups)p.update(dt);
        for(const trail of dashTrails){trail.life-=dt;if(trail.damage>0){for(const z of zombies){if(!z.active||trail.hit.has(z))continue;const vx=trail.to.x-trail.from.x,vy=trail.to.y-trail.from.y,l2=vx*vx+vy*vy||1,t=clamp(((z.x-trail.from.x)*vx+(z.y-trail.from.y)*vy)/l2,0,1),cx=trail.from.x+vx*t,cy=trail.from.y+vy*t;if(distance(z.x,z.y,cx,cy)<z.size/2+18){trail.hit.add(z);const died=z.takeDamage(trail.damage);if(died)handleEnemyDeath(z);}}}}dashTrails=dashTrails.filter(t=>t.life>0);
        garlicTick-=dt;
        for(const z of zombies){try{const oldSpeed=z.speed,near=distance(z.x,z.y,player.x,player.y),freeze=player.hasPower('timeFreeze')?(z.isBoss ? .58 : z.isMiniBoss ? .42 : .2):1,behaviorDt=dt*difficultyProfile.abilityRate*freeze,ghostOffset=player.hasPower('ghost')&&!z.isBoss?180:0,targetX=player.x+Math.cos(time/820+z.x*.01)*ghostOffset,targetY=player.y+Math.sin(time/730+z.y*.01)*ghostOffset;z.speed*=difficultyProfile.speed/Math.max(.2,difficultyProfile.abilityRate);if(player.hasPower('gravityWell')&&!z.isBoss){const a=Math.atan2(player.y-z.y,player.x-z.x),pull=(z.isMiniBoss?0.18:.48)*dt/16;z.x+=Math.cos(a)*pull;z.y+=Math.sin(a)*pull;}if(player.buffs.icecream&&near<430)z.speed*=z.isBoss ? .86 : z.isMiniBoss ? .78 : .65;if(player.buffs.cheese&&near<150)z.speed*=z.isBoss ? .9 : .72;firingZombie=z;z.update(behaviorDt,targetX,targetY);firingZombie=null;z.speed=oldSpeed;if(hasModifier('Regeneración enemiga')&&z.lastDamaged>2600)z.health=Math.min(z.maxHealth,z.health+z.maxHealth*(z.isBoss ? .00018 : .00045)*dt/16);if(player.buffs.garlic&&near<115&&garlicTick<=0){const died=z.takeDamage(Math.min(4,(player.baseDamage+player.bonusDamage)*.12));if(died)handleEnemyDeath(z);}}catch(e){z.active=false;console.warn('Enemigo defectuoso retirado',e);}}
        if(garlicTick<=0)garlicTick=420;
        updateTutorial(dt);updateCampPressure(dt);
        for(const n of damageNumbers){n.life-=dt;n.y-=dt*.025;}damageNumbers=damageNumbers.filter(n=>n.life>0);particles=particles.filter(p=>p.active&&p.life>0);checkCollisions();updateCamera();updateHUD(time);
        autosaveTimer+=dt;if(autosaveTimer>=8000){autosaveTimer=0;saveProgress('interval');}
        if(player.health<=0)gameOver();
    }catch(e){console.error('El fotograma se recuperó de un error',e);particles=particles.filter(Boolean);zombies=zombies.filter(z=>z&&Number.isFinite(z.x));}
}

function drawArena(){ctx.fillStyle=arena.color;ctx.fillRect(0,0,arena.width,arena.height);ctx.strokeStyle=arena.gridColor;ctx.lineWidth=1;for(let x=0;x<arena.width;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,arena.height);ctx.stroke();}for(let y=0;y<arena.height;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(arena.width,y);ctx.stroke();}ctx.strokeStyle=arena.wallColor;ctx.lineWidth=20;ctx.strokeRect(0,0,arena.width,arena.height);}
function drawVisibilityMask(){if(!hasModifier('Oscuridad')&&!hasModifier('Niebla')&&!document.body.classList.contains('round-darkness'))return;const dark=hasModifier('Oscuridad')||document.body.classList.contains('round-darkness'),inner=dark?170:300,outer=dark?520:720,g=ctx.createRadialGradient(player.x,player.y,inner,player.x,player.y,outer);g.addColorStop(0,'rgba(2,6,23,0)');g.addColorStop(1,dark?'rgba(2,6,23,.82)':'rgba(148,163,184,.56)');ctx.fillStyle=g;ctx.fillRect(0,0,arena.width,arena.height);}
function draw(){ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);if(!player||!['PLAYING','UPGRADING','COUNTDOWN','PAUSED','GAME_OVER'].includes(gameState))return;ctx.save();ctx.translate(-camera.x,-camera.y);drawArena();drawObstacles();drawVisibilityMask();Spawner.draw(ctx);for(const trail of dashTrails){ctx.save();ctx.globalAlpha=clamp(trail.life/trail.maxLife,0,.72);ctx.strokeStyle=trail.color;ctx.lineWidth=trail.damage?22:9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(trail.from.x,trail.from.y);ctx.lineTo(trail.to.x,trail.to.y);ctx.stroke();ctx.restore();}for(const r of earthquakeRings){ctx.globalAlpha=r.opacity;ctx.strokeStyle=r.color||'#fbbf24';ctx.lineWidth=5;ctx.beginPath();ctx.arc(r.x,r.y,r.radius,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}for(const f of foods)f.draw(ctx);for(const p of superPickups)p.draw(ctx);for(const p of particles)p.draw(ctx);for(const p of projectiles)p.draw(ctx);for(const p of enemyProjectiles)p.draw(ctx);for(const z of zombies){ctx.save();if(hasModifier('Niebla')){const d=distance(z.x,z.y,player.x,player.y);ctx.globalAlpha=d>600 ? .35 : d>420 ? .62 : 1;}z.draw(ctx);ctx.restore();}if(player.hasPower('gravityWell')){ctx.save();ctx.strokeStyle='rgba(129,140,248,.34)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(player.x,player.y,210+Math.sin(Date.now()/120)*8,0,Math.PI*2);ctx.stroke();ctx.restore();}player.draw(ctx);if(options.damageNumbers){ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.fillStyle='#e2e8f0';for(const n of damageNumbers){ctx.globalAlpha=clamp(n.life/300,0,1);ctx.fillText(n.value,n.x,n.y);}ctx.globalAlpha=1;}ctx.restore();}
function gameLoop(time){let dt=Math.min(80,Math.max(0,time-lastTime));lastTime=time;update(dt,time);draw();requestAnimationFrame(gameLoop);}

const upgradePool = [
    {key:'maxHealth',apply:()=>{player.maxHealth+=20;player.health=Math.min(player.maxHealth,player.health+player.maxHealth*.5)}},
    {key:'heal',apply:()=>player.health=player.maxHealth},
    {key:'speed',apply:()=>player.speed*=1.12},
    {key:'damage',apply:()=>player.bonusDamage+=5},
    {key:'fireRate',apply:()=>player.fireRate=Math.max(85,player.fireRate*.91)},
    {key:'agility',apply:()=>player.jumpCooldown=Math.max(1200,player.jumpCooldown-800)},
    {key:'armor',apply:()=>player.damageReduction=Math.min(.42,player.damageReduction+.08)},
    {key:'shield',apply:()=>player.shieldHits=Math.min(2,player.shieldHits+1)},
    {key:'dashDistance',apply:()=>player.dashDistance=Math.min(255,player.dashDistance*1.12)},
    {key:'dashSpeed',apply:()=>player.dashSpeed=Math.min(1.55,player.dashSpeed*1.12)},
    {key:'dashRecovery',apply:()=>player.dashCooldown=Math.max(1800,player.dashCooldown-350)},
    {key:'dashShield',apply:()=>player.dashInvulnerability=Math.min(450,player.dashInvulnerability+45)},
    {key:'shockDash',apply:()=>player.shockDash=true},
    {key:'trailBurn',apply:()=>player.trailBurn=true},
    {key:'doubleDash',apply:()=>{player.maxDashCharges=2;player.dashCharges=2}},
    // Ramas de construcción: cambian cómo se dispara, no sólo cuánto. Se acumulan hasta PERK_MAX.
    {key:'scatter',perk:'scatter',apply:()=>player.perks.scatter++},
    {key:'lance',perk:'lance',apply:()=>player.perks.lance++},
    {key:'ricochet',perk:'ricochet',apply:()=>player.perks.ricochet++},
    {key:'arc',perk:'arc',apply:()=>player.perks.arc++},
    {key:'siege',perk:'siege',apply:()=>{player.perks.siege++;player.bonusDamage+=14;player.fireRate=Math.min(900,player.fireRate*1.2);player.projectileSize+=2;}}
];
const PERK_MAX=3;
const PERK_NUMERALS=['','I','II','III'];
function perkLevel(key){return player?.perks?.[key]||0;}
function upgradeAvailable(upgrade,simulation=false){if(simulation&&['heal','shield'].includes(upgrade.key))return false;if(upgrade.perk)return perkLevel(upgrade.perk)<PERK_MAX;if(upgrade.key==='speed')return player.speed<7;if(upgrade.key==='fireRate')return player.fireRate>90;if(upgrade.key==='agility')return player.jumpCooldown>1300;if(upgrade.key==='armor')return player.damageReduction<.4;if(upgrade.key==='dashDistance')return player.dashDistance<250;if(upgrade.key==='dashSpeed')return player.dashSpeed<1.5;if(upgrade.key==='dashRecovery')return player.dashCooldown>1900;if(upgrade.key==='dashShield')return player.dashInvulnerability<430;if(upgrade.key==='shockDash')return !player.shockDash;if(upgrade.key==='trailBurn')return !player.trailBurn;if(upgrade.key==='doubleDash')return player.maxDashCharges<2;return true;}
function loadoutSnapshot(startRound){return{startRound,maxHealth:player.maxHealth,speed:player.speed,bonusDamage:player.bonusDamage,fireRate:player.fireRate,jumpCooldown:player.jumpCooldown,damageReduction:player.damageReduction,weaponLevel:player.weaponLevel,dashDistance:player.dashDistance,dashCooldown:player.dashCooldown,dashCharges:player.maxDashCharges,shockDash:player.shockDash,trailBurn:player.trailBurn};}
function generateAdvancedLoadout(startRound){
    player=new Player(arena.width/2,arena.height/2);for(let round=1;round<startRound;round++){const available=upgradePool.filter(u=>upgradeAvailable(u,true)).sort(()=>Math.random()-.5),choices=available.slice(0,3),chosen=choices[Math.floor(Math.random()*choices.length)];if(chosen)chosen.apply();if(round%2===0)player.levelUpWeapon(true);}player.health=player.maxHealth;player.shieldHits=0;player.buffs={};player.regen=null;preparedLoadout=loadoutSnapshot(startRound);gameMeta.lastLoadout=preparedLoadout;saveMeta();return player;
}
function renderLoadoutSummary(){if(!preparedLoadout)return;const s=preparedLoadout,items=[[t('loadout.health'),`+${Math.round((s.maxHealth/100-1)*100)}%`],[t('loadout.movement'),`+${Math.round((s.speed/4-1)*100)}%`],[t('loadout.damage'),`+${Math.round(s.bonusDamage/10*100)}%`],[t('loadout.fireRate'),`+${Math.round((1- s.fireRate/300)*100)}%`],[t('loadout.jump'),`-${Math.round((1-s.jumpCooldown/5000)*100)}%`],[t('loadout.armor'),`${Math.round(s.damageReduction*100)}%`],[t('loadout.weapon'),String(s.weaponLevel)]];document.getElementById('loadout-summary').innerHTML=items.map(([label,value])=>`<span>${label}</span><strong>${value}</strong>`).join('');document.getElementById('btn-loadout-reroll').disabled=loadoutRerolls>=1;}
function prepareAdvancedStart(){loadoutRerolls=0;gameState='LOADOUT';generateAdvancedLoadout(selectedStartRound);uiStartScreen.classList.add('hidden');uiGameOverScreen.classList.add('hidden');uiRecoveryScreen.classList.add('hidden');document.getElementById('loadout-screen').classList.remove('hidden');renderLoadoutSummary();}
function rerollAdvancedLoadout(){if(loadoutRerolls>=1)return;loadoutRerolls++;generateAdvancedLoadout(selectedStartRound);renderLoadoutSummary();}
function startPreparedLoadout(){if(!preparedLoadout)return;beginRun(selectedStartRound,player);}
function showUpgrades(){
    uiUpgradeScreen.classList.remove('hidden');uiUpgradeOptions.innerHTML='';
    if(currentRound%2===0)player.levelUpWeapon();
    // Siempre se ofrece una rama de construcción junto a mejoras de estadísticas: sin esto todas
    // las partidas acaban siendo la misma caja algo más fuerte.
    const available=upgradePool.filter(u=>upgradeAvailable(u));
    const perks=available.filter(u=>u.perk).sort(()=>Math.random()-.5);
    const stats=available.filter(u=>!u.perk).sort(()=>Math.random()-.5);
    const choices=[];
    if(perks.length)choices.push(perks[0]);
    for(const stat of stats){if(choices.length>=3)break;choices.push(stat);}
    for(const perk of perks.slice(1)){if(choices.length>=3)break;choices.push(perk);}
    choices.sort(()=>Math.random()-.5);
    for(const choice of choices){const copy=t(`upgrades.${choice.key}`);const level=choice.perk?perkLevel(choice.perk)+1:0;const div=document.createElement('div');div.className=`upgrade-card${choice.perk?' perk-card':''}`;div.innerHTML=`<h3>${copy[0]}${level?` <span class="perk-level">${PERK_NUMERALS[level]}</span>`:''}</h3><p>${copy[1]}</p>`;div.onclick=()=>{if(gameState!=='UPGRADING')return;choice.apply();showNotification(t('upgrade.selected'));saveProgress('upgrade');uiUpgradeScreen.classList.add('hidden');startCountdown(()=>{resetEntities();configureRound(currentRound+1);gameState='PLAYING';lastTime=performance.now();saveProgress('next-round');});};uiUpgradeOptions.appendChild(div);}
}
function startCountdown(callback){
    Input.reset();gameState='COUNTDOWN';const el=document.getElementById('countdown');el.classList.remove('hidden');let count=3;el.textContent='3';
    const timer=setInterval(()=>{count--;if(count>0)el.textContent=String(count);else if(count===0)el.textContent=t('upgrade.next');else{clearInterval(timer);el.classList.add('hidden');callback();}},1000);
}

function finite(v,fallback,min=-Infinity,max=Infinity){return Number.isFinite(Number(v))?clamp(Number(v),min,max):fallback;}
function loadJSON(key){try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}catch{return null;}}
function loadRecords(){const d=loadJSON(RECORD_KEY)||{};return{highScore:finite(d.highScore,finite(localStorage.getItem('deadboxHighScore')||localStorage.getItem('arenaHighScore'),0,0),0),highRound:finite(d.highRound,finite(localStorage.getItem('deadboxHighScoreRound')||localStorage.getItem('arenaHighScoreRound'),1,1),1),highKills:finite(d.highKills,0,0),bestCombo:finite(d.bestCombo,0,0),soundEnabled:d.soundEnabled!==false,byMode:d.byMode&&typeof d.byMode==='object'?d.byMode:{}};}
function updateRecords(force=false){
    const before=JSON.stringify(records),mode=runInfo.advanced?`advanced-r${runInfo.startRound}`:'standard',key=`${mode}-${runInfo.difficulty}`,entry=records.byMode[key]||{highScore:0,highRound:runInfo.startRound,highKills:0,bestCombo:0,bestTime:0};entry.highScore=Math.max(entry.highScore,Math.floor(score));entry.highRound=Math.max(entry.highRound,currentRound);entry.highKills=Math.max(entry.highKills,kills);entry.bestCombo=Math.max(entry.bestCombo,bestCombo);entry.bestTime=Math.max(entry.bestTime,Date.now()-runInfo.startedAt);records.byMode[key]=entry;if(!runInfo.advanced){records.highScore=Math.max(records.highScore,Math.floor(score));records.highRound=Math.max(records.highRound,currentRound);records.highKills=Math.max(records.highKills,kills);records.bestCombo=Math.max(records.bestCombo,bestCombo);}unlockStartingRounds(currentRound);records.soundEnabled=soundEnabled;
    if(force||JSON.stringify(records)!==before){localStorage.setItem(RECORD_KEY,JSON.stringify(records));localStorage.setItem('deadboxHighScore',String(records.highScore));localStorage.setItem('deadboxHighScoreRound',String(records.highRound));refreshMenuStats();}
}
function saveProgress(reason='auto'){
    if(!player)return;updateRecords(false);const data={version:3,reason,savedAt:Date.now(),sessionActive:gameState!=='GAME_OVER',lastCompletedRound:roundEnded?currentRound:Math.max(0,currentRound-1),round:currentRound,score,kills,bestCombo,health:player.health,maxHealth:player.maxHealth,weaponLevel:player.weaponLevel,bonusDamage:player.bonusDamage,fireRate:player.fireRate,speed:player.speed,jumpCooldown:player.jumpCooldown,projectileSize:player.projectileSize,damageReduction:player.damageReduction,shieldHits:player.shieldHits,dashDistance:player.dashDistance,dashSpeed:player.dashSpeed,dashCooldown:player.dashCooldown,dashInvulnerability:player.dashInvulnerability,maxDashCharges:player.maxDashCharges,shockDash:player.shockDash,trailBurn:player.trailBurn,perks:{...player.perks},adaptivePressure,roundsWithoutDamage,records,runInfo,difficulty:selectedDifficulty,startRound:runInfo.startRound};
    try{const previous=localStorage.getItem(SAVE_KEY);if(previous){const parsed=JSON.parse(previous);if(parsed&&[2,3].includes(parsed.version))localStorage.setItem(BACKUP_KEY,previous);}localStorage.setItem(SAVE_KEY,JSON.stringify(data));}catch(e){console.warn('Guardado omitido',e);}
}
function validSave(d){return d&&[2,3].includes(d.version)&&Number.isFinite(Number(d.savedAt))&&Number.isFinite(Number(d.round))&&Number(d.round)>=1;}
function getSafeSave(){const primary=loadJSON(SAVE_KEY);if(validSave(primary))return primary;const backup=loadJSON(BACKUP_KEY);return validSave(backup)?backup:null;}
function markSessionActive(){try{const d=getSafeSave();if(d){d.sessionActive=true;localStorage.setItem(SAVE_KEY,JSON.stringify(d));}}catch{}}
function checkRecovery(){
    const d=getSafeSave(),active=!!(d&&d.sessionActive);
    document.getElementById('btn-continue').classList.toggle('hidden',!active);
    // Con una partida a medias el botón principal la descarta y empieza de cero, así que
    // llamarlo "Jugar" engaña: sólo es "Jugar" cuando no hay nada que perder.
    document.getElementById('btn-start').textContent=t(active?'menu.retry':'menu.play');
    return active;
}
function recoverGame(){
    const d=getSafeSave();if(!d){uiRecoveryScreen.classList.add('hidden');uiStartScreen.classList.remove('hidden');return;}ensureAudio();
    const recoverRound=Math.max(1,finite(d.lastCompletedRound,0,0)+1),recoverSize=arenaSizeForRound(recoverRound);arena.width=recoverSize.width;arena.height=recoverSize.height;applyArenaTheme(recoverRound);lastAnnouncedZone=null;
    player=new Player(arena.width/2,arena.height/2);player.maxHealth=finite(d.maxHealth,100,20,10000);player.health=finite(d.health,player.maxHealth,1,player.maxHealth);player.weaponLevel=finite(d.weaponLevel,1,1,100);player.bonusDamage=finite(d.bonusDamage,0,0,10000);player.fireRate=finite(d.fireRate,300,65,1000);player.speed=finite(d.speed,4,1,15);player.jumpCooldown=finite(d.jumpCooldown,5000,600,10000);player.projectileSize=finite(d.projectileSize,5,2,30);player.damageReduction=finite(d.damageReduction,0,0,.5);player.shieldHits=finite(d.shieldHits,0,0,10);player.dashDistance=finite(d.dashDistance,140,120,280);player.dashSpeed=finite(d.dashSpeed,1,.8,1.7);player.dashCooldown=finite(d.dashCooldown,4000,800,5000);player.dashInvulnerability=finite(d.dashInvulnerability,140,100,450);player.maxDashCharges=finite(d.maxDashCharges,1,1,2);player.dashCharges=player.maxDashCharges;player.dashAvailable=true;player.shockDash=!!d.shockDash;player.trailBurn=!!d.trailBurn;
    for(const key of Object.keys(player.perks))player.perks[key]=finite(d.perks?.[key],0,0,PERK_MAX);
    setSelectedDifficulty(finite(d.difficulty,d.runInfo?.difficulty||100,1,500));runInfo=d.runInfo&&typeof d.runInfo==='object'?d.runInfo:{startRound:finite(d.startRound,1,1),difficulty:selectedDifficulty,advanced:finite(d.startRound,1,1)>1,startedAt:Date.now()};score=finite(d.score,0,0);kills=finite(d.kills,0,0);bestCombo=finite(d.bestCombo,0,0);adaptivePressure=finite(d.adaptivePressure,0,0,1);roundsWithoutDamage=finite(d.roundsWithoutDamage,0,0,20);combo=0;resetEntities();currentRound=Math.max(1,finite(d.lastCompletedRound,0,0)+1);
    uiRecoveryScreen.classList.add('hidden');uiStartScreen.classList.add('hidden');uiHUD.classList.remove('hidden');startCountdown(()=>{configureRound(currentRound);gameState='PLAYING';lastTime=performance.now();saveProgress('recovered');startMusic();});
}
function deathCauseText(){
    const source=lastDamageSource;
    if(source?.kind==='enemy'&&source.label)return t('gameOver.killedBy',{name:source.label});
    if(source?.kind==='hazard'){const name=t(`death.hazard.${source.id}`);return t('gameOver.killedBy',{name:typeof name==='string'&&!name.startsWith('death.')?name:t('death.hazardGeneric')});}
    if(source?.kind==='enemy')return t('gameOver.killedBy',{name:t('death.enemyFire')});
    return t('gameOver.killedByUnknown');
}
function gameOver(){
    Input.reset();stopMusic();if(player?.isDashing)player.finishDash(false);gameState='GAME_OVER';
    // El récord se lee antes de actualizarlo: si no, la partida siempre parecería empatar consigo misma.
    const previousBest=records.highScore,finalScore=Math.floor(score);
    updateRecords(true);saveProgress('game-over');
    const d=getSafeSave();if(d){d.sessionActive=false;localStorage.setItem(SAVE_KEY,JSON.stringify(d));}
    uiHUD.classList.add('hidden');uiGameOverScreen.classList.remove('hidden');
    const earned=awardScrap(scrapForRun(score,Math.max(0,currentRound-(runInfo?.startRound||1))));
    document.getElementById('death-cause').textContent=deathCauseText();
    document.getElementById('death-score').textContent=finalScore.toLocaleString();
    const chase=document.getElementById('death-chase'),gap=previousBest-finalScore;
    const beatenRecord=finalScore>previousBest&&!runInfo?.advanced;
    chase.textContent=beatenRecord?t('gameOver.newBest'):gap>0?t('gameOver.chase',{points:gap.toLocaleString()}):t('gameOver.tied');
    chase.classList.toggle('is-best',beatenRecord);
    const rows=[[t('gameOver.roundLabel'),currentRound],[t('gameOver.killsLabel'),kills],[t('gameOver.comboLabel'),`×${(1+Math.min(bestCombo,COMBO_CAP)*COMBO_STEP).toFixed(1)}`],[t('gameOver.scrapLabel'),`+${earned}`]];
    document.getElementById('death-stats').innerHTML=rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
}

function showNotification(text){const el=document.getElementById('notifications');el.textContent=text;el.style.opacity=1;setTimeout(()=>el.style.opacity=0,1800);}
let pickupToastTimer=null;
function showPickup(food){const el=document.getElementById('pickup-toast'),type=Object.keys(FOODS).find(key=>FOODS[key]===food),copy=foodText(type);el.textContent=`${food.icon}  ${copy[0]} · ${copy[1]}`;el.classList.remove('hidden');if(pickupToastTimer)clearTimeout(pickupToastTimer);pickupToastTimer=setTimeout(()=>el.classList.add('hidden'),2200);}
window.addEventListener('notification',e=>{const d=e.detail;showNotification(typeof d==='string'?d:t(d.key,d.vars||{}));});
window.addEventListener('beforeunload',()=>saveProgress('unexpected-close'));
// En un portal el juego vive en un iframe: al cambiar de pestaña seguía corriendo y sonando.
// Se pausa y se calla, y al volver no se reanuda solo para no devolver al jugador a un golpe.
function handleWindowHidden(){
    if(gameState==='PLAYING'){saveProgress('background');pauseGame({silent:true});}
    else stopMusic();
}
function handleWindowVisible(){
    if(gameState==='UPGRADING'||gameState==='COUNTDOWN')startMusic();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)handleWindowHidden();else handleWindowVisible();});
window.addEventListener('blur',handleWindowHidden);
window.addEventListener('focus',handleWindowVisible);

function renderBestiary(){
    const status=document.getElementById('bestiary-status').value,category=document.getElementById('bestiary-category').value,grid=document.getElementById('bestiary-grid');let entries=Object.values(ENEMY_CATALOG);
    if(category&&category!=='all')entries=entries.filter(e=>e.category===category);if(status==='discovered')entries=entries.filter(e=>bestiaryRecord(e.id).discovered);if(status==='undiscovered')entries=entries.filter(e=>!bestiaryRecord(e.id).discovered);if(status==='defeated')entries.sort((a,b)=>bestiaryRecord(b.id).total-bestiaryRecord(a.id).total);
    grid.innerHTML=entries.map(entry=>{const stat=bestiaryRecord(entry.id),known=stat.discovered,killed=stat.killed,eliteTraits=entry.id==='elite'&&stat.eliteAbilities?.length?`<p><strong>${t('bestiary.variants')}:</strong> ${stat.eliteAbilities.join(', ')}</p>`:'';return`<article class="bestiary-entry ${known?'':'locked'}"><div class="enemy-mark" style="background:${known?entry.color:'#111827'}"></div><h3>${known?entry.name:'— — —'}</h3><div class="entry-meta"><span>${t(`categories.${entry.category}`)}</span><span>${t('bestiary.firstSeen')}: ${known?(stat.firstEncounterRound||entry.firstRound):'—'}</span></div>${!known?`<p>${t('bestiary.locked')}</p>`:!killed?`<p>${t('bestiary.killLocked')}</p>`:`<p><strong>${t('bestiary.behavior')}:</strong> ${enemyText(entry,'attack')}</p><p><strong>${t('bestiary.ability')}:</strong> ${enemyText(entry,'ability')}</p><p>${enemyText(entry,'weakness')}</p>${eliteTraits}`}<div class="entry-meta"><span>${t('bestiary.defeated')}: ${stat.total}</span><span>${t('bestiary.maxDifficulty')}: ${stat.maxDifficulty||0}%</span>${stat.bestTime?`<span>${stat.bestTime.toFixed(1)}s</span>`:''}</div></article>`;}).join('');
}
function setupBestiaryFilters(){const select=document.getElementById('bestiary-category'),categories=['all',...new Set(Object.values(ENEMY_CATALOG).map(e=>e.category))];select.innerHTML=categories.map(c=>`<option value="${c}">${t(`categories.${c}`)}</option>`).join('');}
function openBestiary(){uiStartScreen.classList.add('hidden');uiBestiaryScreen.classList.remove('hidden');setupBestiaryFilters();renderBestiary();}
function closeBestiary(){uiBestiaryScreen.classList.add('hidden');uiStartScreen.classList.remove('hidden');}
// Tutorial de la primera ronda: cada paso espera a que el jugador use el control o a que expire.
const TUTORIAL_STEPS=[
    {key:'move',duration:4500,done:()=>Input.keys.w||Input.keys.a||Input.keys.s||Input.keys.d},
    {key:'jump',duration:7000,done:()=>player&&player.lastJumpTime>0},
    {key:'dash',duration:7000,done:()=>player&&(player.dashCharges<player.maxDashCharges||player.isDashing)}
];
let tutorialStep=0,tutorialTimer=0,tutorialActive=false;
function startTutorial(){tutorialActive=currentRound===1&&!gameMeta.tutorialDone;tutorialStep=0;tutorialTimer=0;}
function updateTutorial(dt){
    const el=document.getElementById('tutorial-hint');if(!el)return;
    if(!tutorialActive||gameState!=='PLAYING'||tutorialStep>=TUTORIAL_STEPS.length){el.classList.add('hidden');return;}
    const step=TUTORIAL_STEPS[tutorialStep];
    tutorialTimer+=dt;
    el.textContent=t(`tutorial.${step.key}`);el.classList.remove('hidden');
    if(step.done()||tutorialTimer>=step.duration){
        tutorialStep++;tutorialTimer=0;
        if(tutorialStep>=TUTORIAL_STEPS.length){tutorialActive=false;gameMeta.tutorialDone=true;saveMeta();el.classList.add('hidden');}
    }
}
function runScrapSoFar(){return scrapForRun(score,Math.max(0,currentRound-(runInfo?.startRound||1)));}
function refreshMenuStats(){
    document.getElementById('high-score-display').textContent=t('records.bestValue',{score:records.highScore,round:records.highRound});
    document.getElementById('scrap-display').textContent=gameMeta.scrap;
}

let workshopSlot='box';
const workshopSelection={};
function openWorkshop(){
    uiStartScreen.classList.add('hidden');uiWorkshopScreen.classList.remove('hidden');
    for(const slot of COSMETIC_SLOTS)workshopSelection[slot]=gameMeta.equipped[slot];
    renderWorkshop();
}
function closeWorkshop(){uiWorkshopScreen.classList.add('hidden');uiStartScreen.classList.remove('hidden');refreshMenuStats();}
function renderWorkshop(){
    document.getElementById('workshop-scrap').textContent=t('workshop.scrap',{amount:gameMeta.scrap});
    for(const tab of document.querySelectorAll('.workshop-tab'))tab.classList.toggle('active',tab.dataset.slot===workshopSlot);
    const grid=document.getElementById('workshop-grid');
    grid.innerHTML=COSMETICS[workshopSlot].map(item=>{
        const owned=cosmeticOwned(workshopSlot,item.id),equipped=gameMeta.equipped[workshopSlot]===item.id;
        const action=equipped?t('workshop.equipped'):owned?t('workshop.equip'):gameMeta.scrap>=item.price?t('workshop.buy',{price:item.price}):t('workshop.locked',{price:item.price});
        const state=equipped?'equipped':owned?'owned':gameMeta.scrap>=item.price?'affordable':'locked';
        return `<button class="cosmetic-card ${state} ${workshopSelection[workshopSlot]===item.id?'selected':''}" data-id="${item.id}">
            <span class="cosmetic-swatch" style="background:${item.color};box-shadow:0 0 14px ${item.color}"></span>
            <span class="cosmetic-name">${t(`cosmetics.${workshopSlot}.${item.id}`)}</span>
            <span class="cosmetic-action">${action}</span>
        </button>`;
    }).join('');
    for(const card of grid.querySelectorAll('.cosmetic-card'))card.onclick=()=>handleWorkshopClick(card.dataset.id);
    drawWorkshopPreview();
}
function handleWorkshopClick(id){
    workshopSelection[workshopSlot]=id;
    if(cosmeticOwned(workshopSlot,id))equipCosmetic(workshopSlot,id);
    else if(buyCosmetic(workshopSlot,id))equipCosmetic(workshopSlot,id);
    renderWorkshop();
}
function drawWorkshopPreview(){
    const canvas=document.getElementById('workshop-canvas'),c=canvas?.getContext?.('2d');if(!c)return;
    const box=cosmeticItem('box',workshopSelection.box),gun=cosmeticItem('gun',workshopSelection.gun),bullet=cosmeticItem('bullet',workshopSelection.bullet);
    c.clearRect(0,0,canvas.width,canvas.height);
    const cx=76,cy=canvas.height/2,size=54;
    c.save();c.translate(cx,cy);
    c.fillStyle=box.color;c.shadowBlur=18;c.shadowColor=box.color;c.fillRect(-size/2,-size/2,size,size);c.shadowBlur=0;
    c.fillStyle='#0f172a';c.fillRect(size/4,-size/4,6,6);c.fillRect(size/4,size/4-6,6,6);
    c.beginPath();c.arc(size/4+2,0,12,Math.PI/4,-Math.PI/4,true);c.strokeStyle='#0f172a';c.lineWidth=3;c.stroke();
    const gl=gun.length*1.5,gw=gun.width*1.5;c.fillStyle=gun.color;
    if(gun.barrels>1){c.fillRect(size/2,-gw-3,gl,gw);c.fillRect(size/2,3,gl,gw);}
    else c.fillRect(size/2,-gw/2,gl,gw);
    c.restore();
    c.save();c.fillStyle=bullet.color;c.shadowBlur=12;c.shadowColor=bullet.color;
    for(let i=0;i<3;i++){
        const bx=cx+size/2+gun.length*1.5+22+i*30,by=cy,r=8;
        c.beginPath();
        if(bullet.shape==='square')c.rect(bx-r,by-r,r*2,r*2);
        else if(bullet.shape==='diamond'){c.moveTo(bx,by-r*1.3);c.lineTo(bx+r,by);c.lineTo(bx,by+r*1.3);c.lineTo(bx-r,by);c.closePath();}
        else c.arc(bx,by,r,0,Math.PI*2);
        c.fill();
    }
    c.restore();
}
// Sustituye el desplegable nativo por uno propio del juego. El <select> original queda oculto y
// sigue siendo la fuente de estado, así que setupRunSelectors, .value y los eventos change no cambian.
function closeAllSelects(except){for(const el of document.querySelectorAll('.vs.open'))if(el!==except)el.classList.remove('open');}
function enhanceSelect(select){
    // Mejora progresiva: si al entorno le falta algo, se queda el <select> nativo, que sigue funcionando.
    if(!select||!select.dataset||select.dataset.enhanced||!select.parentNode||typeof MutationObserver!=='function')return;
    select.dataset.enhanced='1';
    const wrap=document.createElement('div');wrap.className='vs';
    select.parentNode.insertBefore(wrap,select);wrap.appendChild(select);
    const value=document.createElement('button');value.type='button';value.className='vs-value';
    // La visibilidad de la lista depende solo de .vs.open; con dos fuentes de verdad, cerrar
    // desde fuera quitaba la clase open pero dejaba la lista en pantalla.
    const list=document.createElement('div');list.className='vs-list';
    wrap.appendChild(value);wrap.appendChild(list);
    const close=()=>wrap.classList.remove('open');
    const render=()=>{
        value.textContent=select.options[select.selectedIndex]?.textContent||'';
        list.innerHTML='';
        for(const option of select.options){
            const item=document.createElement('button');item.type='button';
            item.className=`vs-option${option.selected?' selected':''}${option.disabled?' disabled':''}`;
            item.textContent=option.textContent;
            item.addEventListener('click',event=>{
                event.stopPropagation();
                if(option.disabled)return;
                select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
                close();value.blur();
            });
            list.appendChild(item);
        }
    };
    value.addEventListener('click',event=>{
        event.stopPropagation();
        const open=wrap.classList.contains('open');
        closeAllSelects();
        if(!open)wrap.classList.add('open');
    });
    select.addEventListener('change',render);
    new MutationObserver(render).observe(select,{childList:true,subtree:true,attributes:true,characterData:true});
    render();
}
document.addEventListener('click',()=>closeAllSelects());
window.addEventListener('keydown',event=>{if(event.key==='Escape')closeAllSelects();});
// Reintentar sin tocar el ratón: en un portal cada paso extra tras morir pierde jugadores.
window.addEventListener('keydown',event=>{if(gameState==='GAME_OVER'&&(event.key==='Enter'||event.key===' ')){event.preventDefault();initGame();}});

function renderVolumeReadouts(){for(const key of['master','music','effects']){const el=document.getElementById(`opt-${key}-value`);if(el)el.textContent=`${Math.round(options[key]*100)}%`;}}
function syncOptionsUI(){document.getElementById('opt-master').value=options.master;document.getElementById('opt-music').value=options.music;document.getElementById('opt-effects').value=options.effects;renderVolumeReadouts();document.getElementById('opt-shake').checked=options.screenShake;document.getElementById('opt-damage-numbers').checked=options.damageNumbers;document.getElementById('opt-reduced-effects').checked=options.reducedEffects;}
function openOptions(from='menu'){optionsReturn=from;if(from==='pause')uiPauseScreen.classList.add('hidden');else uiStartScreen.classList.add('hidden');uiOptionsScreen.classList.remove('hidden');syncOptionsUI();}
function closeOptions(){uiOptionsScreen.classList.add('hidden');if(optionsReturn==='pause')uiPauseScreen.classList.remove('hidden');else uiStartScreen.classList.remove('hidden');}
// Los deslizadores se ajustan en menús donde puede no sonar nada; sin una muestra audible es
// imposible saber dónde queda el volumen.
let lastPreviewAt=0;
function previewVolume(kind){
    if(!ensureAudio())return;
    const now=performance.now();if(now-lastPreviewAt<170)return;lastPreviewAt=now;
    if(kind==='music'){
        if(musicTimer)return;                                   // la música ya se está oyendo
        const level=musicVolume()*.42;if(level<=0)return;
        try{
            const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),at=audioCtx.currentTime;
            osc.type='triangle';osc.frequency.setValueAtTime(MUSIC_ROOT*2,at);
            gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(level*1.8,at+.02);gain.gain.exponentialRampToValueAtTime(.0001,at+.36);
            osc.connect(gain);gain.connect(audioCtx.destination);osc.start(at);osc.stop(at+.4);
        }catch(e){console.warn('Audio skipped',e);}
        return;
    }
    playSound('hit');
}
function bindOption(id,key,event='input',preview=null){document.getElementById(id).addEventListener(event,e=>{options[key]=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);saveOptions();renderVolumeReadouts();if(preview)previewVolume(preview);});}
function setupRunSelectors(){
    unlockStartingRounds(records.highRound);const difficulty=document.getElementById('difficulty-select'),starting=document.getElementById('starting-round');difficulty.innerHTML=DIFFICULTY_VALUES.map(value=>`<option value="${value}">${value}% · ${t(value<100?'setup.easier':value===100?'setup.normal':'setup.harder')}</option>`).join('');difficulty.value=String(selectedDifficulty);starting.innerHTML=START_ROUNDS.map(round=>`<option value="${round}" ${round>gameMeta.unlockedStartRound?'disabled':''}>${t('setup.round',{round})}</option>`).join('');if(selectedStartRound>gameMeta.unlockedStartRound)setSelectedStartRound(1);starting.value=String(selectedStartRound);renderRunSetup();
}
function renderRunSetup(){document.getElementById('difficulty-description').textContent=t(difficultyDescriptionKey());// Sólo los valores derivados: la ronda y la dificultad ya se leen en sus propios selectores.
document.getElementById('start-summary').innerHTML=`<span>${t('setup.loadout')}</span><strong>${selectedStartRound>1?t('setup.generated'):t('setup.standard')}</strong><span>${t('setup.eligibility')}</span><strong>${selectedStartRound>1?t('setup.advanced'):t('setup.standard')}</strong>`;}

soundEnabled=records.soundEnabled;refreshMenuStats();
document.getElementById('btn-start').addEventListener('click',initGame);document.getElementById('btn-continue').addEventListener('click',recoverGame);document.getElementById('btn-restart').addEventListener('click',initGame);
document.getElementById('btn-gameover-menu').addEventListener('click',()=>{gameState='START';uiGameOverScreen.classList.add('hidden');uiHUD.classList.add('hidden');uiStartScreen.classList.remove('hidden');setupRunSelectors();refreshMenuStats();checkRecovery();});document.getElementById('btn-recover').addEventListener('click',recoverGame);document.getElementById('btn-newgame').addEventListener('click',initGame);
document.getElementById('difficulty-select').addEventListener('change',e=>{setSelectedDifficulty(Number(e.target.value));renderRunSetup();});document.getElementById('starting-round').addEventListener('change',e=>{setSelectedStartRound(Number(e.target.value));renderRunSetup();});
document.getElementById('btn-loadout-start').addEventListener('click',startPreparedLoadout);document.getElementById('btn-loadout-reroll').addEventListener('click',rerollAdvancedLoadout);document.getElementById('btn-loadout-back').addEventListener('click',()=>{gameState='START';document.getElementById('loadout-screen').classList.add('hidden');uiStartScreen.classList.remove('hidden');preparedLoadout=null;});
document.getElementById('btn-workshop').addEventListener('click',openWorkshop);document.getElementById('btn-workshop-back').addEventListener('click',closeWorkshop);
for(const tab of document.querySelectorAll('.workshop-tab'))tab.addEventListener('click',()=>{workshopSlot=tab.dataset.slot;renderWorkshop();});
document.getElementById('btn-bestiary').addEventListener('click',openBestiary);document.getElementById('btn-bestiary-back').addEventListener('click',closeBestiary);document.getElementById('bestiary-status').addEventListener('change',renderBestiary);document.getElementById('bestiary-category').addEventListener('change',renderBestiary);
document.getElementById('btn-options').addEventListener('click',()=>openOptions('menu'));document.getElementById('btn-pause-options').addEventListener('click',()=>openOptions('pause'));document.getElementById('btn-options-back').addEventListener('click',closeOptions);
bindOption('opt-master','master','input','effects');bindOption('opt-music','music','input','music');bindOption('opt-effects','effects','input','effects');bindOption('opt-shake','screenShake','change');bindOption('opt-damage-numbers','damageNumbers','change');bindOption('opt-reduced-effects','reducedEffects','change');
document.getElementById('btn-fullscreen').addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();});
for(const id of['language-main','language-pause','language-options'])document.getElementById(id).addEventListener('change',e=>setLanguage(e.target.value));
window.addEventListener('language_changed',()=>{refreshMenuStats();setupRunSelectors();checkRecovery();if(preparedLoadout)renderLoadoutSummary();if(!uiBestiaryScreen.classList.contains('hidden')){setupBestiaryFilters();renderBestiary();}});
setLanguage(currentLanguage);setupRunSelectors();checkRecovery();
for(const id of['starting-round','difficulty-select','language-main','language-pause','language-options','bestiary-status','bestiary-category'])enhanceSelect(document.getElementById(id));
requestAnimationFrame(gameLoop);
