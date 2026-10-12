// Experimental local match engine. Never reads or writes league Elo.
export const GAME_VERSION='lobi-tactics-prototype-v1';
export const ARENA={
 name:'Çift Hat',description:'Özgün şematik test haritası · CS2 haritası değildir',
 nodes:{t:{x:300,y:450,label:'T başlangıç'},left:{x:105,y:330,label:'Sol geçit'},mid:{x:300,y:260,label:'Mid'},right:{x:495,y:330,label:'Sağ geçit'},a:{x:105,y:115,label:'A alanı'},b:{x:495,y:115,label:'B alanı'},ct:{x:300,y:45,label:'CT başlangıç'}},
 edges:[['t','left'],['t','mid'],['t','right'],['left','a'],['mid','a'],['mid','b'],['right','b'],['a','ct'],['b','ct']]
};
export const GAME_ROLES={rifle:'Tüfek',awp:'AWP',support:'Destek'};
export const GAME_PLANS={default:'Kontrollü',rush:'Hızlı baskı',split:'İki alanı yokla'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function seededRandom(seed){let n=2166136261;for(const c of String(seed)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return ()=>{n+=0x6d2b79f5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function metric(card,key){const v=card.cardMetrics?.find(m=>m.key===key)?.score;return Number.isFinite(v)?clamp(v,0,100):50;}
export function eligibleGameCards(cards){return cards.filter(p=>p.knownLeaguePlayer&&p.rounds>0&&p.cardMetrics?.some(m=>m.key==='firepower'&&Number.isFinite(m.score))).sort((a,b)=>b.rounds-a.rounds||a.id.localeCompare(b.id));}
export function initialDraft(cards){const first=eligibleGameCards(cards).slice(0,10),order=[0,1,1,0,0,1,1,0,0,1];return [0,1].map(team=>first.filter((_,i)=>order[i]===team).map((p,i)=>({id:p.id,role:metric(p,'sniping')>65?'awp':'rifle',zone:i<2?'a':i===2?'mid':'b',initiative:50})));}
export function validateDraft(teams,cards,config){
 if(!Array.isArray(teams)||teams.length!==2||teams.some(t=>t.length!==5))throw Error('İki takımda da beş kart seç.');
 const ids=teams.flat().map(p=>p.id);if(new Set(ids).size!==10)throw Error('Bir kart yalnızca bir takımda oynayabilir.');
 const allowed=new Set(eligibleGameCards(cards).map(p=>p.id));if(ids.some(id=>!allowed.has(id)))throw Error('Seçilen kartın uygun demo verisi yok.');
 if(teams.flat().some(p=>!Object.hasOwn(GAME_ROLES,p.role)||!['a','b','mid'].includes(p.zone)||!Number.isFinite(p.initiative)||p.initiative<0||p.initiative>100))throw Error('Kart taktiği geçersiz.');
 if(!Array.isArray(config.plans)||config.plans.length!==2||config.plans.some(p=>!Object.hasOwn(GAME_PLANS,p)))throw Error('Takım planı geçersiz.');
 if(!Number.isFinite(config.smokeRate)||config.smokeRate<0||config.smokeRate>1)throw Error('Smoke olasılığı 0 ile 1 arasında olmalı.');
 if(!String(config.seed).trim()||String(config.seed).length>80)throw Error('Deney kodunu 1–80 karakterle yaz.');
}
const neighbours=node=>ARENA.edges.flatMap(([a,b])=>a===node?[b]:b===node?[a]:[]);
const connected=(a,b)=>a===b||neighbours(a).includes(b);
function nextNode(start,goal){if(start===goal)return start;const queue=[[start]],seen=new Set([start]);while(queue.length){const path=queue.shift();for(const n of neighbours(path.at(-1))){if(seen.has(n))continue;if(n===goal)return path[1]??n;seen.add(n);queue.push([...path,n]);}}return start;}
export function duelProbability(attacker,defender,{moving=false,blind=false,opening=false,clutch=false,trade=false}={}){
 const skill=metric(attacker.card,attacker.weapon==='awp'?'sniping':'firepower'),defence=metric(defender.card,'firepower');
 return clamp(.48+(skill-defence)/400+(attacker.weapon==='awp'?.08:attacker.weapon==='pistol'?-.14:0)+(opening?(metric(attacker.card,'opening')-50)/800:0)+(clutch?(metric(attacker.card,'clutching')-50)/800:0)+(trade?.04+(metric(attacker.card,'trading')-50)/1000:0)-(moving?.08:0)-(blind?.30:0),.08,.88);
}
// One Bernoulli trial for ONE eligible burst, not one trial per bullet.
export function smokeTrial(rate,random){return random()<rate;}
export function simulateMatch(cards,teams,config){
 validateDraft(teams,cards,config);const random=seededRandom(config.seed),pick=a=>a[Math.floor(random()*a.length)];
 const identities=teams.flatMap((t,team)=>t.map(p=>({...p,team,card:cards.find(c=>c.id===p.id)})));
 const tally=Object.fromEntries(identities.map(p=>[p.id,{id:p.id,name:p.card.name,team:p.team,kills:0,deaths:0,damage:0,smokeAttempts:0,smokeKills:0,plants:0,defuses:0}]));
 let score=[0,0],cash=Object.fromEntries(identities.map(p=>[p.id,800])),loss=[0,0],rounds=[];
 for(let rn=1;rn<=48;rn++){
  if(rn===13)cash=Object.fromEntries(identities.map(p=>[p.id,800]));
  if(rn>24&&(rn-25)%3===0)cash=Object.fromEntries(identities.map(p=>[p.id,10000]));
  const tTeam=rn<=24?(rn<=12?0:1):(Math.floor((rn-25)/3)%2===0?0:1);
  const people=identities.map(p=>{
   const budget=cash[p.id];let weapon=p.role==='awp'&&budget>=5600?'awp':budget>=3650?'rifle':'pistol';const cost=weapon==='awp'?4750:weapon==='rifle'?2700:0;
   const armor=budget-cost>=650,utility=budget-cost-(armor?650:0)>=300;cash[p.id]-=cost+(armor?650:0)+(utility?300:0);
   return {...p,side:p.team===tTeam?'T':'CT',node:p.team===tTeam?'t':p.zone==='mid'?'ct':p.zone,hp:100,weapon,armor,ammo:weapon==='awp'?5:30,smoke:utility,flash:utility&&p.role==='support',bursts:0,lastBurst:-100,blindUntil:0,moved:false,lastShot:-100,seen:{}};
  });
  let time=0,planted=null,bombAt=null,defuse=0,plantProgress=0,winner=null,reason='',smokes=[],lastDeaths=[],frames=[];
  const events=[];
  function log(type,text,extra={}){events.push({round:rn,time,type,text,...extra});}
  function frame(){frames.push({round:rn,time,score:[...score],tTeam,bombAt,planted,defuse,smokes:smokes.filter(s=>s.until>time).map(s=>({...s})),players:people.map(p=>({id:p.id,team:p.team,node:p.node,hp:p.hp,weapon:p.weapon,ammo:p.ammo})),events:events.map(e=>({...e}))});}
  function kill(a,b,smoke=false){tally[a.id].damage+=b.hp;b.hp=0;tally[a.id].kills++;tally[b.id].deaths++;lastDeaths.push({team:b.team,node:b.node,time});cash[a.id]=Math.min(16000,cash[a.id]+300);log(smoke?'smoke-kill':'kill',a.card.name+' → '+b.card.name+(smoke?' · smoke taraması':''),{actor:a.id,victim:b.id,smoke});}
  log('start','Round '+rn+' · Takım '+(tTeam+1)+' T tarafında');frame();
  for(time=4;time<=156&&winner===null;time+=4){
   smokes=smokes.filter(s=>s.until>time);const smoked=n=>smokes.some(s=>s.node===n);
   for(const p of people.filter(p=>p.hp>0)){
    for(const enemy of people.filter(e=>e.team!==p.team&&e.hp>0&&connected(p.node,e.node))){
     if(!smoked(p.node)&&!smoked(enemy.node))p.seen[enemy.id]={node:enemy.node,time};
     else if(time-enemy.lastShot<=4)p.seen[enemy.id]={node:enemy.node,time};
    }
   }
   for(const p of people.filter(p=>p.hp>0).map(p=>({p,key:random()})).sort((a,b)=>a.key-b.key).map(x=>x.p)){
    if(p.hp<=0)continue;const enemies=people.filter(e=>e.hp>0&&e.team!==p.team),friends=people.filter(e=>e.hp>0&&e.team===p.team);
    let nearby=enemies.filter(e=>connected(p.node,e.node)),visible=nearby.filter(e=>!smoked(p.node)&&!smoked(e.node));const wasMoving=p.moved;p.moved=false;
    // Smoke deployment is a modeled tactical action, not measured smoke skill.
    if(p.smoke&&nearby.length&&random()<.12+metric(p.card,'utility')/600){const target=pick(nearby).node;p.smoke=false;smokes.push({node:target,until:time+20,actor:p.id});log('smoke',p.card.name+' · '+ARENA.nodes[target].label+' smoke',{actor:p.id});visible=nearby.filter(e=>!smoked(p.node)&&!smoked(e.node));}
    if(p.flash&&visible.length){p.flash=false;if(random()<.25+metric(p.card,'utility')/250){const e=pick(visible);e.blindUntil=time+8;log('flash',p.card.name+' → '+e.card.name+' · flash',{actor:p.id});}}
    const hidden=nearby.filter(e=>(smoked(p.node)||smoked(e.node))&&p.seen[e.id]?.node===e.node&&time-p.seen[e.id].time<=12);
    if(!visible.length&&hidden.length&&p.bursts<2&&p.ammo>=8&&time-p.lastBurst>=12&&p.weapon!=='awp'){
     p.bursts++;p.lastBurst=time;p.lastShot=time;p.ammo-=8;tally[p.id].smokeAttempts++;
     const target=pick(hidden);const success=smokeTrial(config.smokeRate,random);
     log('spray',p.card.name+' · smoke taraması '+(success?'başarılı':'boş geçti'),{actor:p.id,eligible:true,success});
     if(success){tally[p.id].smokeKills++;kill(p,target,true);}continue;
    }
    if(visible.length&&p.ammo>0){const target=pick(visible);p.ammo-=p.weapon==='awp'?1:Math.min(3,p.ammo);p.lastShot=time;
     const chance=duelProbability(p,target,{moving:wasMoving,blind:p.blindUntil>time,opening:time<=20,clutch:friends.length===1,trade:lastDeaths.some(d=>d.team===p.team&&time-d.time<=8&&connected(p.node,d.node))});
     if(random()<chance){let damage=p.weapon==='awp'?100:Math.round((p.weapon==='pistol'?22:36)+random()*20);if(target.armor&&p.weapon!=='awp')damage=Math.round(damage*.8);damage=Math.min(damage,target.hp);target.hp-=damage;tally[p.id].damage+=damage;
      log('hit',p.card.name+' → '+target.card.name+' · '+damage+' hasar',{actor:p.id,victim:target.id,damage});
      if(target.hp===0){tally[p.id].kills++;tally[target.id].deaths++;cash[p.id]=Math.min(16000,cash[p.id]+300);lastDeaths.push({team:target.team,node:target.node,time});log('kill',p.card.name+' → '+target.card.name,{actor:p.id,victim:target.id});}
     }continue;
    }
    if(p.ammo===0){p.ammo=p.weapon==='awp'?5:30;log('reload',p.card.name+' · şarjör değiştiriyor',{actor:p.id});continue;}
    if(p.blindUntil>time)continue;
    let target=p.zone;
    if(p.side==='T'){
     target=planted?bombAt:(p.zone==='mid'?(config.plans[p.team]==='split'?'b':'a'):p.zone);
     const delay=config.plans[p.team]==='rush'?4:config.plans[p.team]==='split'?8:16;
     if(!planted&&time<delay+(100-p.initiative)/10)continue;
    }else if(planted)target=bombAt;else if(p.zone==='mid')target='mid';
    const next=nextNode(p.node,target);if(next!==p.node){p.node=next;p.moved=true;}
   }
   const alive=team=>people.filter(p=>p.team===team&&p.hp>0),tAlive=alive(tTeam),ctAlive=alive(1-tTeam);
   if(!ctAlive.length){winner=tTeam;reason='CT kadrosu elendi';}
   else if(!tAlive.length&&!planted){winner=1-tTeam;reason='T kadrosu elendi';}
   else if(!planted){
    const carrier=tAlive.find(p=>['a','b'].includes(p.node)&&!ctAlive.some(e=>connected(e.node,p.node)&&!smoked(e.node)&&!smoked(p.node)));
    if(carrier){if(bombAt!==carrier.node){bombAt=carrier.node;plantProgress=0;}plantProgress+=4;if(plantProgress>=8){planted=time;tally[carrier.id].plants++;log('plant',carrier.card.name+' · '+ARENA.nodes[bombAt].label+' bomba kuruldu',{actor:carrier.id});}}else plantProgress=0;
    if(time>=112&&winner===null){winner=1-tTeam;reason='Bomba kurulmadan süre doldu';}
   }else{
    const defender=ctAlive.find(p=>p.node===bombAt),contested=tAlive.some(p=>connected(p.node,bombAt));
    if(defender&&!contested){defuse+=4;if(defuse>=12){winner=1-tTeam;reason='Bomba çözüldü';tally[defender.id].defuses++;log('defuse',defender.card.name+' · bomba çözüldü',{actor:defender.id});}}else defuse=0;
    if(time-planted>=40&&winner===null){winner=tTeam;reason='Bomba patladı';}
   }
   frame();
  }
  if(winner===null){winner=1-tTeam;reason='Süre doldu';}
  score[winner]++;log('end','Takım '+(winner+1)+' roundu aldı · '+reason,{winner});frame();
  rounds.push({number:rn,tTeam,winner,reason,score:[...score],frames,events});
  for(const team of [0,1]){loss[team]=team===winner?0:Math.min(4,loss[team]+1);for(const p of people.filter(p=>p.team===team)){cash[p.id]=Math.min(16000,cash[p.id]+(team===winner?3250:1400+500*(loss[team]-1)));}}
  if(rn<=24&&Math.max(...score)>=13)break;
  if(rn>24&&(rn-24)%6===0&&score[0]!==score[1])break;
 }
 return {version:GAME_VERSION,seed:String(config.seed),config:{...config,plans:[...config.plans]},teams:teams.map(t=>t.map(p=>({...p}))),cardSnapshot:identities.map(p=>({id:p.id,name:p.card.name,rounds:p.card.rounds,overall:p.card.overall,cardVersion:p.card.cardVersion,referenceVersion:p.card.referenceVersion,metrics:p.card.cardMetrics.map(m=>({key:m.key,score:m.score}))})),cardVersions:[...new Set(identities.map(p=>p.card.cardVersion).filter(Boolean))],score,winner:score[0]===score[1]?null:score[0]>score[1]?0:1,rounds,players:Object.values(tally),smokeAttempts:Object.values(tally).reduce((s,p)=>s+p.smokeAttempts,0),smokeKills:Object.values(tally).reduce((s,p)=>s+p.smokeKills,0)};
}
