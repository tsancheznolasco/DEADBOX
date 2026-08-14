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
document.querySelector = sel => { if (!elements.has(sel)) elements.set(sel,new FakeElement(sel)); return elements.get(sel); };
document.exitFullscreen = () => Promise.resolve();
global.localStorage = {data:new Map(),getItem(k){return this.data.has(k)?this.data.get(k):null;},setItem(k,v){this.data.set(k,String(v));},removeItem(k){this.data.delete(k);}};
global.requestAnimationFrame = () => 1;

for (const file of ['platform.js','cosmetics.js','pool.js','particle.js','projectile.js','input.js','i18n.js','content.js','difficulty.js','zombie.js','player.js','spawner.js','main.js']) {
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

  // Control táctil: el joystick mueve de forma analógica y sin él manda el teclado.
  resetEntities(); player=new Player(500,500); gameState='PLAYING';
  const moveWith=(move,keys={})=>{
    const start=player.x, startY=player.y;
    Input.move.x=move.x; Input.move.y=move.y;
    Object.assign(Input.keys,{w:false,a:false,s:false,d:false},keys);
    for(let i=0;i<10;i++)update(16,performance.now()+i*16);
    Input.move.x=0;Input.move.y=0;Object.assign(Input.keys,{w:false,a:false,s:false,d:false});
    return {dx:player.x-start, dy:player.y-startY};
  };
  const stickRight=moveWith({x:1,y:0});
  if(stickRight.dx<=0||Math.abs(stickRight.dy)>1)throw new Error('El joystick no mueve en su dirección');
  const stickHalf=moveWith({x:.4,y:0});
  if(stickHalf.dx>=stickRight.dx)throw new Error('El joystick debería ser analógico, no todo o nada');
  const keyLeft=moveWith({x:0,y:0},{a:true});
  if(keyLeft.dx>=0)throw new Error('El teclado dejó de mover cuando no hay joystick');
  // El joystick derecho apunta: la mira debe seguir su dirección, no al enemigo más cercano.
  resetEntities(); player.x=500; player.y=500; player.aimAngle=0;
  queueDirectSpawn('normal',500,320);            // un enemigo cerca que ya no debe atraer la mira
  Input.aim.x=0; Input.aim.y=1;                  // apuntando hacia abajo
  const aimDown=touchAimPoint();
  if(aimDown.y<=player.y||Math.abs(aimDown.x-player.x)>1)throw new Error('La mira no sigue al joystick de apuntado');
  Input.aim.x=-1; Input.aim.y=0;
  const aimLeft=touchAimPoint();
  if(aimLeft.x>=player.x)throw new Error('La mira no sigue al joystick hacia la izquierda');
  // Soltar el pulgar mantiene la última dirección en vez de reiniciar el disparo.
  Input.aim.x=0; Input.aim.y=0; player.aimAngle=Math.PI;
  const aimIdle=touchAimPoint();
  if(aimIdle.x>=player.x)throw new Error('Sin joystick debería conservarse la última dirección');
  // Un joystick en el centro no debe producir una dirección inventada.
  Input.aim.x=0; Input.aim.y=0; player.aimAngle=0;
  if(touchAimPoint().x<=player.x)throw new Error('El centro del joystick no debe girar la mira');
  resetEntities();
  const fallback=touchAimPoint();
  if(!Number.isFinite(fallback.x)||!Number.isFinite(fallback.y))throw new Error('Sin enemigos el apuntado debe seguir siendo válido');

  // En un portal el juego va dentro de un iframe: al perder el foco debe pararse y callarse,
  // y no reanudarse solo al volver para no devolver al jugador directo a un golpe.
  initGame(); startMusic();
  if(gameState!=='PLAYING')throw new Error('La partida no arrancó para la prueba de foco');
  handleWindowHidden();
  if(gameState!=='PAUSED')throw new Error('Perder el foco no pausó la partida');
  if(musicTimer)throw new Error('La música siguió sonando con la pestaña oculta');
  handleWindowVisible();
  if(gameState!=='PAUSED')throw new Error('Al volver no debe reanudarse solo');
  resumeFromPause();
  if(gameState!=='PLAYING'||!musicTimer)throw new Error('Reanudar no restauró partida y música');
  // Fuera de la partida tampoco debe quedar música de fondo.
  gameState='UPGRADING'; startMusic(); handleWindowHidden();
  if(musicTimer)throw new Error('La música siguió sonando fuera de la partida');
  stopMusic(); gameState='START';

  // La vida enemiga tenía un tope que se alcanzaba hacia la ronda 32: a partir de ahí el juego
  // se derrumbaba porque el daño del jugador seguía subiendo. Debe crecer siempre.
  const hpAt=(type,round)=>{resetEntities();currentRound=round;const z=queueDirectSpawn(type,300,300);const hp=z.maxHealth;resetEntities();return hp;};
  for(const type of ['normal','miniboss','boss']){
    const curve=[10,20,30,40,60].map(r=>hpAt(type,r));
    for(let i=1;i<curve.length;i++)if(curve[i]<=curve[i-1])throw new Error('La vida deja de crecer: '+type);
    if(curve[4]<curve[1]*2)throw new Error('La vida tardía crece demasiado poco: '+type);
  }

  // Dispersión reparte el daño de la ráfaga; no debe multiplicarlo.
  resetEntities(); player=new Player(500,500); player.fireRate=0; player.weaponLevel=6; player.bonusDamage=0;
  const volleyDamage=perks=>{player.perks={scatter:0,lance:0,ricochet:0,arc:0,siege:0,...perks};projectiles.length=0;player.shoot(projectiles,0);return projectiles.reduce((s,p)=>s+p.damage,0);};
  const plain=volleyDamage({}), spread=volleyDamage({scatter:3});
  if(spread>plain*1.25)throw new Error('Dispersión sigue multiplicando el daño total');
  if(spread<plain*.9)throw new Error('Dispersión penaliza demasiado');

  // Un proyectil no puede dañar dos veces al mismo enemigo aunque lo atraviese.
  resetEntities(); player.perks={scatter:0,lance:3,ricochet:0,arc:0,siege:0}; player.x=300; player.y=400;
  const target=queueDirectSpawn('normal',520,400); target.maxHealth=target.health=1e5;
  projectiles.length=0; player.shoot(projectiles,0);
  const shotDamage=projectiles[0].damage;
  for(let i=0;i<60;i++)update(16,performance.now()+i*16);
  if(1e5-target.health>shotDamage+.001)throw new Error('Un proyectil golpeó dos veces al mismo enemigo');

  // El botón principal del menú descarta la partida a medias, así que sólo puede decir "Jugar"
  // cuando no hay ninguna en curso.
  const startButton=document.getElementById('btn-start');
  initGame(); saveProgress('label-test'); markSessionActive();
  if(!checkRecovery())throw new Error('No se detectó la partida en curso');
  if(startButton.textContent!==t('menu.retry'))throw new Error('Con partida en curso el botón debe decir Reintentar');
  gameOver();
  if(checkRecovery())throw new Error('Tras morir no debería quedar partida en curso');
  if(startButton.textContent!==t('menu.play'))throw new Error('Sin partida en curso el botón debe decir Jugar');

  // En un móvil la cámara se aleja para ver más arena, pero el escritorio no debe cambiar.
  (function(){
    const realW=window.innerWidth, realH=window.innerHeight;
    const at=(w,h)=>{window.innerWidth=w;window.innerHeight=h;resize();return{zoom:+(w/canvas.logicalWidth).toFixed(3),seesWide:Math.round(canvas.logicalWidth),seesTall:Math.round(canvas.logicalHeight)};};
    const desktop=at(1280,720), landscapePhone=at(844,390), portraitPhone=at(390,844);
    if(desktop.zoom!==1)throw new Error('El escritorio no debería alejarse');
    if(desktop.seesWide!==1280)throw new Error('El escritorio cambió su área visible');
    if(landscapePhone.seesWide<=844)throw new Error('El móvil apaisado no ve más arena');
    if(portraitPhone.seesWide<=390)throw new Error('El móvil vertical no ve más arena');
    if(portraitPhone.seesTall<=844)throw new Error('El móvil vertical no ve más alto');
    window.innerWidth=realW;window.innerHeight=realH;resize();
  })();

  // La dificultad tenía topes que se alcanzaban entre las rondas 16 y 23: a partir de ahí el juego
  // dejaba de endurecerse. Vida, daño y presión deben seguir creciendo en rondas altas.
  (function(){
    const sample=round=>{ resetEntities(); currentRound=round; const z=queueDirectSpawn('normal',300,300); const out={hp:z.maxHealth,dmg:z.damage,cap:getEncounterLimits(round).activeEnemies}; z.active=false; return out; };
    const r20=sample(20), r35=sample(35), r55=sample(55);
    if(!(r35.hp>r20.hp&&r55.hp>r35.hp))throw new Error('La vida deja de crecer en rondas altas');
    if(!(r35.dmg>r20.dmg&&r55.dmg>r35.dmg))throw new Error('El daño deja de crecer en rondas altas');
    if(!(r35.cap>r20.cap))throw new Error('La presión deja de crecer en rondas altas');
    // Pero sin convertir a los básicos en esponjas: el salto debe ser gradual.
    if(r55.hp/r20.hp>14)throw new Error('La vida de rondas altas se disparó demasiado');
    if(r55.dmg/r20.dmg>2.2)throw new Error('El daño de rondas altas se disparó demasiado');
    // Y las rondas tempranas no deben endurecerse por este cambio.
    const r10=sample(10);
    if(r10.hp>40||r10.dmg>14)throw new Error('El cambio endureció el arranque de la partida');
  })();

  // Pantalla de muerte: la causa debe salir de lo que realmente hizo el daño.
  lastDamageSource=null;
  if(deathCauseText()!==t('gameOver.killedByUnknown'))throw new Error('Sin fuente conocida no debe inventarse una causa');
  lastDamageSource={kind:'enemy',label:'Walker'};
  if(!deathCauseText().includes('Walker'))throw new Error('No se nombra al enemigo que mató');
  lastDamageSource={kind:'hazard',id:'spikes'};
  if(!deathCauseText().includes(t('death.hazard.spikes')))throw new Error('No se nombra el peligro que mató');
  lastDamageSource={kind:'hazard',id:'__desconocido__'};
  if(!deathCauseText().includes(t('death.hazardGeneric')))throw new Error('Un peligro sin nombre debe caer en el texto genérico');
  lastDamageSource={kind:'enemy',label:null};
  if(!deathCauseText().includes(t('death.enemyFire')))throw new Error('Un disparo sin dueño debe atribuirse al fuego enemigo');
  // damagePlayer debe registrar la fuente y seguir devolviendo si hubo daño.
  resetEntities(); player=new Player(400,400); player.maxHealth=100; player.health=100; player.invulnerable=false;
  lastDamageSource=null; damagePlayer(10,{kind:'hazard',id:'fire'});
  if(lastDamageSource?.id!=='fire')throw new Error('damagePlayer no registró la fuente');
  if(player.health!==90)throw new Error('damagePlayer no aplicó el daño');

  // Ramas de construcción: cada elección debe cambiar cómo se dispara, no sólo las estadísticas.
  resetEntities(); player=new Player(500,500); gameState='PLAYING'; currentRound=1;
  const perkUpgrades=upgradePool.filter(u=>u.perk);
  if(perkUpgrades.length<4)throw new Error('Faltan ramas de construcción');
  for(const upgrade of perkUpgrades){
    for(let i=0;i<PERK_MAX;i++){
      if(!upgradeAvailable(upgrade))throw new Error('La rama se agotó antes de tiempo: '+upgrade.key);
      upgrade.apply();
    }
    if(upgradeAvailable(upgrade))throw new Error('La rama superó su nivel máximo: '+upgrade.key);
    if(player.perks[upgrade.perk]!==PERK_MAX)throw new Error('Nivel de rama incorrecto: '+upgrade.key);
  }
  // Dispersión: más proyectiles por disparo; Lanza y Rebote llegan al proyectil.
  player.perks={scatter:0,lance:0,ricochet:0,arc:0,siege:0}; player.fireRate=0; player.weaponLevel=1;
  projectiles.length=0; player.shoot(projectiles,0);
  const plainShots=projectiles.length;
  player.perks.scatter=2; projectiles.length=0; player.shoot(projectiles,0);
  if(projectiles.length!==plainShots+2)throw new Error('Dispersión no añadió proyectiles');
  player.perks={scatter:0,lance:2,ricochet:3,arc:2,siege:0};
  projectiles.length=0; player.shoot(projectiles,0);
  const shot=projectiles[0];
  if(shot.pierce!==2)throw new Error('Lanza no aplicó perforación');
  if(shot.bounces!==3)throw new Error('Rebote no aplicó rebotes');
  if(shot.chain!==2)throw new Error('Arco no aplicó saltos');
  // Un proyectil reciclado del pool no debe conservar el encadenado del anterior.
  player.perks={scatter:0,lance:0,ricochet:0,arc:0,siege:0};
  projectiles.length=0; player.shoot(projectiles,0);
  if(projectiles[0].chain!==0)throw new Error('El proyectil reciclado conservó el encadenado');

  // Combo: multiplicador creciente con tope y ventana que se acorta.
  combo=0; if(comboMultiplier()!==1)throw new Error('El combo debería empezar en ×1');
  combo=10; const midMultiplier=comboMultiplier(), midWindow=comboWindow();
  if(midMultiplier<=1)throw new Error('El combo no aumenta el multiplicador');
  combo=COMBO_CAP*4;
  if(comboMultiplier()!==1+COMBO_CAP*COMBO_STEP)throw new Error('El multiplicador no respeta su tope');
  if(comboWindow()>=midWindow)throw new Error('La ventana de combo no se acorta al subir');
  if(comboWindow()<1000)throw new Error('La ventana de combo quedó demasiado corta');
  // El combo premia la racha pero no debe multiplicar la puntuación por varias veces.
  if(comboMultiplier()>2)throw new Error('El multiplicador de combo volvió a dispararse');
  combo=0;

  // Aspectos: catálogo coherente, compra/equipamiento correctos y sin efecto sobre el juego.
  for(const slot of COSMETIC_SLOTS){
    const list=COSMETICS[slot];
    if(new Set(list.map(i=>i.id)).size!==list.length)throw new Error('Ids de aspecto repetidos en '+slot);
    if(list[0].price!==0)throw new Error('El aspecto por defecto de '+slot+' debe ser gratuito');
    if(list.some(i=>!i.color))throw new Error('Aspecto sin color en '+slot);
    if(!cosmeticOwned(slot,list[0].id))throw new Error('El aspecto gratuito debe poseerse desde el inicio');
    // Sólo el aspecto por defecto puede ser gratis: los gratuitos se regalan al sanear el guardado.
    if(list.filter(i=>i.price===0).length!==1)throw new Error('Debe haber exactamente un aspecto gratuito en '+slot);
    // Un aspecto sin nombre saldría vacío en el taller, y uno con una forma que el dibujante no
    // conoce se vería como un círculo cualquiera sin avisar.
    for(const item of list){
      for(const lang of ['en','es'])
        if(!TRANSLATIONS[lang]?.cosmetics?.[slot]?.[item.id])throw new Error('Aspecto sin nombre: '+lang+'.'+slot+'.'+item.id);
      if(slot==='bullet'&&!BULLET_SHAPES.includes(item.shape))throw new Error('Forma de bala desconocida: '+item.shape);
      if(slot==='box'&&item.finish&&!BOX_FINISHES.includes(item.finish))throw new Error('Acabado de caja desconocido: '+item.finish);
      if(slot==='gun'&&(!(item.length>0)||!(item.width>0)||!(item.barrels>=1)))throw new Error('Arma con medidas inválidas: '+item.id);
    }
  }
  // Cada forma y cada acabado deben dibujar algo distinto, no caer todos en el mismo trazo.
  (function(){
    const traced=new Map();
    for(const shape of BULLET_SHAPES){
      const ops=[];
      const probe={rect:(...a)=>ops.push('rect'+a.map(Math.round)),arc:(...a)=>ops.push('arc'+a.slice(0,3).map(Math.round)),moveTo:(...a)=>ops.push('moveTo'+a.map(Math.round)),lineTo:(...a)=>ops.push('lineTo'+a.map(Math.round)),closePath:()=>ops.push('close')};
      traceBulletShape(probe,shape,0,0,10);
      if(!ops.length)throw new Error('La forma no dibuja nada: '+shape);
      const signature=ops.join('|');
      for(const [other,sig] of traced)if(sig===signature)throw new Error('Las formas '+other+' y '+shape+' dibujan lo mismo');
      traced.set(shape,signature);
    }
  })();
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
  if(!(SFX_MIX>.5&&SFX_MIX<1))throw new Error('La mezcla de efectos debe bajarlos sin apagarlos');

  // Sin SDK (aquí no existe) nada puede lanzar y el almacenamiento debe seguir siendo localStorage.
  if(Platform.environment!=='none')throw new Error('Sin SDK el entorno debería ser none');
  if(Platform.usable)throw new Error('Sin SDK no puede considerarse utilizable');
  if(Storage.backend!==null)throw new Error('Sin SDK el almacenamiento debe seguir siendo local');
  Platform.gameplayStart();Platform.gameplayStop();Platform.loadingStart();Platform.loadingStop();
  if(Platform.call('game.gameplayStart')!==null)throw new Error('Una llamada sin SDK debe devolver null');
  // Sin anuncio disponible tiene que avisar por adError, o el juego se quedaría esperando.
  let adFailed=false;
  Platform.requestAd('midgame',{adError:()=>{adFailed=true;}});
  if(!adFailed)throw new Error('Sin SDK el anuncio debe reportar error para no colgar la partida');
  // Un SDK que lanza en cada llamada (entorno disabled) tampoco puede tumbar el juego.
  const quietWarn=console.warn;console.warn=()=>{};   // los avisos de abajo son intencionados
  const hostileSdk={game:{gameplayStart(){throw new Error('disabled');}},ad:{requestAd(){throw new Error('disabled');}}};
  const realSdk=Platform.sdk,realUsable=Platform.usable;
  Platform.sdk=hostileSdk;Platform.usable=true;
  if(Platform.call('game.gameplayStart')!==null)throw new Error('Una llamada que lanza debe devolver null');
  let hostileAdFailed=false;
  Platform.requestAd('midgame',{adError:()=>{hostileAdFailed=true;}});
  if(!hostileAdFailed)throw new Error('Un anuncio que lanza debe reportar error');
  Platform.sdk=realSdk;Platform.usable=realUsable;console.warn=quietWarn;
  // El guardado sigue funcionando a través de la fachada.
  Storage.setItem('__probe__','1');
  if(Storage.getItem('__probe__')!=='1')throw new Error('La fachada de almacenamiento no guarda');
  Storage.removeItem('__probe__');
  if(Storage.getItem('__probe__')!==null)throw new Error('La fachada de almacenamiento no borra');

  // Los avisos de partida deben salir en los momentos correctos, aunque el SDK real decida luego
  // qué hace con ellos. Se espía nuestra propia capa, que es lo que controlamos.
  (function(){
    // Qué pretende el juego, independientemente de cuándo lo entregue la capa.
    const intents=[];
    const realSet=Platform.setGameplay.bind(Platform);
    Platform.setGameplay=function(active){intents.push(!!active);return realSet(active);};
    gameState='START';
    beginRun(1);
    pauseGame();
    resumeFromPause();
    endRound();
    gameState='PLAYING'; player.health=0;
    for(let i=0;i<5&&gameState==='PLAYING';i++)update(16,performance.now()+i*16);
    Platform.setGameplay=realSet;
    const expected=[true,false,true,false,false];
    if(intents.join(',')!==expected.join(','))throw new Error('Secuencia de avisos de partida incorrecta: '+intents.join(','));
  })();

  // El SDK descarta avisos a menos de un segundo, así que aquí se agrupan sin perder el último.
  (function(){
    const calls=[];
    const realCall=Platform.call.bind(Platform);
    Platform.call=function(path,...args){if(path.startsWith('game.gameplay'))calls.push(path.endsWith('Start')?'START':'STOP');return realCall(path,...args);};
    Platform.gameplayState=null;Platform.pendingGameplay=null;Platform.lastGameplayAt=0;clearTimeout(Platform.gameplayTimer);
    Platform.gameplayStart();                       // se envía ya
    if(calls.join()!=='START')throw new Error('El primer aviso debería salir de inmediato');
    Platform.gameplayStart();Platform.gameplayStart();
    if(calls.join()!=='START')throw new Error('Los avisos repetidos deben ignorarse');
    Platform.gameplayStop();                        // llega antes de un segundo: se aplaza
    if(calls.join()!=='START')throw new Error('Un aviso demasiado seguido no debe enviarse aún');
    Platform.flushGameplay();
    if(calls.join()!=='START,STOP')throw new Error('El aviso aplazado debe acabar entregándose');
    Platform.gameplayState=null;Platform.pendingGameplay=null;Platform.lastGameplayAt=0;
    Platform.call=realCall;
  })();

  // Estallidos dirigidos y sacudida sólo en jefes.
  (function(){
    const burst=new Particle().init(0,0,'#fff',6,4,1,0,.001);
    if(burst.vx<=0||Math.abs(burst.vy)>.01)throw new Error('La partícula dirigida no sale hacia su ángulo');
    const loose=new Particle().init(0,0,'#fff',6,4,1);
    if(loose.vx===burst.vx&&loose.vy===burst.vy)throw new Error('Sin ángulo la partícula debería repartirse al azar');
  })();
  resetEntities(); player=new Player(400,400); gameState='PLAYING'; currentRound=3;
  shakeTime=0;
  const walker=queueDirectSpawn('normal',500,400); walker.lastHitAngle=0; walker.health=0; walker.active=false;
  handleEnemyDeath(walker);
  if(shakeTime!==0)throw new Error('Una baja normal no debe sacudir la cámara');
  const deadBoss=queueDirectSpawn('boss',600,400); deadBoss.health=0; deadBoss.active=false;
  handleEnemyDeath(deadBoss);
  if(shakeTime<=0)throw new Error('La muerte de un jefe sí debe sacudir la cámara');
  shakeTime=0;

  // Con la pestaña oculta no puede quedar música sonando: pausar sólo la atenúa.
  beginRun(1);
  if(!musicTimer)throw new Error('La música no arrancó con la partida');
  handleWindowHidden();
  if(musicTimer)throw new Error('La música siguió sonando con la ventana oculta');
  handleWindowVisible();
  if(!musicTimer)throw new Error('La música no volvió al recuperar la ventana');
  handleWindowHidden();

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
