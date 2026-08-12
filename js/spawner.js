const Spawner = {
    warnings: [],
    maxWarnings: 24,
    preferredEdges: null,
    edgeShift: 0,
    roundRoster: ['normal'],
    rosterHistory: [],
    roleHistory: [],
    useCounts: {},
    typeCaps: {healer:1,magnetic:2,summoner:2,parent:4,duplicator:3,sniper:2,builder:2,turret:2,shooter:6,freezer:3,chain:3,powerThief:1,boss:1,miniboss:1,warden:2,beacon:1,anchor:2,sporeCarrier:3,screecher:2,parasiteHost:2,wallCrawler:2,mortar:2,suppressor:2,reanimator:1,swapper:1,sentinel:2,stalker:2,relay:1,blight:2,collector:1,gatekeeper:1,timekeeper:1,undertaker:1},

    reset(){this.warnings.length=0;this.preferredEdges=null;this.edgeShift=0;this.roundRoster=['normal'];},
    resetSession(){this.reset();this.rosterHistory=[];this.roleHistory=[];this.useCounts={};},
    configureRoster(round){
        const roles={pressure:['normal','fast','mini','mirrorling','drifter','explosive'],direct:['runner','rammer','jumper','wallCrawler','berserker','burrower'],control:['poison','blight','warden','builder','suppressor','mortar','freezer'],ranged:['shooter','sniper','turret','sentinel','drifter','mortar'],support:['healer','beacon','relay','anchor','reanimator','timekeeper'],generator:['parent','summoner','duplicator','splitter','undertaker','gatekeeper','sporeCarrier'],disruption:['magnetic','chain','swapper','leech','phaseWalker','stalker','ghost']};
        const recent=new Set(this.rosterHistory.slice(-3).flat()),unlocked=list=>list.filter(type=>(ENEMY_CATALOG[type]?.firstRound||1)<=round),weightedPick=list=>{const pool=unlocked(list);if(!pool.length)return null;let total=0;const weighted=pool.map(type=>{const stat=typeof bestiaryRecord==='function'?bestiaryRecord(type):{discovered:true},weight=(recent.has(type) ? .28 : 1)/(1+(this.useCounts[type]||0)*.22)*(stat.discovered?1:1.8);total+=weight;return[type,weight];});let roll=Math.random()*total;for(const[type,weight]of weighted){roll-=weight;if(roll<=0)return type;}return weighted[0][0];};
        const roster=[],dominant=[];const add=(role,count=1)=>{for(let i=0;i<count;i++){const candidate=weightedPick(roles[role].filter(type=>!roster.includes(type)));if(candidate){roster.push(candidate);dominant.push(role);}}};
        add('pressure',2);if(round>=3)add('direct');if(round>=4)add('generator');if(round>=5)add('ranged');if(round>=7)add(Math.random()<.5?'support':'control');if(round>=9)add('disruption');if(round>=11)add(['control','support','ranged','generator'][round%4]);if(round>=16)add(['direct','disruption','control'][round%3]);
        const previous=this.rosterHistory.at(-1),same=previous&&previous.length===roster.length&&previous.every(type=>roster.includes(type));if(same){const alternatives=unlocked(Object.values(roles).flat()).filter(type=>!roster.includes(type)&&!recent.has(type));if(alternatives.length)roster[roster.length-1]=alternatives[Math.floor(Math.random()*alternatives.length)];}
        const maxTypes=round<=2?3:round<=4?4:round<=10?6:7;this.roundRoster=roster.slice(0,maxTypes);
        for(const type of this.roundRoster)this.useCounts[type]=(this.useCounts[type]||0)+1;this.rosterHistory.push([...this.roundRoster]);this.roleHistory.push(dominant);if(this.rosterHistory.length>6)this.rosterHistory.shift();if(this.roleHistory.length>6)this.roleHistory.shift();
    },
    update(dt){for(let i=this.warnings.length-1;i>=0;i--){const w=this.warnings[i];w.time-=dt;if(w.time<=0){this.executeSpawn(w);this.warnings.splice(i,1);}}},
    draw(c){c.save();for(const w of this.warnings){const p=clamp(1-w.time/w.maxTime,0,1);c.strokeStyle=`rgba(${w.elite?'251,191,36':'239,68,68'},${.35+p*.55})`;c.lineWidth=w.elite?5:3;c.beginPath();c.arc(w.x,w.y,w.radius,0,Math.PI*2);c.stroke();c.fillStyle=`rgba(239,68,68,${.06+p*.24})`;c.beginPath();c.arc(w.x,w.y,w.radius*p,0,Math.PI*2);c.fill();}c.restore();},
    safePoint(x,y){if(!player)return{x:clamp(x,55,arena.width-55),y:clamp(y,55,arena.height-55)};if(distance(x,y,player.x,player.y)<285){const a=Math.atan2(y-player.y,x-player.x)||Math.random()*Math.PI*2;x=player.x+Math.cos(a)*340;y=player.y+Math.sin(a)*340;}return{x:clamp(x,55,arena.width-55),y:clamp(y,55,arena.height-55)};},
    activeType(type){return zombies.reduce((n,z)=>n+(z.active&&z.type===type?1:0),0)+this.warnings.reduce((n,w)=>n+(w.type===type?1:0),0);},
    canSpawn(type){
        const cap=this.typeCaps[type],summoners=['summoner','parent','duplicator','splitter','parasiteHost','undertaker'],hardControl=['magnetic','warden','timekeeper','swapper'];
        const limits=getEncounterLimits(currentRound),supports=['healer','beacon','relay','reanimator','timekeeper','anchor'],activeComplexity=zombies.reduce((sum,z)=>sum+(z.active?complexityOf(z.type,z.isElite):0),0)+this.warnings.reduce((sum,w)=>sum+complexityOf(w.type,w.elite),0);
        if(summoners.includes(type)&&summoners.reduce((n,t)=>n+this.activeType(t),0)>=3)return false;
        if(hardControl.includes(type)&&hardControl.reduce((n,t)=>n+this.activeType(t),0)>=2)return false;
        if(supports.includes(type)&&supports.reduce((n,t)=>n+this.activeType(t),0)>=limits.supports)return false;
        return(!cap||this.activeType(type)<cap)&&getActiveEnemyCount()<limits.activeEnemies&&activeComplexity+complexityOf(type)<=(limits.complexity+(type==='boss'||type==='miniboss'?18:0));
    },
    queueSpawn(type,x,y,time=900,elite=false){if(this.warnings.length>=this.maxWarnings||!this.canSpawn(type))return false;time*=difficultyProfile.telegraph;const p=this.safePoint(x,y);this.warnings.push({type,x:p.x,y:p.y,time,maxTime:time,elite,radius:type==='boss'?70:type==='miniboss'?52:elite?35:28});return true;},
    executeSpawn(w){queueDirectSpawn(w.type,w.x,w.y,w.elite,true);},
    edgePoint(edge){const pad=55;if(edge===0)return{x:Math.random()*arena.width,y:pad};if(edge===1)return{x:Math.random()*arena.width,y:arena.height-pad};if(edge===2)return{x:pad,y:Math.random()*arena.height};return{x:arena.width-pad,y:Math.random()*arena.height};},
    chooseEdge(){
        // Si el jugador lleva rato acampado, parte de las oleadas entra por los bordes que tiene cerca.
        if(typeof campPressure!=='undefined'&&campPressure>.55&&Math.random()<campPressure*.75){const near=campEdges();if(near)return near[Math.floor(Math.random()*near.length)];}
        if(this.preferredEdges?.length)return this.preferredEdges[Math.floor(Math.random()*this.preferredEdges.length)];
        return(Math.floor(Math.random()*4)+this.edgeShift)%4;
    },
    chooseType(round){
        let bag=[...(this.roundRoster||['normal'])];if(bag.length)bag.push(bag[0]);
        if(hasModifier('Horda'))bag.push('normal','normal','normal','fast');
        if(hasModifier('Velocidad')||hasModifier('Cazadores'))bag.push('fast','runner','runner','jumper');
        if(hasModifier('Artillería')||hasModifier('Zona de guerra'))bag.push('shooter','sniper','turret','freezer');
        if(hasModifier('Nido'))bag.push('parent','summoner','summoner');
        if(hasModifier('Terremoto')||hasModifier('Terremotos'))bag.push('jumper','jumper');
        if(hasModifier('Explosiones'))bag.push('explosive','bomb','bomb');
        if(hasModifier('Enjambre')||hasModifier('Modo miniatura'))bag.push('mini','mini','fast');
        if(hasModifier('Modo gigante'))bag=['tank','shield','berserker','parent'];
        if(hasModifier('Caza del objetivo')&&this.activeType('powerThief')===0)bag.push('powerThief','powerThief');
        for(let tries=0;tries<10;tries++){const t=bag[Math.floor(Math.random()*bag.length)];if(this.canSpawn(t))return t;}
        return'normal';
    },
    synergy(round){
        const list=[];
        if(round>=5)list.push(['shield','shooter','normal']);
        if(round>=7)list.push(['runner','freezer','fast']);
        if(round>=8)list.push(['parent','explosive','normal']);
        if(round>=9)list.push(['summoner','fast','normal']);
        if(round>=10)list.push(['magnetic','explosive','fast']);
        if(round>=12)list.push(['shield','healer','normal']);
        if(round>=16)list.push(['magnetic','explosive','explosive']);
        if(round>=18)list.push(['freezer','runner','fast']);
        if(round>=19)list.push(['parent','summoner','normal']);
        if(round>=21)list.push(['builder','shooter','sniper']);
        if(round>=22)list.push(['jumper','sniper','fast']);
        if(round>=24)list.push(['poison','builder','normal']);
        if(round>=17)list.push(['warden','shooter','fast']);
        if(round>=19)list.push(['beacon','jumper','sniper']);
        if(round>=21)list.push(['anchor','screecher','normal']);
        if(round>=23)list.push(['relay','shield','shooter']);
        if(round>=25)list.push(['blight','builder','runner']);
        if(round>=27)list.push(['suppressor','rammer','normal']);
        if(round>=29)list.push(['timekeeper','drifter','fast']);
        if(!list.length)return null;const recent=new Set((typeof synergyHistory!=='undefined'?synergyHistory:[]).slice(-2)),available=list.filter(c=>!recent.has(c.join('|'))),pick=(available.length?available:list)[Math.floor(Math.random()*(available.length?available.length:list.length))];if(typeof synergyHistory!=='undefined'){synergyHistory.push(pick.join('|'));if(synergyHistory.length>6)synergyHistory.shift();}return pick;
    },
    spawnFormation(types,edge,eliteIndex=-1){const base=this.edgePoint(edge),count=types.length;let queued=0;for(let i=0;i<count;i++){const offset=(i-(count-1)/2)*48,x=base.x+(edge<2?offset:0),y=base.y+(edge>=2?offset:0);if(this.queueSpawn(types[i],x,y,1050,i===eliteIndex))queued++;}return queued;},
    spawnGroup(round){
        if(getActiveEnemyCount()>=getEncounterLimits(round).activeEnemies-2)return 0;
        const phase=typeof roundPhase==='string'?roundPhase:'start';
        const synergyChance=round<5 ? 0 : Math.min(.5,(.08+round*.008+(phase==='final' ? .08 : 0))*difficultyProfile.coordination);
        if(Math.random()<synergyChance){const combo=this.synergy(round);if(combo)return this.spawnFormation(combo,this.chooseEdge(),shouldSpawnElite()?0:-1);}
        const edge=this.chooseEdge(),base=this.edgePoint(edge),groupChance=Math.min(.72,.18+round*.01+(phase==='mid' ? .08 : phase==='final' ? .14 : 0)+(adaptivePressure||0)*.05);
        if(Math.random()>groupChance){const t=this.chooseType(round);this.queueSpawn(t,base.x,base.y,850,shouldSpawnElite());return 1;}
        let count=Math.min(round<6?3:5,2+Math.floor(Math.random()*(round>=10?3:2)));
        if(hasModifier('Modo gigante')||hasModifier('Zona de guerra'))count=Math.max(2,Math.floor(count*.55));
        const leader=this.chooseType(round),types=[],fillers=this.roundRoster.filter(type=>complexityOf(type)<=3&&type!==leader);if(!fillers.length)fillers.push('normal','fast');
        for(let i=0;i<count;i++)types.push(i===0?leader:(complexityOf(leader)>=3||Math.random()<.7?fillers[Math.floor(Math.random()*fillers.length)]:leader));
        this.spawnFormation(types,edge,shouldSpawnElite()?0:-1);
        if((round>=16||hasModifier('Dos frentes'))&&Math.random()<.22+(phase==='final' ? .16 : 0)){const opposite=(edge+2)%4;this.spawnFormation([this.chooseType(round),this.chooseType(round)],opposite,-1);count+=2;}
        return count;
    }
};
