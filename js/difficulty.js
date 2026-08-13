const META_KEY = 'deadboxMetaV1';
if(!Storage.getItem(META_KEY)&&Storage.getItem('arenaMetaV1'))Storage.setItem(META_KEY,Storage.getItem('arenaMetaV1'));
const DIFFICULTY_VALUES = [1,25,50,75,100,125,150,175,200,225,250,275,300,325,350,375,400,425,450,475,500];
const START_ROUNDS = [1,10,20,30,40,50];
const COMPLEXITY_COST = Object.freeze({
    normal:1,mini:1,fast:2,explosive:2,duplicateMini:1,splitterMini:1,parasite:1,
    runner:3,jumper:3,shooter:3,parent:3,shield:3,bomb:3,berserker:3,mirrorling:3,drifter:3,
    healer:4,magnetic:4,summoner:4,chain:4,freezer:4,duplicator:4,builder:4,turret:4,ghost:4,burrower:4,leech:4,beacon:4,splitter:4,anchor:4,wallCrawler:4,phaseWalker:4,rammer:4,husk:4,
    sniper:5,poison:5,warden:5,sporeCarrier:5,shambler:5,screecher:5,parasiteHost:5,mortar:5,suppressor:5,reanimator:5,swapper:5,harvester:5,sentinel:5,stalker:5,relay:5,blight:5,collector:5,gatekeeper:6,timekeeper:6,undertaker:6,powerThief:6,
    tank:4,camouflage:4,mirror:4,miniboss:12,boss:18
});

function readMeta(){try{const parsed=JSON.parse(Storage.getItem(META_KEY)||'null');return parsed&&typeof parsed==='object'?parsed:{};}catch{return{};}}
let gameMeta=readMeta();
gameMeta.selectedDifficulty=DIFFICULTY_VALUES.includes(Number(gameMeta.selectedDifficulty))?Number(gameMeta.selectedDifficulty):100;
gameMeta.selectedStartRound=START_ROUNDS.includes(Number(gameMeta.selectedStartRound))?Number(gameMeta.selectedStartRound):1;
gameMeta.unlockedStartRound=Math.max(1,Number(gameMeta.unlockedStartRound)||1);
gameMeta.recentBosses=Array.isArray(gameMeta.recentBosses)?gameMeta.recentBosses.slice(-5):[];
gameMeta.recentMinibosses=Array.isArray(gameMeta.recentMinibosses)?gameMeta.recentMinibosses.slice(-5):[];
gameMeta.recordsByMode=gameMeta.recordsByMode&&typeof gameMeta.recordsByMode==='object'?gameMeta.recordsByMode:{};
normalizeCosmetics(gameMeta);
function saveMeta(){try{Storage.setItem(META_KEY,JSON.stringify(gameMeta));}catch{}}

let selectedDifficulty=gameMeta.selectedDifficulty;
let selectedStartRound=Math.min(gameMeta.selectedStartRound,gameMeta.unlockedStartRound);
let difficultyProfile=null;
function lerp(a,b,t){return a+(b-a)*Math.max(0,Math.min(1,t));}
function makeDifficultyProfile(value){
    const below=value<=100,t=below?(value-1)/99:(value-100)/400;
    return Object.freeze({value,multiplier:value/100,
        health:below?lerp(.42,1,t):lerp(1,2.15,t),damage:below?lerp(.22,1,t):lerp(1,2.45,t),speed:below?lerp(.62,1,t):lerp(1,1.38,t),
        abilityRate:below?lerp(.34,1,t):lerp(1,1.7,t),projectileSpeed:below?lerp(.7,1,t):lerp(1,1.38,t),telegraph:below?lerp(1.8,1,t):lerp(1,.7,t),
        eliteFactor:below?lerp(.15,1,t):lerp(1,2.15,t),foodFactor:below?lerp(2.2,1,t):lerp(1,.5,t),coordination:below?lerp(.15,1,t):lerp(1,1.8,t),
        invulnerability:below?lerp(1.8,1,t):lerp(1,.7,t),quantity:below?lerp(.62,1,t):lerp(1,1.12,t),bossTier:value<76?1:value<125?2:value<275?3:4});
}
function refreshDifficultyProfile(){difficultyProfile=makeDifficultyProfile(selectedDifficulty);return difficultyProfile;}
refreshDifficultyProfile();
function setSelectedDifficulty(value){selectedDifficulty=DIFFICULTY_VALUES.includes(Number(value))?Number(value):100;gameMeta.selectedDifficulty=selectedDifficulty;refreshDifficultyProfile();saveMeta();}
function setSelectedStartRound(value){const wanted=START_ROUNDS.includes(Number(value))?Number(value):1;selectedStartRound=Math.min(wanted,gameMeta.unlockedStartRound);gameMeta.selectedStartRound=selectedStartRound;saveMeta();}
function difficultyDescriptionKey(){return selectedDifficulty<100?'setup.descriptionLow':selectedDifficulty===100?'setup.descriptionStandard':selectedDifficulty<375?'setup.descriptionHigh':'setup.descriptionExtreme';}
function getEncounterLimits(round){
    // Los límites se quedaban fijos desde la ronda 16, así que la presión dejaba de crecer.
    const stage=round<6?0:round<11?1:round<16?2:round<26?3:round<36?4:5,ease=selectedDifficulty<100?lerp(.68,1,(selectedDifficulty-1)/99):1;
    return{activeEnemies:Math.round([18,22,26,32,38,44][stage]*ease)+(selectedDifficulty>=375?2:0),enemyProjectiles:Math.round([22,28,34,42,48,54][stage]*(difficultyProfile.value<100 ? .8 : difficultyProfile.value>=375 ? 1.12 : 1)),hazards:Math.max(2,Math.round([3,4,5,7,8,9][stage]*ease)),supports:stage<2?1:2,complexity:Math.round([24,34,46,62,74,86][stage]*ease)+Math.round(Math.min(12,Math.max(0,selectedDifficulty-100)/35))};
}
function complexityOf(type,elite=false){return(COMPLEXITY_COST[type]||3)+(elite?2:0);}

let runBossMap={},runMinibossMap={};
function resetEncounterRotation(){runBossMap={};runMinibossMap={};}
function chooseEncounter(rotation,recent,key,round){
    if(key[round])return key[round];const blocked=new Set(recent.slice(-2)),available=rotation.filter(id=>!blocked.has(id)),pool=available.length?available:rotation;
    const id=pool[Math.floor(Math.random()*pool.length)];key[round]=id;recent.push(id);if(recent.length>5)recent.shift();saveMeta();return id;
}
function chooseBossForEncounter(round){return chooseEncounter(BOSS_ROTATION,gameMeta.recentBosses,runBossMap,round);}
function chooseMinibossForEncounter(round){return chooseEncounter(MINIBOSS_ROTATION,gameMeta.recentMinibosses,runMinibossMap,round);}
function unlockStartingRounds(reachedRound){const unlocked=START_ROUNDS.filter(r=>r<=reachedRound).at(-1)||1;if(unlocked>gameMeta.unlockedStartRound){gameMeta.unlockedStartRound=unlocked;saveMeta();}return gameMeta.unlockedStartRound;}
