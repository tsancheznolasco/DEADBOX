const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');

class Target {
  constructor(){ this.listeners = {}; }
  addEventListener(type, fn){ (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event){ for (const fn of this.listeners[event.type] || []) fn(event); }
}
// El style real del DOM expone setProperty/getPropertyValue además de las propiedades directas.
function makeFakeStyle(){
  const props={};
  return { setProperty(name,value){ props[name]=String(value); }, getPropertyValue(name){ return props[name]??''; }, removeProperty(name){ delete props[name]; } };
}
class FakeElement extends Target {
  constructor(id=''){ super(); this.id=id; this.style=makeFakeStyle(); this.dataset={}; this.children=[]; this.textContent=''; this.innerText=''; this._innerHTML=''; this.classList={add(){},remove(){},toggle(){},contains(){return false;}}; }
  appendChild(child){ this.children.push(child); }
  set innerHTML(value){ this._innerHTML=value; this.children=[]; }
  get innerHTML(){ return this._innerHTML; }
}

const elements = new Map();
const context = new Proxy({}, { get(target, prop){
  if (prop === 'createRadialGradient') return () => ({addColorStop(){}});
  if (prop === 'measureText') return () => ({width:10});
  if (!(prop in target)) target[prop] = () => {};
  return target[prop];
}, set(target, prop, value){ target[prop]=value; return true; }});
const canvas = new FakeElement('gameCanvas');
canvas.width=1280; canvas.height=720; canvas.getContext=()=>context;
elements.set('gameCanvas', canvas);

global.Event = class { constructor(type){this.type=type;} };
global.CustomEvent = class extends Event { constructor(type, options={}){super(type);this.detail=options.detail;} };
global.window = new Target();
window.innerWidth=1280; window.innerHeight=720; window.__audioVoices=0;
// AudioContext mínimo pero con la forma real: nodos, rampas y destino conectables.
const fakeAudioParam=()=>({value:0,setValueAtTime(){return this;},linearRampToValueAtTime(){return this;},exponentialRampToValueAtTime(){return this;},setTargetAtTime(){return this;}});
const fakeAudioNode=()=>({gain:fakeAudioParam(),frequency:fakeAudioParam(),delayTime:fakeAudioParam(),type:'sine',buffer:null,connect(){},disconnect(){},start(){},stop(){}});
window.AudioContext=class{
  constructor(){ this.currentTime=0; this.sampleRate=44100; this.destination=fakeAudioNode(); }
  createGain(){ return fakeAudioNode(); }
  createOscillator(){ window.__audioVoices++; return fakeAudioNode(); }
  createBiquadFilter(){ return fakeAudioNode(); }
  createBufferSource(){ window.__audioVoices++; return fakeAudioNode(); }
  createDelay(){ return fakeAudioNode(); }
  createBuffer(channels,length){ const data=new Float32Array(length); return { length, getChannelData(){ return data; } }; }
  resume(){}
};
window.webkitAudioContext=window.AudioContext;
global.document = new Target();
document.body = new FakeElement('body');
document.documentElement = new FakeElement('html');
document.hidden = false;
document.getElementById = id => { if (!elements.has(id)) elements.set(id,new FakeElement(id)); return elements.get(id); };
document.createElement = () => new FakeElement();
document.querySelectorAll = () => [];
document.exitFullscreen = () => Promise.resolve();
global.localStorage = {data:new Map(),getItem(k){return this.data.has(k)?this.data.get(k):null;},setItem(k,v){this.data.set(k,String(v));},removeItem(k){this.data.delete(k);}};
global.requestAnimationFrame = () => 1;

for (const file of ['cosmetics.js','pool.js','particle.js','projectile.js','input.js','i18n.js','content.js','difficulty.js','zombie.js','player.js','spawner.js','main.js']) {
  vm.runInThisContext(fs.readFileSync(`${root}/js/${file}`,'utf8'), {filename:file});
}

vm.runInThisContext(`
  initGame();
  soundEnabled=false;
  if(selectedDifficulty!==100||selectedStartRound!==1)throw new Error('Valores iniciales incorrectos');
  const easy=makeDifficultyProfile(1),extreme=makeDifficultyProfile(500);if(easy.abilityRate>=1||extreme.health>2.5||extreme.speed>1.5||extreme.damage>3)throw new Error('Curvas de dificultad fuera de rango');
  for (let i=0;i<180;i++) update(16, performance.now()+i*16);
  if (!player || !Number.isFinite(player.health)) throw new Error('Jugador inválido');
  if (getCyclicDuration(1)!==22 || getCyclicDuration(5)!==42 || getCyclicDuration(6)!==22) throw new Error('Ciclo de duración inválido');
  configureRound(22);
  for (let i=0;i<180;i++) update(16, performance.now()+i*16);
  if (!Array.isArray(roundModifiers) || !roundModifiers.length) throw new Error('Modificadores inválidos');
  configureRound(31);
  for (let i=0;i<240;i++) update(16, performance.now()+i*16);
  if (getActiveEnemyCount()>ENTITY_LIMITS.zombies) throw new Error('Límite de enemigos excedido');
  const seen=new Set();for(let round=1;round<=15;round++){Spawner.configureRoster(round);Spawner.roundRoster.forEach(type=>seen.add(type));}if(seen.size<16)throw new Error('Variedad temprana insuficiente: '+seen.size);
  setSelectedDifficulty(500);configureRound(30);for(let i=0;i<500;i++)update(16,performance.now()+i*16);const limits=getEncounterLimits(30),complexity=zombies.reduce((sum,z)=>sum+complexityOf(z.type,z.isElite),0);if(zombies.length>limits.activeEnemies||enemyProjectiles.length>limits.enemyProjectiles||obstacles.length>limits.hazards||complexity>limits.complexity+18)throw new Error('Presupuesto de complejidad excedido');setSelectedDifficulty(100);
  generateAdvancedLoadout(20);if(player.weaponLevel<9||player.health!==player.maxHealth||player.shieldHits!==0||Object.keys(player.buffs).length)throw new Error('Loadout avanzado inválido');
  const bounds={left:0,right:arena.width,top:0,bottom:arena.height};
  function testInput(mouseX=900,mouseY=500){return{keys:Input.keys,mouse:{x:mouseX,y:mouseY},consume:key=>Input.consume(key)}}
  function runDashFrame(dt=16,input=testInput()){player.update(dt,input,projectiles,bounds,performance.now())}
  function finishCurrentDash(dt=16,input=testInput()){let guard=0;while(player.isDashing&&guard++<80)runDashFrame(dt,input);if(guard>=80)throw new Error('Dash no termina')}
  function aimedDash(moveCode,mouseX,mouseY){resetEntities();Input.reset();player=new Player(500,500);gameState='PLAYING';if(moveCode)Input.handleKey(moveCode,true);Input.handleKey('ShiftLeft',true);const input=testInput(mouseX,mouseY);runDashFrame(16,input);finishCurrentDash(16,input);return{x:player.x-500,y:player.y-500}}
  let aimed=aimedDash('KeyA',900,500);if(aimed.x<139||Math.abs(aimed.y)>1)throw new Error('WASD izquierda alteró dash hacia cursor derecho');
  aimed=aimedDash('KeyW',500,900);if(aimed.y<139||Math.abs(aimed.x)>1)throw new Error('WASD arriba alteró dash hacia cursor abajo');
  aimed=aimedDash(null,800,800);if(Math.abs(aimed.x-98.995)>1||Math.abs(aimed.y-98.995)>1)throw new Error('Dash diagonal al cursor inválido');
  resetEntities();Input.reset();player=new Player(500,500);gameState='PLAYING';currentRound=1;roundEnded=false;roundTimeLeft=100;roundDuration=100;enemiesBudget=0;camera.x=0;camera.y=0;Input.mouse.x=900;Input.mouse.y=500;Input.handleKey('KeyA',true);Input.handleKey('ShiftLeft',true);update(16,performance.now());if(!player.isDashing||player.x<=510)throw new Error('El game loop no entrega el cursor actual al dash');
  resetEntities();Input.reset();player=new Player(500,500);Input.handleKey('ShiftLeft',true);const lockedInput=testInput(900,500),movedInput=testInput(500,100);runDashFrame(16,lockedInput);finishCurrentDash(16,movedInput);runDashFrame(0,movedInput);const expectedAim=Math.atan2(movedInput.mouse.y-player.y,movedInput.mouse.x-player.x);if(player.x<639||Math.abs(player.y-500)>1||Math.abs(player.aimAngle-expectedAim)>.02)throw new Error('Mover cursor curvó el dash o no actualizó el arma');
  resetEntities();Input.reset();player=new Player(500,500);Input.handleKey('ShiftLeft',true);runDashFrame(16,testInput(500.0004,500.0003));if(player.isDashing||player.dashCharges!==1||!player.dashAvailable)throw new Error('Cursor cercano consumió el dash');Input.handleKey('ShiftLeft',false);
  aimed=aimedDash(null,-400,-300);if(aimed.x>=0||aimed.y>=0||Math.abs(Math.hypot(aimed.x,aimed.y)-140)>1.2)throw new Error('Cursor fuera del canvas inválido');
  canvas.getBoundingClientRect=()=>({left:100,top:50,width:640,height:360});window.dispatchEvent({type:'mousemove',clientX:420,clientY:230});if(Math.abs(Input.mouse.x-640)>.01||Math.abs(Input.mouse.y-360)>.01)throw new Error('Escalado del canvas incorrecto');
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:1920,height:1080});window.dispatchEvent({type:'mousemove',clientX:960,clientY:540});if(Math.abs(Input.mouse.x-640)>.01||Math.abs(Input.mouse.y-360)>.01)throw new Error('Conversión fullscreen incorrecta');
  resetEntities();Input.reset();player=new Player(1000,700);gameState='PLAYING';currentRound=1;roundEnded=false;roundTimeLeft=100;roundDuration=100;enemiesBudget=0;camera.x=600;camera.y=400;Input.mouse.x=500;Input.mouse.y=300;Input.handleKey('KeyA',true);Input.handleKey('ShiftLeft',true);update(16,performance.now());if(!player.isDashing||player.dashDirection.x<.999||Math.abs(player.dashDirection.y)>.001)throw new Error('Transformación inversa de cámara incorrecta');Input.handleKey('KeyA',false);finishCurrentDash(16,testInput(1100,700));
  const heldX=player.x;player.dashRechargeTimer=0;player.dashCharges=0;runDashFrame(4000);runDashFrame();if(player.x!==heldX||player.isDashing)throw new Error('Mantener Shift repite el dash');Input.handleKey('ShiftLeft',false);
  resetEntities();Input.reset();player=new Player(500,500);Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();finishCurrentDash();const afterFirst=player.x;Input.handleKey('ShiftLeft',false);Input.handleKey('ShiftLeft',true);runDashFrame();if(player.x-afterFirst>5||player.isDashing||player.dashCharges!==0)throw new Error('Dash activado durante recarga');Input.handleKey('ShiftLeft',false);
  obstacles=[{type:'wall',x:590,y:500,radius:55,active:true,duration:5000,health:50}];Input.reset();player=new Player(500,500);Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();finishCurrentDash();if(playerCollidesAt(player.x,player.y)||player.x>=520||player.isDashing)throw new Error('Dash atravesó una pared');
  obstacles.push({type:'wall',x:530,y:560,radius:70,active:true,duration:5000,health:50});player.dashCharges=1;player.dashAvailable=true;Input.handleKey('ShiftLeft',false);Input.handleKey('KeyD',false);Input.handleKey('KeyS',true);Input.handleKey('ShiftLeft',true);runDashFrame(16,testInput(900,900));finishCurrentDash(16,testInput(900,900));if(playerCollidesAt(player.x,player.y))throw new Error('Dash quedó atrapado en esquina');
  obstacles=[{type:'hole',x:580,y:440,radius:34,active:true,duration:5000,health:50},{type:'crate',x:580,y:560,radius:34,active:true,duration:5000,health:50}];Input.reset();player=new Player(460,500);Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();finishCurrentDash();if(playerCollidesAt(player.x,player.y)||player.x<590)throw new Error('Dash entre obstáculos inválido');
  obstacles=[];Input.reset();player=new Player(500,500);player.isJumping=true;player.z=30;Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame(16,testInput(100,500));finishCurrentDash(16,testInput(100,500));if(player.x>=365||!player.isJumping)throw new Error('Dash aéreo no siguió el cursor');
  obstacles=[];Input.reset();player=new Player(500,500);Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();const pausedTime=player.dashTimeRemaining,pausedCooldown=player.dashRechargeTimer,pausedX=player.x;if(!player.isDashing)throw new Error('Dash terminó antes de poder pausarse');gameState='PAUSED';update(500,performance.now());if(player.x!==pausedX||player.dashTimeRemaining!==pausedTime||player.dashRechargeTimer!==pausedCooldown)throw new Error('Pausa no congela dash/recarga');gameState='PLAYING';finishCurrentDash();
  resetEntities();Input.reset();player=new Player(500,500);player.addPower('overdrive',8500);Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();finishCurrentDash();if(player.x<700||player.x>712)throw new Error('Overdrive no usa el dash base');
  resetEntities();Input.reset();player=new Player(500,500);player.dashDistance=200;player.dashSpeed=1.5;player.dashCooldown=2000;Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();const upgradedDuration=player.dashTimeRemaining+16;finishCurrentDash();if(Math.abs(player.x-700)>1.2||upgradedDuration>=160||player.getDashCooldown()!==2000)throw new Error('Mejoras de distancia/velocidad/recarga no usan el dash base');
  resetEntities();Input.reset();player=new Player(500,500);player.shockDash=true;player.trailBurn=true;const dashTarget=queueDirectSpawn('normal',590,500);Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();finishCurrentDash();if(!dashTrails.some(trail=>trail.damage>0)||!dashTarget||dashTarget.stunTimer<=0)throw new Error('Shock Dash o Trail Burn desconectado del dash base');
  player=new Player(500,500);player.maxDashCharges=2;player.dashCharges=2;Input.reset();Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();finishCurrentDash();if(player.dashCharges!==1)throw new Error('Double Dash no conserva segunda carga');Input.handleKey('ShiftLeft',false);Input.handleKey('ShiftLeft',true);runDashFrame();finishCurrentDash();if(player.dashCharges!==0)throw new Error('Double Dash no consume segunda carga');
  obstacles=[];Input.reset();player=new Player(500,500);player.takeDamage(10);const damageTimer=player.invulnerableTimer;Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame();if(player.invulnerableTimer>damageTimer)throw new Error('Dash acumula invulnerabilidad previa');finishCurrentDash();player.invulnerable=false;player.invulnerableTimer=0;const healthAfterDash=player.health;if(!player.takeDamage(5)||player.health>=healthAfterDash)throw new Error('Invulnerabilidad no termina después del dash');
  function distanceAtFps(dt){resetEntities();Input.reset();player=new Player(500,500);Input.handleKey('KeyD',true);Input.handleKey('ShiftLeft',true);runDashFrame(dt);finishCurrentDash(dt);return player.x-500}
  const highFpsDistance=distanceAtFps(8),lowFpsDistance=distanceAtFps(50);if(Math.abs(highFpsDistance-lowFpsDistance)>.8||Math.abs(highFpsDistance-140)>1.2)throw new Error('Dash depende de FPS');
  obstacles=[{type:'crate',x:590,y:500,radius:42,active:true,duration:5000,health:50}];player=new Player(500,500);movePlayerByAxes(150,70);if(playerCollidesAt(player.x,player.y)||player.y<=500)throw new Error('Movimiento alrededor de caja inválido');
  player.addPower('giant',80);ensurePlayerSafe(true);if(playerCollidesAt(player.x,player.y))throw new Error('Giant Mode quedó atrapado');player.updatePowers(100);if(playerCollidesAt(player.x,player.y))throw new Error('Fin de Giant Mode inseguro');
  player.addPower('ghost',100);const hp=player.health;if(player.takeDamage(25)!==false||player.health!==hp)throw new Error('Ghost no protege al jugador');player.updatePowers(150);if(player.hasPower('ghost'))throw new Error('Ghost no finaliza');
  player.powers={};if(!player.addPower('backfire',1000)||!player.addPower('ricochet',1000)||player.addPower('clone',1000))throw new Error('Límite de dos superpoderes inválido');
  player.powers={};player.storedPower=null;player.addPower('selfDestruct',0);if(player.storedPower!=='selfDestruct')throw new Error('Self-Destruct no se almacena');
  saveProgress('dash-test');const saved=JSON.parse(localStorage.getItem(SAVE_KEY));if(saved.version!==3||!Number.isFinite(saved.dashCooldown))throw new Error('Dash no persiste');
  resetEntities(); gameState='PLAYING'; player.maxHealth=100000; player.health=100000;
  const testTypes=['summoner','chain','poison','freezer','duplicator','duplicateMini','bomb','sniper','builder','camouflage','mirror','berserker','turret','powerThief','burrower','warden','leech','beacon','splitter','splitterMini','mimic','anchor','sporeCarrier','shambler','screecher','parasiteHost','parasite','wallCrawler','mortar','suppressor','reanimator','phaseWalker','mirrorling','swapper','husk','harvester','sentinel','stalker','relay','blight','rammer','drifter','collector','gatekeeper','timekeeper','undertaker'];
  testTypes.forEach((type,i)=>queueDirectSpawn(type,100+(i%10)*180,100+Math.floor(i/10)*250,i%5===0));
  for (let i=0;i<540;i++) update(16, performance.now()+i*16);
  if (zombies.some(z=>z.active&&(!Number.isFinite(z.x)||!Number.isFinite(z.health)))) throw new Error('Entidad avanzada inválida');
  resetEntities(); configureRound(35); const mini=queueDirectSpawn('miniboss',220,220); if(!mini.displayName||!mini.bestiaryId)throw new Error('Miniboss sin variante');const firstMini=mini.bestiaryId;
  resetEntities(); configureRound(45); const mini2=queueDirectSpawn('miniboss',220,220);if(mini2.bestiaryId===firstMini)throw new Error('Miniboss repetido consecutivamente');
  resetEntities(); configureRound(40); const boss=queueDirectSpawn('boss',300,300); if(!boss.displayName||boss.phase!==1)throw new Error('Boss sin variante');const firstBoss=boss.bestiaryId;
  resetEntities(); configureRound(50); const boss2=queueDirectSpawn('boss',300,300);if(boss2.bestiaryId===firstBoss)throw new Error('Boss repetido consecutivamente');
  // La ronda debe cerrarse al despejar la arena, pero sólo tras gastar el presupuesto de la ronda.
  resetEntities(); configureRound(1); gameState='PLAYING'; roundEnded=false; roundTimeLeft=10; enemiesBudget=3; enemiesQueued=3;
  update(16,performance.now()); if(!roundEnded)throw new Error('La ronda no terminó al despejar la arena');
  resetEntities(); configureRound(1); gameState='PLAYING'; roundEnded=false; roundTimeLeft=10; enemiesBudget=3; enemiesQueued=1;
  update(16,performance.now()); if(roundEnded)throw new Error('La ronda terminó antes de gastar el presupuesto');
  resetEntities(); configureRound(1); gameState='PLAYING'; roundEnded=false; roundTimeLeft=10; enemiesBudget=0; enemiesQueued=0;
  update(16,performance.now()); if(roundEnded)throw new Error('Una ronda sin presupuesto no debe contar como despejada');

  // Aspectos: catálogo coherente, compra/equipamiento correctos y sin efecto sobre el juego.
  for(const slot of COSMETIC_SLOTS){
    const list=COSMETICS[slot];
    if(new Set(list.map(i=>i.id)).size!==list.length)throw new Error('Ids de aspecto repetidos en '+slot);
    if(list[0].price!==0)throw new Error('El aspecto por defecto de '+slot+' debe ser gratuito');
    if(list.some(i=>!i.color))throw new Error('Aspecto sin color en '+slot);
    if(!cosmeticOwned(slot,list[0].id))throw new Error('El aspecto gratuito debe poseerse desde el inicio');
  }
  const paid=COSMETICS.box.find(i=>i.price>0);
  gameMeta.scrap=0;
  if(buyCosmetic('box',paid.id))throw new Error('Se compró un aspecto sin chatarra suficiente');
  gameMeta.scrap=paid.price;
  if(!buyCosmetic('box',paid.id))throw new Error('No se pudo comprar con chatarra suficiente');
  if(gameMeta.scrap!==0)throw new Error('La compra no descontó el precio');
  if(buyCosmetic('box',paid.id))throw new Error('Se compró dos veces el mismo aspecto');
  if(!equipCosmetic('box',paid.id)||gameMeta.equipped.box!==paid.id)throw new Error('No se equipó un aspecto poseído');
  if(equipCosmetic('box','__inexistente__'))throw new Error('Se equipó un aspecto inexistente');
  if(scrapForRun(1000,4)!==16)throw new Error('Recompensa de chatarra incorrecta');
  if(scrapForRun(0,0)!==0)throw new Error('Una partida vacía no debe dar chatarra');
  if(scrapForRun(2000,8)<=scrapForRun(1000,4))throw new Error('Una mejor partida debe dar más chatarra');
  if(scrapForRun(1500,6)>=COSMETICS.box.find(i=>i.price>0).price)throw new Error('Una sola partida no debería pagar un aspecto');
  if(awardScrap(25)!==25||gameMeta.scrap!==25)throw new Error('La chatarra no se acumuló');
  // Un guardado corrupto no debe dejar equipado algo no comprado.
  const repaired=normalizeCosmetics({scrap:-5,owned:{box:['gold']},equipped:{box:'void'}});
  if(repaired.scrap!==0)throw new Error('La chatarra negativa no se saneó');
  if(repaired.equipped.box!==COSMETICS.box[0].id)throw new Error('Quedó equipado un aspecto no poseído');
  if(!repaired.owned.box.includes('gold'))throw new Error('Se perdió un aspecto comprado');

  // Los efectos deben sonar y mantenerse fuera de la banda grave donde el bajo los enmascara.
  soundEnabled=true;
  for(const type of ['shoot','hit','earthquake']){
    lastSoundByType[type]=performance.now()-10000; window.__audioVoices=0; playSound(type);
    if(window.__audioVoices===0)throw new Error('playSound no emitió voz: '+type);
  }
  if(Object.values(SFX).some(s=>s.from<=150))throw new Error('Un efecto arranca dentro de la banda del bajo');
  if(Object.values(SFX).some(s=>s.level<=.1))throw new Error('Un efecto quedaría por debajo de la música');

  // Los deslizadores deben silenciar del todo en 0, llegar a full en 1 y bajar de forma perceptible.
  if(volumeCurve(0)!==0||volumeCurve(1)!==1)throw new Error('La curva de volumen no cubre el recorrido completo');
  for(let i=1;i<=20;i++)if(volumeCurve(i/20)<=volumeCurve((i-1)/20))throw new Error('La curva de volumen no es monótona');
  const halfDb=20*Math.log10(volumeCurve(.5));
  if(halfDb>-8)throw new Error('La mitad del deslizador apenas baja el volumen');
  if(halfDb<-16)throw new Error('La mitad del deslizador deja el volumen casi inaudible');
  // Cambiar la curva no debe bajarle el volumen a quien ya tenía ajustes guardados en lineal.
  const previousOptions=localStorage.getItem(OPTIONS_KEY);
  localStorage.setItem(OPTIONS_KEY,JSON.stringify({master:.3,music:.3,effects:.3}));
  const migrated=loadOptions();
  if(migrated.version!==OPTIONS_VERSION)throw new Error('Las opciones no se marcaron como migradas');
  for(const key of['master','music','effects'])if(Math.abs(volumeCurve(migrated[key])-.3)>.02)throw new Error('La migración no conserva el volumen anterior: '+key);
  localStorage.setItem(OPTIONS_KEY,JSON.stringify({master:.3,version:OPTIONS_VERSION}));
  if(Math.abs(loadOptions().master-.3)>1e-9)throw new Error('Una opción ya migrada se volvió a convertir');
  if(previousOptions===null)localStorage.removeItem(OPTIONS_KEY);else localStorage.setItem(OPTIONS_KEY,previousOptions);

  const savedMaster=options.master,savedMusic=options.music,savedEffects=options.effects;
  options.master=0;options.music=1;options.effects=1;
  if(musicVolume()!==0||effectsVolume()!==0)throw new Error('El volumen general no silencia');
  options.master=1;options.music=0;
  if(musicVolume()!==0)throw new Error('El volumen de música no silencia');
  if(effectsVolume()===0)throw new Error('Silenciar la música no debe silenciar los efectos');
  options.music=1;options.effects=0;
  if(effectsVolume()!==0)throw new Error('El volumen de efectos no silencia');
  if(musicVolume()===0)throw new Error('Silenciar los efectos no debe silenciar la música');
  options.master=savedMaster;options.music=savedMusic;options.effects=savedEffects;

  startMusic(); if(!musicTimer)throw new Error('La música no arrancó');
  window.__audioVoices=0; scheduleMusic(); if(window.__audioVoices===0)throw new Error('El secuenciador no generó voces');
  if(MUSIC_MELODY.filter(n=>n!=null).some(n=>![0,2,3,5,7,8,10,11].includes(((n%12)+12)%12)))throw new Error('Melodía fuera de la escala menor');
  if(Math.abs(musicDelay.delayTime.value-musicStepSeconds(MUSIC_ZONES.containment)*2)>1e-6)throw new Error('El eco no está sincronizado al tempo');
  stopMusic(); if(musicTimer)throw new Error('La música no se detuvo');
`);

console.log('Smoke test completado: dash dirigido por cursor, cámara/escala, colisiones, mejoras, FPS y sistemas de DEADBOX válidos.');
