import {EXPERIMENT_POLICIES} from './decision-policy.js';
import {ENGINE_BUILD} from './engine-build.js';
import {applyScenarioPlayer} from './scenario.js';
import {metric,eligibleGameCards,initialDraft as oldDraft,seededRandom} from '../game-lab-model.js';
import {NAV,MAP_VERSION,LOCATIONS,area,location,nearestArea,routePoints,routeLength,distance,eye,lineClear,smokeBlocks} from './map.js';
import {CATALOG,WEAPONS,RULES,weaponScore,createEconomy,transact,newGun,dropGun,pickupGun,buyGun,equipment,killIncome,settle,validateOwnership} from './economy.js';
import {TRAITS,profile,coachState,teamMorale,moraleEvent as applyMoraleEvent,betweenRounds,readiness,coordination} from './morale.js';
import {choosePostPistolBuy,chooseCtRetake,DEFAULT_TACTICAL_POLICY} from './tactical-policy.js';
import {utilityTargetKey,escapeDestination} from './objectives.js';
export {TRAITS,eligibleGameCards,metric,WEAPONS,RULES};
import {VERSION,validateConfig} from './config.js';
import {readyOrder} from '../tactical-orders.js';
import {worldFromRadar,formationAreas,walkableLocalPoint} from './navigation.js';
import {shuffled,smokeAttemptProbability,PROBABILITY_VERSION} from './probability.js';
import {recordDefenseRound,defenseAdjustment,chooseBombSearchSite,OPPONENT_MODEL_VERSION} from './opponent-model.js';
import {behaviorTier,BEHAVIOR_VERSION} from './behavior-tiers.js';
import {audiblePlantCue,relayPlantCue,defensiveThreat,reactionDelay,shouldSupport,REACTION_VERSION,PLANT_INTEL_TTL} from './reaction.js';
import {queueSight,deliveredSight,RADIO_VERSION} from './radio.js';
import {movementBlocked,friendlyInShotLane,avoidanceCandidates} from './body-blocking.js';
import {atRetakeEntry,retakeEntryEta,remainingPathLength} from './decision-state.js';
export {VERSION,initialConfig,initialDraft,validateConfig} from './config.js';
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
export function hitProbability(attacker,target,context={}){
 const gun=WEAPONS[context.weapon??attacker.active?.key??'glock'],skill=metric(attacker.card,gun.key==='awp'||gun.key==='ssg08'?'sniping':'firepower'),range=context.distance??distance(attacker.p,target.p);
 const base=gun.key==='awp'?.78:['glock','usp_silencer','hkp2000','deagle'].includes(gun.key)?.32:.43;
 let accuracy=base*(.65+.7*skill/100)*Math.exp(-range/(gun.key==='awp'?6500:gun.key==='ssg08'?4500:1900));
 if(context.moving)accuracy*=gun.key==='awp'?.12:.48;if(context.blind)accuracy*=.08;if(context.smoke)accuracy*=.045;
 if(context.pressure)accuracy*=.80+.20*metric(attacker.card,'clutching')/100;
 accuracy*=readiness(attacker.morale);return clamp(accuracy,.002,.93);
}
export function shotDamage(key,range,head,armor,helmet){const gun=WEAPONS[key],raw=gun.damage*gun.rangeModifier**(range/500)*(head?gun.headMultiplier:1),protectedPart=armor>0&&(!head||helmet);if(!protectedPart)return {hp:raw,armor:0};const reduced=raw*Math.min(1,gun.armorRatio/2),cost=(raw-reduced)*.5;if(cost>armor)return {hp:raw-armor*2,armor};return {hp:reduced,armor:cost};}
export function simulateMatch(cards,config,progress=()=>{}){
 validateConfig(cards,config);const c=JSON.parse(JSON.stringify(config)),e=createEconomy(),policies=c.policies;let rng=seededRandom(c.seed),experiment=null;if(c.experiment){const x=c.experiment;if(!EXPERIMENT_POLICIES[x.policy]||!Number.isInteger(x.round)||x.round<1||x.round>48||!Number.isFinite(x.at)||x.at<0||x.at>170||![0,1].includes(x.team)||!String(x.forkSeed).trim())throw Error("Karar deneyi geçersiz.");experiment={...x,applied:false};}
 const people=c.teams.flatMap((team,t)=>team.map((s,i)=>{const card=cards.find(x=>x.id===s.id),pr=profile(s.id,c.overrides?.[s.id],c.clubProfiles?.[s.id]);return {...s,index:i,team:t,name:card.name,card,traits:pr.traits,temperament:pr.temperament,cash:800,morale:100,hp:100,armor:0,helmet:false,kit:false,gun:null,pistol:null,utilityStock:{},stats:{id:s.id,name:card.name,team:t,kills:0,deaths:0,assists:0,damage:0,headshots:0,openingKills:0,trades:0,clutches:0,plants:0,defuses:0,smokeAttempts:0,smokeKills:0,utilityThrows:0,utilityFails:0,pickups:0,saveRounds:0,spent:0}};}));
 const behaviorTiers=c.teams.map(team=>behaviorTier(team.map(slot=>cards.find(card=>card.id===slot.id).overall)));
 const coaches=policies.map(p=>coachState(p.coach,c.overrides?.[p.coach],c.clubProfiles?.[p.coach]));let score=[0,0],rounds=[],loss=[1,1],streak=[0,0],lastPistolLoser=null,lastReason=null,eventSerial=0;const defenseHistory=[[],[]];
 const diagnostics={staticLOSChecks:0,retakeDecisions:0,smokeAttempts:0,smokeKills:0,wallShotsPrevented:0,failedRoutes:0,negativeBalances:0,friendlyLanesHeld:0,movementBlocks:0};
 function legalLOS(a,b){diagnostics.staticLOSChecks++;return lineClear(a,b);}
 for(let rn=1;rn<=Math.min(c.maxRounds??48,48);rn++){
  const overtime=rn>24,tTeam=rn===1&&c.scenario?c.scenario.tTeam:rn<=24?(rn<=12?0:1):Math.floor((rn-25)/3)%2;
  const boundary=rn===1||rn===13||overtime&&(rn-25)%3===0;
  if(boundary){loss=[1,1];lastPistolLoser=null;for(const p of people){for(const slot of ['gun','pistol'])if(p[slot]){p[slot].owner=null;p[slot].ground=null;p[slot]=null;}p.cash=overtime?10000:800;p.armor=0;p.helmet=false;p.kit=false;p.utilityStock={};}}
  // Ground instances expire between rounds. Saved inventory remains unique.
  for(const gun of e.instances.values())if(gun.ground)gun.ground=null;
  const events=[],frames=[],teamMembers=[0,1].map(t=>people.filter(p=>p.team===t));let time=0,smokes=[],grenades=[],groundItems=[],bomb={carrier:null,p:null,plantedAt:null,site:null,plantActor:null,plantProgress:0,defuseActor:null,defuseProgress:0},winner=null,reason='',lastKills=[],damageBy={},waitSince=[null,null],retakeLast=[-100,-100],retakeState=[null,null],retakeCommitted=[false,false],killCount={},teamBombInfo=[null,null],fallbacks=[null,null],fallbackUsed=[new Set(),new Set()],completedOrders=new Map(),observedPressure={a:new Set(),b:new Set()},plantAttemptSerial=0,assignedDefuser=null,retakeCoverAreas=null;
  const macroStrength=teamMembers.map((team,t)=>{const p=policies[t];return p.iglVoice!==false?(team.find(x=>x.id===p.igl)?.traits.igl??30):p.backupMacro?(team.find(x=>x.id===p.secondary)?.traits.secondaryIgl??0)*.55:0;});
  const callError=macroStrength.map(strength=>(rng()-.5)*(1-strength/100)*8);
  const buyModes=teamMembers.map((team,t)=>{if(rn===1||rn===13)return 'pistol';if(lastPistolLoser!==t)return 'full';const forecast=team.every(x=>Math.max(0,x.cash-1900)+RULES.loserBonus[loss[t]]>=4000),assessment=forecast||rng()<(1-macroStrength[t]/100)*.25;return choosePostPistolBuy({players:team.map(x=>({id:x.id,money:x.cash})),forcePackageCost:1900,nextRoundFullBuyIfForceAndLose:assessment,policy:policies[t].tactics}).action;});
  function log(type,text,extra={}){const event={id:'ev-'+(++eventSerial),round:rn,time:Math.round(time*10)/10,type,text,...structuredClone(extra)};events.push(event);return event;}
  function moraleEvent(p,type,extra={}){const change=applyMoraleEvent(p,type,extra);if(change.before!==change.after)log('morale-update',p.name+' moral değişimi: %'+change.before.toFixed(1)+' → %'+change.after.toFixed(1),{actor:p.id,cause:type,resilience:p.traits.resilience,...change});return change;}
  function setGoal(p,id){if(p.goal===id&&p.waypoints?.length)return;const points=routePoints(p.area,id);if(!points.length){diagnostics.failedRoutes++;p.waypoints=[];p.goal=id;return;}p.goal=id;p.waypoints=points.slice(points.length>1||distance(p.p,points[0].p)<1?1:0).map(x=>({...x,p:[...x.p]}));}
  function setBombGoal(p){setGoal(p,nearestArea(bomb.p).id);const last=p.waypoints.at(-1)?.p;if(!last||distance(last,bomb.p)>1)p.waypoints.push({p:[...bomb.p],area:nearestArea(bomb.p).id});}
  function assignRetakeGoals(surviving){
   if(!surviving.some(p=>p.id===assignedDefuser)){
    assignedDefuser=[...surviving].sort((a,b)=>routeLength(a.area,nearestArea(bomb.p).id)/motion(a).speed+(a.kit?5:10)-(routeLength(b.area,nearestArea(bomb.p).id)/motion(b).speed+(b.kit?5:10))||a.index-b.index)[0]?.id;
    if(assignedDefuser)log('defuse-assignment','Bir oyuncu çözmeye, diğerleri alanı korumaya ayrıldı.',{team:ctTeam,actor:assignedDefuser});
   }
   if(!retakeCoverAreas){
    const entry=nearestArea(bomb.p);retakeCoverAreas=[];
    const candidates=NAV.filter(a=>distance(a.p,bomb.p)>=120&&distance(a.p,bomb.p)<=300&&Math.abs(a.p[2]-bomb.p[2])<80).sort((a,b)=>distance(a.p,bomb.p)-distance(b.p,bomb.p)||a.id-b.id);
    for(const a of candidates)if(retakeCoverAreas.every(b=>distance(a.p,b.p)>=64)&&routeLength(entry.id,a.id)<600&&legalLOS(eye(a.p),eye(bomb.p))){retakeCoverAreas.push(a);if(retakeCoverAreas.length===4)break;}
   }
   let index=0;for(const p of surviving){
    if(p.id===assignedDefuser)setBombGoal(p);
    else{const cover=retakeCoverAreas[index++];if(cover){p.retakeCover=cover.id;setGoal(p,cover.id);}else setGoal(p,location(bomb.site==='b'?'b-doors':'a-cross').id);}
   }
  }
  function snapshot(){frames.push({round:rn,time:Math.round(time*10)/10,score:[...score],tTeam,bombKnowledge:teamBombInfo.map(info=>info&&({...info,p:[...info.p]})),smokes:smokes.filter(s=>s.until>time).map(s=>({...s})),bomb:{...bomb,p:bomb.p&&[...bomb.p]},eventsCount:events.length,players:people.map(p=>({id:p.id,team:p.team,side:p.side,p:[...p.p],hp:Math.round(p.hp),armor:Math.round(p.armor),helmet:p.helmet,kit:p.kit,weapon:p.active?.key??'knife',ammo:p.active?.ammo??0,cash:p.cash,morale:Math.round(p.morale*10)/10,action:p.action,move:p.moving,visible:p.known.filter(x=>time-x.time<2).map(x=>({id:x.id,p:[...x.p]})),plantCue:p.plantCue&&({...p.plantCue}),rotationSite:p.rotationSite,rotationSource:p.rotationSource,heard:p.heard.filter(x=>time-x.time<2).map(x=>({...x})),utility:{...p.utilityStock}})),ground:[...e.instances.values()].filter(g=>g.ground).map(g=>({id:g.id,key:g.key,p:[...g.ground]})),items:groundItems.map(g=>({...g,p:[...g.p]})),coaches:coaches.map(k=>({id:k.id,morale:k.morale,energy:k.energy,remaining:k.remaining})),teamMorales:teamMembers.map(teamMorale)});}
  const ctTeam=1-tTeam,adjustment=defenseAdjustment(defenseHistory[ctTeam],{coachAnalysis:coaches[ctTeam].profile.traits.coachAnalysis,igl:macroStrength[ctTeam],minimumObservations:behaviorTiers[ctTeam].patternMinimum,enabled:policies[ctTeam].tactics.earlyRotation===true}),extraDefender=adjustment?c.teams[ctTeam].filter(p=>p.guard!=='mid'&&p.guard!==adjustment.site&&p.authority!=='orders-only'&&!p.orders?.some(o=>o.side==='CT')).at(-1):null;
  if(extraDefender)log('coach-adaptation','Koç son roundlardaki '+adjustment.site.toUpperCase()+' baskısını fark etti: bir ek savunmacı bu alana kaydırılıyor.',{team:ctTeam,actor:extraDefender.id,...adjustment});
  // Restore every slot together before selecting formation positions.
  for(const p of people)Object.assign(p,c.teams[p.team][p.index]);
  if(extraDefender){const p=people.find(p=>p.id===extraDefender.id);p.guard=adjustment.site;p.guardArea=location(adjustment.site==='b'?'b-doors':'a-cross').id;p.guardFacing=location(adjustment.site==='b'?'tunnels':'short').p;}
  for(const p of people){
   const died=p.hp<=0;p.hp=100;p.side=p.team===tTeam?'T':'CT';const spawn=formationAreas(location(p.side==='T'?'t':'ct').id)[p.index]??location(p.side==='T'?'t':'ct');p.area=spawn.id;p.p=[...spawn.p];
   p.known=[];p.radioOutbox=[];p.radioReported=new Set();p.heard=[];p.lootMemory=[];p.target=null;p.shootAt=0;p.reloadingUntil=0;p.deployUntil=0;p.blindUntil=0;p.moving=false;p.waypoints=[];p.goal=null;p.action='Hazırlık';p.damageTaken=false;p.lastShot=-100;p.lastNoise=-100;p.lastUtility=-100;p.sprayCount=0;p.lastSpray=-100;p.fireUntil=0;p.lastVictim=null;p.lastMoveDirection=null;p.clutchOpportunity=false;p.bombSearchSite=null;p.rotationSite=null;p.escapePlan=null;p.escaping=false;p.utilityWaitLogged=false;p.nextUtilityCheck=0;p.fakeReturned=false;p.orderStarted={};p.orderHold=false;p.laneBlockedLogAt=-100;p.plantCue=null;p.reactionPending=null;p.rotationSource=null;p.emergencyRotation=false;
   if(died){p.armor=0;p.helmet=false;p.kit=false;p.utilityStock={};}
   if(!p.pistol)p.pistol=newGun(e,p.side==='T'?'glock':'usp_silencer',p.id);
   const mode=c.scenario?'eco':buyModes[p.team];if(lastPistolLoser===p.team&&p.index===0)log('buy-policy','Takım '+(p.team+1)+' pistol sonrası '+(mode==='eco'?'eco kaldı.':'force seçti.'),{team:p.team,action:mode});
   if(mode!=='eco'&&mode!=='pistol'&&!p.gun){const key=p.role==='awp'&&p.cash>=5750?'awp':mode==='force'||p.cash<3700?(p.side==='CT'?'mp9':'mac10'):(p.side==='CT'?'m4a1_silencer':'ak47');buyGun(e,p,key,rn);}
   if(mode==='pistol'&&p.role==='support'){if(equipment(e,p,'smoke',WEAPONS.smokegrenade.price,rn))p.utilityStock.smoke=1;if(p.side==='CT'&&equipment(e,p,'kit',CATALOG.equipment.kit,rn))p.kit=true;}
   if(mode!=='eco'&&p.armor<60&&equipment(e,p,'armor',CATALOG.equipment.armor,rn))p.armor=100;
   if(mode!=='eco'&&mode!=='pistol'&&!p.helmet&&p.armor>0&&equipment(e,p,'helmet',350,rn))p.helmet=true;
   if(mode!=='eco'&&mode!=='pistol'&&p.side==='CT'&&!p.kit&&equipment(e,p,'kit',400,rn))p.kit=true;
   if(mode!=='eco'&&mode!=='pistol')for(const [type,key] of [['smoke','smokegrenade'],['flash','flashbang'],['he','hegrenade'],['fire',p.side==='T'?'molotov':'incgrenade']])if(!p.utilityStock[type]&&(type===p.utility||p.role==='support'||(p.orders??[]).some(o=>o.side===p.side&&o.kind===type))&&equipment(e,p,type,WEAPONS[key].price,rn))p.utilityStock[type]=1;
   for(const slot of ['gun','pistol'])if(p[slot]){p[slot].ammo=WEAPONS[p[slot].key].clip;p[slot].reserve=WEAPONS[p[slot].key].reserve;}
   p.active=p.gun??p.pistol;p.deployUntil=WEAPONS[p.active.key].deploy;
   const destination=p.side==='CT'?p.guard:policies[p.team].plan==='rush'?'tunnels':policies[p.team].plan==='split'?'short':p.route;
   p.destination=destination;p.attackSite=destination==='tunnels'||destination==='b'?'b':'a';p.routeStage=0;
   p.facing=[...(p.side==='CT'?p.guardFacing:p.routeFacing)??location(p.side==='CT'?(p.guard==='b'?'tunnels':p.guard==='a'?'long':'mid'):destination).p];
   const sameGuard=teamMembers[p.team].filter(x=>x.guard===p.guard),guardSlot=sameGuard.findIndex(x=>x.id===p.id),guardArea=formationAreas(location(destination).id)[guardSlot]?.id??location(destination).id;
   setGoal(p,(p.side==='CT'?p.guardArea:p.routeArea)??(p.side==='CT'?guardArea:location(destination).id));
  }
  bomb.carrier=teamMembers[tTeam][4].id;
  if(rn===1&&c.scenario){for(const p of people)applyScenarioPlayer(p,c.scenario,e);bomb.carrier=null;bomb.p=[...c.scenario.bomb.p];bomb.site=c.scenario.bomb.site;bomb.plantedAt=-c.scenario.bomb.elapsed;teamBombInfo=[0,1].map(()=>({site:bomb.site,p:[...bomb.p],time:0,source:'scenario-assumption'}));log('scenario-start','Kayıtlı konumlarla yaklaşık pozisyon deneyi başladı.',{source:c.scenario.source});}

  log('round-start','Round '+rn+' · Takım '+(tTeam+1)+' T · Tüm hareketler gerçek Dust II navmesh üzerinde.',{startingMorale:teamMembers.map(teamMorale),coaches:coaches.map(x=>({id:x.id,morale:x.morale,energy:x.energy})),defense:teamMembers[1-tTeam].map(p=>({id:p.id,guard:p.guard,area:p.guardArea??p.goal})),loadouts:people.map(p=>({id:p.id,cash:p.cash,gun:p.gun?.key,pistol:p.pistol?.key,utility:p.utilityStock,kit:p.kit}))});
  snapshot();
  function alive(t){return people.filter(p=>p.team===t&&p.hp>0);}
  function fallback(team,type){if(fallbackUsed[team].has(type)||policies[team].fallback!=='regroup'||bomb.plantedAt!==null)return;fallbackUsed[team].add(type);const members=alive(team);if(!members.length)return;const caller=members.find(x=>x.id===policies[team].secondary)??members.find(x=>x.id===policies[team].igl)??members[0],until=time+2+(1-macroStrength[team]/100)*2;fallbacks[team]={until,area:caller.area,type};log('fallback','Takım '+(team+1)+' '+(type==='entry-death'?'giriş oyuncusu düştüğü':'ekipman planı aksadığı')+' için toparlanıyor.',{team,trigger:type,until});}
  function kill(a,b,key,extra={}){
   if(b.hp<=0)return;for(const o of (b.orders??[]).filter(o=>o.side===b.side&&!completedOrders.has(o.id))){completedOrders.set(o.id,'cancelled');log('order-cancel',b.name+' emri iptal edildi: oyuncu elendi.',{actor:b.id,order:o.id});}const friendly=a.team===b.team;b.hp=0;b.stats.deaths++;if(!friendly)a.stats.kills++;else a.stats.kills--;
   killCount[a.id]=(killCount[a.id]??0)+1;a.stats.headshots+=extra.headshot?1:0;
   const event=log(extra.smoke?'smoke-kill':'kill',a.name+' → '+b.name+' · '+WEAPONS[key].label+(extra.headshot?' · kafa vuruşu':''),{actor:a.id,victim:b.id,weapon:key,...extra,friendly});
   if(!friendly)killIncome(e,a,people,key,rn,event.id,time);else transact(e,a,event.id+'-teamkill',-Math.min(300,a.cash),'Takım arkadaşını öldürme',rn,time);
   const assist=Object.entries(damageBy[b.id]??{}).filter(([id,value])=>id!==a.id&&value>=40&&people.find(p=>p.id===id)?.team!==b.team).sort((a,b)=>b[1]-a[1])[0];if(assist)people.find(p=>p.id===assist[0]).stats.assists++;
   if(!lastKills.length&&!friendly){a.stats.openingKills++;event.opening=true;}
   const trade=lastKills.find(k=>k.actor===b.id&&k.team===a.team&&time-k.time<=4);if(trade){a.stats.trades++;moraleEvent(a,'trade');event.trade=true;}
   lastKills.push({actor:a.id,victim:b.id,team:b.team,time,p:[...b.p]});for(const p of people)p.known=p.known.filter(x=>x.id!==b.id);moraleEvent(a,'kill');if(key==='knife')moraleEvent(b,'knife');
   if(killCount[a.id]===3)log('multikill',a.name+' bu round üçüncü killini aldı!',{actor:a.id,kills:3});
   for(const t of [0,1])if(alive(t).length===1&&alive(1-t).length>=2)alive(t)[0].clutchOpportunity=true;
   if(b.index===0)fallback(b.team,'entry-death');
   // Competitive drops the best gun and one held/best grenade, not a cloned
   // full inventory. Kit and bomb are separate world objects.
   const drop=dropGun(e,b,b.p,b.gun?'gun':'pistol');for(const slot of ['gun','pistol'])if(b[slot]){b[slot].owner=null;b[slot].ground=null;b[slot]=null;}
   const grenadeType=['fire','he','smoke','flash'].find(k=>b.utilityStock[k]>0);if(grenadeType)groundItems.push({id:event.id+'-grenade',kind:grenadeType,p:[...b.p]});b.utilityStock={};
   if(b.kit)groundItems.push({id:event.id+'-kit',kind:'kit',p:[...b.p]});b.kit=false;
   if(bomb.carrier===b.id){bomb.carrier=null;bomb.p=[...b.p];log('bomb-drop',b.name+' bombayı düşürdü.',{actor:b.id,p:[...b.p]});}
   if(bomb.plantActor===b.id){bomb.plantActor=null;bomb.plantProgress=0;}if(bomb.defuseActor===b.id){bomb.defuseActor=null;bomb.defuseProgress=0;}
   if(drop)log('weapon-drop',WEAPONS[drop.key].label+' yerde.',{actor:b.id,gun:drop.id,p:[...drop.ground]});
  }
  function damage(a,b,key,amount,extra={}){const applied=Math.min(b.hp,amount);a.stats.damage+=applied;(damageBy[b.id]??={})[a.id]=((damageBy[b.id]??{})[a.id]??0)+applied;if(applied>=b.hp)kill(a,b,key,extra);else b.hp-=applied;b.damageTaken=true;if(b.visible?.some(x=>x.id===a.id))b.facing=[...a.p];}
  function perceive(){
   for(const p of people.filter(x=>x.hp>0)){
    p.visible=[];const facing=p.facing.map((v,k)=>v-p.p[k]),facingLen=Math.hypot(facing[0],facing[1]);
    for(const target of people.filter(x=>x.hp>0&&x.team!==p.team)){
     const dist=distance(p.p,target.p),dx=target.p[0]-p.p[0],dy=target.p[1]-p.p[1],dot=(dx*facing[0]+dy*facing[1])/Math.max(1,Math.hypot(dx,dy)*facingLen);
     if(dist>3600||dist>180&&dot<.3)continue;
     const a=eye(p.p),b=eye(target.p);if(!legalLOS(a,b)||smokeBlocks(a,b,smokes,time)||p.blindUntil>time)continue;
     p.visible.push(target);const index=p.known.findIndex(x=>x.id===target.id),observation={id:target.id,p:[...target.p],area:target.area,time,source:'sight'};if(index<0)p.known.push(observation);else p.known[index]=observation;p.radioOutbox=queueSight(p.radioOutbox,observation,time);
    }
    p.known=p.known.filter(x=>time-x.time<12);if(p.plantCue&&time-p.plantCue.observedAt>PLANT_INTEL_TTL)p.plantCue=null;p.heard=p.heard.filter(x=>time-x.time<4);
    // A plant attempt creates local audio before completion. It is not proof
    // of a planted bomb. Cancelling cannot erase what an opponent already heard.
    const planter=people.find(x=>x.id===bomb.plantActor&&x.hp>0);
    if(bomb.plantedAt===null&&planter&&p.side==='CT'){
     const pathLength=routeLength(p.area,planter.area),cue=Number.isFinite(pathLength)?audiblePlantCue({listener:p,site:bomb.site,now:time,attempt:bomb.attempt,pathLength,previous:p.plantCue}):null;
     if(cue){if(p.plantCue?.attempt!==cue.attempt||p.plantCue.source!=='plant-sound')log('plant-heard',p.name+' '+cue.site.toUpperCase()+' tarafında bomba kurma sesi duydu.',{actor:p.id,team:p.team,site:cue.site,attempt:cue.attempt,pathLength,source:cue.source});p.plantCue=cue;}
    }
    if(bomb.plantedAt!==null&&!teamBombInfo[p.team]&&(p.side==='T'||distance(p.p,bomb.p)<950)){teamBombInfo[p.team]={site:bomb.site,p:[...location(bomb.site).p],time,source:p.side==='T'?'radio':'bomb-sound'};log('bomb-location',p.name+' bomba alanını takımına bildirdi.',{actor:p.id,team:p.team,site:bomb.site});}
    for(const gun of e.instances.values())if(gun.ground&&distance(p.p,gun.ground)<750&&legalLOS(eye(p.p),[gun.ground[0],gun.ground[1],gun.ground[2]+8])&&!smokeBlocks(eye(p.p),gun.ground,smokes,time)){
     const seen={id:gun.id,key:gun.key,p:[...gun.ground],time};const at=p.lootMemory.findIndex(x=>x.id===gun.id);if(at<0)p.lootMemory.push(seen);else p.lootMemory[at]=seen;
    }
   }
   // Teammates send observations, never the world state. Dead players can relay
   // their last legal view but do not continue scouting after death.
   for(let t=0;t<2;t++){const team=teamMembers[t],comms=team.reduce((s,p)=>s+p.traits.communication,0)/500,delay=(1-comms)*.8+(1-coordination(teamMorale(team)))*2;for(const p of team.filter(x=>x.hp>0))for(const friend of team){for(const observation of deliveredSight(friend.radioOutbox,{now:time,delay})){const old=p.known.find(x=>x.id===observation.id);if(!old||old.time<observation.time){p.known=p.known.filter(x=>x.id!==observation.id);p.known.push(observation);if(!p.radioReported.has(observation.id)){p.radioReported.add(observation.id);log('radio-contact',p.name+' rakip konumunu telsizden aldı.',{actor:p.id,reporter:friend.id,enemy:observation.id,observedAt:observation.time,receivedAt:time,reportedPosition:observation.p,delay});}}}const cue=relayPlantCue(friend.plantCue,{now:time,delay});if(cue&&(!p.plantCue||p.plantCue.attempt!==cue.attempt||p.plantCue.source!=='plant-sound'&&p.plantCue.observedAt<cue.observedAt)){if(p.plantCue?.attempt!==cue.attempt)log('plant-radio',p.name+' kurma sesi bilgisini telsizden aldı.',{actor:p.id,team:p.team,site:cue.site,attempt:cue.attempt,receivedAt:cue.receivedAt,source:cue.source});p.plantCue=cue;}for(const observation of friend.lootMemory.filter(x=>time-x.time<2))if(!p.lootMemory.some(x=>x.id===observation.id))p.lootMemory.push({...observation,p:[...observation.p]});}}
  }
  function sound(actor,kind,radius){if(time-actor.lastNoise<.6)return;actor.lastNoise=time;for(const observer of alive(1-actor.team)){if(distance(observer.p,actor.p)>radius)continue;const observation={p:[actor.p[0]+(rng()-.5)*180,actor.p[1]+(rng()-.5)*180,actor.p[2]],time,kind};observer.heard.push(observation);if(!observer.visible?.length)observer.facing=[...observation.p];}}
  function utilityThrow(p,{ordered=false}={}){
   if(!ordered&&p.lastUtility>=0||time<p.lastUtility+1||time<p.throwAt||time<p.nextUtilityCheck||!p.utilityStock[p.utility]||p.visible.length||time<p.deployUntil||bomb.plantedAt!==null)return;
   const key=p.utilityPoint?'custom':utilityTargetKey(p),recent=p.known.filter(x=>time-x.time<4).sort((a,b)=>b.time-a.time)[0];
   if(['he','fire'].includes(p.utility)&&p.utilityTarget==='auto'&&!p.utilityPoint&&!recent)return;
   const target=p.utilityPoint?nearestArea(p.utilityPoint):p.utilityTarget==='auto'&&['he','fire'].includes(p.utility)?nearestArea(recent.p):location(key),dist=distance(p.p,target.p);if(dist>1100)return;
   if(p.utility==='smoke'&&smokes.some(s=>s.until>time+3&&distance(s.p,target.p)<144))return;
   const destination=[target.p[0],target.p[1],target.p[2]+24];
   function arc(end){let last=null;for(const height of [Math.min(300,dist*.22),70,25]){let prev=eye(p.p),clear=true;for(let n=1;n<=12;n++){const x=n/12,next=eye(p.p).map((v,k)=>v+(end[k]-v)*x+(k===2?4*height*x*(1-x):0));if(!legalLOS(prev,next)){clear=false;last=prev;break;}prev=next;}if(clear)return {clear:true,last:end};}return {clear:false,last};}
   if(!arc(destination).clear){p.nextUtilityCheck=time+1;if(!p.utilityWaitLogged){log('utility-wait',p.name+' ekipman için açık bir atış açısı bekliyor.',{actor:p.id,target:key});p.utilityWaitLogged=true;}return;}
   p.utilityStock[p.utility]--;p.lastUtility=time;p.stats.utilityThrows++;
   const skill=p.traits.smokeKnowledge,failed=rng()>(.55+.0042*skill)*readiness(p.morale),jitter=failed?160+220*rng():(100-skill)*.5,angle=rng()*Math.PI*2;
   let landing=[target.p[0]+Math.cos(angle)*jitter,target.p[1]+Math.sin(angle)*jitter,target.p[2]+24],collision=false;
   // Try a legal local throw arc; a low ceiling must not cause every otherwise
   // valid utility assignment to fail. This is still approximate ballistics.
   const trajectory=arc(landing);if(!trajectory.clear){collision=true;landing=trajectory.last??eye(p.p);}
   const gap=failed||collision;if(gap){p.stats.utilityFails++;moraleEvent(p,'utility-fail');}
   const arrival=time+Math.max(.8,dist/800);grenades.push({type:p.utility,p:landing,explodeAt:arrival,actor:p.id,failed:gap});p.deployUntil=arrival+.25;
   log(gap?'utility-fail':'utility-throw',p.name+' '+(p.utility==='smoke'?'smoke':p.utility==='flash'?'flash':p.utility==='he'?'HE':'yanıcı')+(gap?' planı tutmadı; bir açıklık kalabilir.':' hazırladı.'),{actor:p.id,target:target.id,targetKey:key,landing,failed:gap});
   if(gap&&p.side==='T')fallback(p.team,'utility-fail');return true;
  }
  function command(p){
   const orders=(p.orders??[]).filter(o=>o.side===p.side);if(!orders.length)return false;
   for(const o of orders)if(!completedOrders.has(o.id)&&o.trigger==='after-order'&&['failed','cancelled'].includes(completedOrders.get(o.after))){completedOrders.set(o.id,'cancelled');log('order-cancel',p.name+' emri iptal edildi: bağlı emir uygulanamadı.',{actor:p.id,order:o.id});}
   if(bomb.plantedAt!==null){for(const o of orders)if(!completedOrders.has(o.id)){completedOrders.set(o.id,'cancelled');log('order-cancel',p.name+' emri iptal edildi: bomba sonrası karar öncelikli.',{actor:p.id,order:o.id});}return false;}
   if(p.orderHold){p.waypoints=[];p.action='Emir sonrası konum tutuyor';return true;}
   const o=readyOrder(orders,completedOrders,time);if(!o)return false;
   if(p.orderStarted[o.id]==null){p.orderStarted[o.id]=time;log('order-start',p.name+' taktik emrine başladı.',{actor:p.id,order:o.id,kind:o.kind});}
   function finish(status,why){completedOrders.set(o.id,status);p.orderHold=status!=='done'&&o.fallback==='hold';log(status==='done'?'order-done':'order-failed',p.name+' · '+why,{actor:p.id,order:o.id,status});}
   if(time-p.orderStarted[o.id]>30){finish('failed','emir zaman aşımına uğradı');return false;}
   const target=nearestArea(worldFromRadar(o.x,o.y));
   if(o.kind==='move'){if(distance(p.p,target.p)<65){finish('done','hedef konuma ulaştı');return false;}setGoal(p,target.id);move(p,.2);p.action='Taktik emri: ilerle';return true;}
   if(!p.utilityStock[o.kind]){finish('failed','gerekli Utility envanterde yok');return false;}
   if(time<p.deployUntil||time<p.lastUtility+1){p.action='Utility hazırlanıyor';p.moving=false;return true;}
   const previous={utility:p.utility,utilityPoint:p.utilityPoint,utilityTarget:p.utilityTarget,throwAt:p.throwAt};p.utility=o.kind;p.utilityPoint=target.p;p.utilityTarget='auto';p.throwAt=0;
   const thrown=utilityThrow(p,{ordered:true});Object.assign(p,previous);
   if(thrown){finish('done','Utility atış emri uygulandı');return true;}
   setGoal(p,target.id);move(p,.2);p.action='Utility için açı arıyor';return true;
  }
  function chooseRecovery(p){const policy=policies[p.team],chosen=alive(p.team).find(x=>x.id===policy.recovery)??alive(p.team).find(x=>x.id===policy.recoveryBackup);if(chosen?.id!==p.id||policy.loot==='off'||p.visible.length||bomb.defuseActor===p.id)return false;const bombLeft=bomb.plantedAt===null?Infinity:RULES.bombSeconds-(time-bomb.plantedAt);if(bomb.plantedAt!==null&&p.side==='CT')return false;
   const known=p.lootMemory.filter(g=>time-g.time<10&&weaponScore(g.key)>weaponScore(p.gun?.key??p.pistol?.key)&&(!p.known.some(x=>time-x.time<6&&distance(x.p,g.p)<(850-p.risk*4))));
   const best=known.sort((a,b)=>distance(p.p,a.p)-distance(p.p,b.p))[0];if(!best||distance(p.p,best.p)>(policy.loot==='safe'?550:1100))return false;const travel=routeLength(p.area,nearestArea(best.p).id)/180;if(travel+5>bombLeft)return false;
   setGoal(p,nearestArea(best.p).id);p.action='Silah toplama';return true;
  }
  function motion(p){
   const rotating=p.side==='CT'&&(p.rotationSite&&bomb.plantedAt===null||bomb.plantedAt!==null&&(!teamBombInfo[p.team]||distance(p.p,bomb.p)>750)),mode=p.escaping||rotating?'run':p.side==='T'?p.move:p.ctMove,quiet=mode==='shift'||mode==='adaptive'&&(p.known.some(x=>time-x.time<8)||p.heard.length),gun=p.active??p.pistol;
   return {quiet,speed:WEAPONS[gun?.key??'glock'].speed*(quiet?.52:1)};
  }
  function move(p,dt){
   if(!p.waypoints?.length||p.active?.ammo===0&&p.visible.length)return;
   const {quiet,speed}=motion(p),allowance=speed*dt;
   let left=allowance;p.moving=false;
   while(left>0&&p.waypoints.length){const next=p.waypoints[0],dist=distance(p.p,next.p);if(dist<.5){p.area=next.area;p.waypoints.shift();continue;}const step=Math.min(left,dist),before=[...p.p],candidate=p.p.map((v,k)=>v+(next.p[k]-v)*step/dist);if(movementBlocked(p.p,candidate,teamMembers[p.team].filter(x=>x.id!==p.id))){diagnostics.movementBlocks++;const friends=teamMembers[p.team].filter(x=>x.id!==p.id),alternative=avoidanceCandidates(p.p,candidate,p.index%2===0).map(q=>walkableLocalPoint(q,p.area)).find(q=>q&&!movementBlocked(p.p,q.p,friends)&&legalLOS(eye(p.p),eye(q.p)));if(alternative){p.p=alternative.p;p.area=alternative.area;p.moving=true;p.facing=[...next.p];p.lastMoveDirection=p.p.map((v,k)=>v-before[k]);}p.action='Takım arkadaşına yol veriyor';break;}p.p=candidate;p.area=next.area;p.facing=[...next.p];p.lastMoveDirection=p.p.map((v,k)=>v-before[k]);left-=step;p.moving=true;if(step>=dist-.001)p.waypoints.shift();}
   if(p.moving){p.action=quiet?'Sessiz yürüyüş':'Koşu';if(!quiet)sound(p,'footstep',850);else if(time-p.lastNoise>1&&rng()<.0015*(1-p.traits.discipline/100)){sound(p,'mistake',550);log('noise-error',p.name+' sessiz yürüyüşte ses yaptı.',{actor:p.id});}}
  }
  function fire(p,target,dt,smoke=false,aimPoint=null){
   const gun=p.active;if(!gun||p.hp<=0||time<p.deployUntil||time<p.reloadingUntil)return;
   if(distance(p.p,target.p)<65&&(gun.ammo===0&&gun.reserve===0&&(p.pistol?.ammo??0)===0||p.authority==='free'&&p.risk>=85)&&time-p.lastShot>=1.1&&legalLOS(eye(p.p),eye(target.p))){const facing=target.facing.map((v,k)=>v-target.p[k]),approach=p.p.map((v,k)=>v-target.p[k]),behind=facing[0]*approach[0]+facing[1]*approach[1]<0;p.lastShot=time;p.action='Bıçak teması';damage(p,target,'knife',WEAPONS.knife.damage*(behind?3:1.3),{knife:true});return;}
   if(gun.ammo<=0){if(gun.reserve>0){p.reloadingUntil=time+(gun.key==='awp'?3.6:gun.key==='m4a1_silencer'?3.1:2.4);p.reloadGun=gun.id;p.target=null;log('reload',p.name+' şarjör değiştiriyor.',{actor:p.id,gun:gun.key});}else if(p.pistol&&p.pistol!==gun){p.active=p.pistol;p.deployUntil=time+WEAPONS[p.active.key].deploy;}return;}
   if(p.target!==target.id&&!smoke){const trading=lastKills.some(k=>k.actor===target.id&&k.team===p.team&&time-k.time<4),opening=!lastKills.length;const speed=trading?metric(p.card,'trading'):opening?metric(p.card,'opening'):p.traits.discipline;
    const secondary=teamMembers[p.team].find(x=>x.id===policies[p.team].secondary),micro=secondary?.hp>0&&distance(p.p,secondary.p)<750?secondary.traits.secondaryIgl/100:0;
    p.target=target.id;p.shootAt=time+.20+.32*(1-speed/100)*(1-.2*micro)+(1-coordination(teamMorale(teamMembers[p.team])))*.2;
   }
   if(time<p.shootAt)return;
   const blocker=friendlyInShotLane(eye(p.p),eye(aimPoint??target.p),teamMembers[p.team].filter(x=>x.id!==p.id));
   if(blocker){diagnostics.friendlyLanesHeld++;p.action='Atış hattı dolu';const friends=teamMembers[p.team].filter(x=>x.id!==p.id),step=Math.min(32,motion(p).speed*dt),direction=p.p.map((v,k)=>v+(target.p[k]-v)/Math.max(1,distance(p.p,target.p))*step),candidate=avoidanceCandidates(p.p,direction,p.index%2===0).slice(0,4).map(q=>walkableLocalPoint(q,p.area)).find(q=>q&&!movementBlocked(p.p,q.p,friends)&&!friendlyInShotLane(eye(q.p),eye(target.p),friends)&&legalLOS(eye(p.p),eye(q.p))&&legalLOS(eye(q.p),eye(target.p)));if(candidate){p.p=candidate.p;p.area=candidate.area;p.moving=true;p.action='Atış açısı açıyor';diagnostics.laneSidesteps=(diagnostics.laneSidesteps??0)+1;}if(time-p.laneBlockedLogAt>3){p.laneBlockedLogAt=time;log('hold-fire',p.name+' takım arkadaşını vurmamak için ateşi kesti.',{actor:p.id,teammate:blocker.id});}return;}
   const shots=Math.min(gun.ammo,Math.max(1,Math.floor(dt/Math.max(.06,WEAPONS[gun.key].cycle))));if(time-p.lastShot<Math.max(dt,WEAPONS[gun.key].cycle)-.001)return;
   p.lastShot=time;p.action=smoke?'Smoke taraması':'Çatışma';p.facing=[...(aimPoint??target.p)];
   if(!gun.silenced)sound(p,'shot',2200);
   for(let n=0;n<shots&&p.hp>0&&target.hp>0;n++){
    gun.ammo--;const clear=legalLOS(eye(p.p),eye(target.p));if(!clear){diagnostics.wallShotsPrevented++;continue;}
    const rayPoint=aimPoint??target.p;if(smoke&&distance(rayPoint,target.p)>150)continue;
    const blocked=smokeBlocks(eye(p.p),eye(target.p),smokes,time),prob=hitProbability(p,target,{weapon:gun.key,moving:p.moving,blind:p.blindUntil>time,smoke:blocked,distance:distance(p.p,target.p),pressure:alive(p.team).length===1});
    if(rng()>=prob)continue;
    const head=rng()<.10+.20*metric(p.card,'firepower')/100,dmg=shotDamage(gun.key,distance(p.p,target.p),head,target.armor,target.helmet);target.armor=Math.max(0,target.armor-dmg.armor);const before=target.hp;damage(p,target,gun.key,dmg.hp,{headshot:head,smoke:blocked});if(target.hp<=0&&blocked){p.stats.smokeKills++;diagnostics.smokeKills++;}
    if(before>0&&target.hp>0)log('hit',p.name+' → '+target.name+' · '+Math.round(Math.min(before,dmg.hp))+' hasar',{actor:p.id,victim:target.id,damage:Math.min(before,dmg.hp),weapon:gun.key,headshot:head});
   }
  }
  for(time=.2;time<=170&&winner===null;time=Math.round((time+.2)*10)/10){
   smokes=smokes.filter(s=>s.until>time);
   for(const grenade of grenades.filter(g=>g.explodeAt<=time&&!g.done)){grenade.done=true;const actor=people.find(p=>p.id===grenade.actor);
    if(grenade.type==='smoke'){smokes.push({p:[...grenade.p],radius:144,until:time+18,actor:actor.id});log('smoke',actor.name+' smoke’u açıldı.',{actor:actor.id,p:grenade.p,failed:grenade.failed});}
    else if(grenade.type==='flash'){for(const p of people.filter(x=>x.hp>0)){const dist=distance(eye(p.p),grenade.p);if(dist<1150&&legalLOS(eye(p.p),grenade.p)){p.blindUntil=time+Math.max(.3,3.2*(1-dist/1150));log('flash-blind',p.name+' flash yedi.',{actor:actor.id,victim:p.id,duration:p.blindUntil-time});}}}
    else if(grenade.type==='he'){for(const p of people.filter(x=>x.hp>0))if(distance(p.p,grenade.p)<280&&legalLOS(eye(p.p),grenade.p)){const hp=70*(1-distance(p.p,grenade.p)/280)*(p.armor>0?.6:1);damage(actor,p,'hegrenade',hp,{utility:true});}}
    else{grenade.fireUntil=time+6;log('fire',actor.name+' alanı yanıcıyla kapattı.',{actor:actor.id,p:grenade.p});}
   }
   for(const grenade of grenades.filter(g=>g.fireUntil>time))for(const p of people.filter(x=>x.hp>0))if(distance(p.p,grenade.p)<125&&legalLOS(eye(p.p),grenade.p)){damage(people.find(x=>x.id===grenade.actor),p,p.side==='T'?'molotov':'incgrenade',5,{utility:true});if(p.hp>0&&!p.visible?.length)setGoal(p,location(p.side==='T'?'mid':'ct').id);}
   for(const p of people.filter(x=>x.hp>0))if(p.reloadingUntil&&time>=p.reloadingUntil&&p.reloadGun){const gun=e.instances.get(p.reloadGun);if(gun?.owner===p.id){const fill=Math.min(WEAPONS[gun.key].clip-gun.ammo,gun.reserve);gun.ammo+=fill;gun.reserve-=fill;}p.reloadGun=null;p.reloadingUntil=0;}
   perceive();
   // Replay the unchanged prefix in this same engine, then fork in place. No
   // frame reconstruction and no extra enemy knowledge is supplied to agents.
   if(experiment&&!experiment.applied&&rn===experiment.round&&time+1e-6>=experiment.at){
    if(experiment.team!==ctTeam||bomb.plantedAt===null||!teamBombInfo[ctTeam])throw Error('Karar anında doğrulanmış CT bomba bilgisi yok.');
    const {label,...patch}=EXPERIMENT_POLICIES[experiment.policy];policies[ctTeam].tactics={...policies[ctTeam].tactics,...patch};retakeLast[ctTeam]=-100;retakeState[ctTeam]=null;retakeCommitted[ctTeam]=false;
    rng=seededRandom(experiment.forkSeed);experiment.applied=true;experiment.actualAt=time;
    experiment.stateAtFork={bomb:JSON.parse(JSON.stringify(bomb)),smokes:JSON.parse(JSON.stringify(smokes)),knowledge:JSON.parse(JSON.stringify(teamBombInfo)),players:people.map(p=>({id:p.id,p:[...p.p],hp:p.hp,cash:p.cash,morale:p.morale,gun:p.gun&&{...p.gun},pistol:p.pistol&&{...p.pistol},utility:{...p.utilityStock},known:p.known.map(o=>({...o,p:[...o.p]}))}))};
    log('decision-fork','Karar deneyi: '+label,{team:ctTeam,policy:experiment.policy});
   }
   // Club defense may rotate on recent team observations, never hidden T positions.
   // Record only actual team observations, including last legally relayed views.
   for(const p of teamMembers[1-tTeam])for(const o of p.known.filter(o=>time-o.time<4))for(const site of ['a','b'])if(distance(o.p,location(site).p)<1100)observedPressure[site].add(o.id);
   if(bomb.plantedAt===null&&policies[ctTeam].tactics.earlyRotation){
    for(const p of alive(ctTeam)){
     // Each player uses their own perception. Distant teammates cannot act on
     // another player's sight/sound before radio delivery in perceive().
     const tier=behaviorTiers[ctTeam],threat=defensiveThreat({observations:p.known,plantCue:p.plantCue,now:time,centres:{a:location('a').p,b:location('b').p},memorySeconds:tier.observationSeconds});
     if(!shouldSupport({...p,threat})){
      p.reactionPending=null;
      if(p.rotationSite&&p.rotationSource?.startsWith('plant-')&&!threat){p.rotationSite=null;p.rotationSource=null;p.emergencyRotation=false;setGoal(p,p.guardArea??location(p.guard).id);log('support-reset',p.name+' kurma sesi bilgisi eskidiği için savunma alanına dönüyor.',{actor:p.id,team:p.team,source:'expired-plant-cue'});}
      continue;
     }
     const key=threat.site+':'+threat.source+':'+(threat.attempt??'');
     if(p.reactionPending?.key!==key)p.reactionPending={key,since:time};
     const delay=reactionDelay({threat,coachAnalysis:coaches[ctTeam].profile.traits.coachAnalysis,igl:macroStrength[ctTeam],overhead:tier.reactionOverhead});
     if(time-p.reactionPending.since+1e-6<delay||p.rotationSite===threat.site&&(!threat.urgent||p.emergencyRotation))continue;
     p.rotationSite=threat.site;p.rotationSource=threat.source;p.emergencyRotation=threat.urgent;
     setGoal(p,location(threat.site==='b'?'b-doors':'a-cross').id);
     log('support-rotation',p.name+' '+(threat.source==='five-seen'?'beş rakip görüldüğü':threat.source.startsWith('plant-')?'kurma sesi bildirildiği':'rakip baskısı görüldüğü')+' için '+threat.site.toUpperCase()+' desteğine dönüyor.',{actor:p.id,team:p.team,site:threat.site,source:threat.source,observedEnemies:threat.observedEnemies,observedIds:threat.ids,informationAt:p.reactionPending.since,receivedAt:threat.receivedAt??p.reactionPending.since,reactionSeconds:time-p.reactionPending.since,delay,urgent:threat.urgent,tier:tier.level,attempt:threat.attempt});
    }
   }
   if(bomb.plantedAt!==null&&teamBombInfo[1-tTeam]){
    const ct=1-tTeam,left=RULES.bombSeconds-(time-bomb.plantedAt),policy=policies[ct];
    if(time-retakeLast[ct]>=2){retakeLast[ct]=time;diagnostics.retakeDecisions++;const surviving=alive(ct),entry=nearestArea(bomb.p),etas=surviving.map(p=>{const path=p.goal===entry.id&&p.waypoints.length?p.waypoints:[...routePoints(p.area,entry.id).slice(1),{p:bomb.p}],length=remainingPathLength(p.p,path);return {id:p.id,alive:true,hasKit:p.kit,etaToEntrySeconds:retakeEntryEta({distanceToBomb:distance(p.p,bomb.p),pathLength:length,speed:motion(p).speed})};}),minimumTravel=Math.min(...etas.filter(p=>p.etaToEntrySeconds!==null).map(p=>p.etaToEntrySeconds));
     if(waitSince[ct]===null&&surviving.some(p=>atRetakeEntry(distance(p.p,bomb.p))))waitSince[ct]=time;const known=surviving.flatMap(p=>p.known.filter(x=>time-x.time<6)),knownIds=new Set(known.map(x=>x.id));
     const retakePolicy=policy.tactics.ctRetake==='fast-contact'?{...policy.tactics,minimumReady:1,maxWaitSeconds:0}:policy.tactics;
     const active=surviving.find(p=>p.id===bomb.defuseActor),activeDefuse=active?{id:active.id,remainingSeconds:Math.max(0,(active.kit?5:10)-bomb.defuseProgress)}:null;
     const decision=chooseCtRetake({committed:retakeCommitted[ct],activeDefuse,players:etas.map(p=>({...p,etaToEntrySeconds:Number.isFinite(p.etaToEntrySeconds)?Math.max(0,p.etaToEntrySeconds-minimumTravel):null})),secondsRemaining:Math.max(0,left-(activeDefuse?0:Number.isFinite(minimumTravel)?minimumTravel:left)),defuseSecondsWithKit:5,defuseSecondsWithoutKit:10,clearSecondsEstimate:Math.max(2,knownIds.size*1.8+callError[ct]),knownEnemyCount:knownIds.size||null,elapsedWaitingSeconds:waitSince[ct]===null?0:Math.max(0,time-waitSince[ct]),policy:retakePolicy});
     if(retakeState[ct]?.action!==decision.action)log('retake-policy','CT kararı: '+({ 'save-equipment':'save','wait-for-support':'destek bekle','grouped-retake':'birlikte retake','opportunistic-contact':'hızlı temas','continue-defuse':'çözmeye devam'}[decision.action]??decision.action),{team:ct,decision,knownEnemyCount:knownIds.size||null,remaining:left,entryEstimates:etas,waitStarted:waitSince[ct],committed:retakeCommitted[ct]});retakeState[ct]=decision;if(['grouped-retake','opportunistic-contact','continue-defuse'].includes(decision.action))retakeCommitted[ct]=true;
     for(const p of surviving){if(decision.action==='save-equipment'){p.escapePlan??=escapeDestination(p.p,p.area,bomb.p);p.escaping=true;setGoal(p,p.escapePlan.id);p.action='Save';}else p.escaping=false;}if(decision.action!=='save-equipment')assignRetakeGoals(surviving);
    }
   }
   for(const p of shuffled(people.filter(x=>x.hp>0),rng)){
    if(p.hp<=0)continue;p.damageTaken=false;
    if(bomb.plantedAt!==null){
     const left=RULES.bombSeconds-(time-bomb.plantedAt);
     if(!p.escapePlan||p.escapePlan.length===0&&distance(p.p,bomb.p)<950)p.escapePlan=escapeDestination(p.p,p.area,bomb.p);
     const escapeSeconds=routeLength(p.area,p.escapePlan.id)/Math.max(1,WEAPONS[p.active?.key??'glock'].speed)*1.25+4.5;
     const seenDefuser=bomb.defuseActor&&p.visible.some(x=>x.id===bomb.defuseActor&&x.hp>0);
     if(p.side==='T'&&!seenDefuser&&(p.escaping||left<=escapeSeconds)||p.side==='CT'&&retakeState[p.team]?.action==='save-equipment'){
      if(!p.escaping){p.escaping=true;log('bomb-escape',p.name+' bomba patlamadan güvenli mesafeye çekiliyor.',{actor:p.id,remaining:left,escapeSeconds,destination:p.escapePlan.id});}
      if(distance(p.p,bomb.p)<=950)setGoal(p,p.escapePlan.id);else p.waypoints=[];
      move(p,.2);const threat=p.visible.filter(x=>x.hp>0).sort((a,b)=>distance(p.p,a.p)-distance(p.p,b.p))[0];if(threat)fire(p,threat,.2);p.action=p.side==='T'?'Patlamadan uzaklaşıyor':'Save · güvenli mesafe';continue;
     }
    }
    const target=p.visible.filter(x=>x.hp>0).sort((a,b)=>distance(p.p,a.p)-distance(p.p,b.p))[0];
    if(target){p.action='Temas';p.moving=false;fire(p,target,.2);continue;}
    p.target=null;
    const fresh=[...p.known.filter(x=>time-x.time<3),...p.heard.filter(x=>time-x.time<2)].sort((a,b)=>b.time-a.time)[0];
    if(fresh&&!friendlyInShotLane(eye(p.p),eye(fresh.p),teamMembers[p.team].filter(x=>x.id!==p.id))&&p.sprayCount<2&&time-p.lastSpray>3&&p.active?.ammo>=4&&smokeBlocks(eye(p.p),eye(fresh.p),smokes,time)&&legalLOS(eye(p.p),eye(fresh.p))){
     p.lastSpray=time;p.sprayCount++;p.stats.smokeAttempts++;diagnostics.smokeAttempts++;const probability=smokeAttemptProbability({skill:metric(p.card,'firepower'),morale:p.morale}),roll=rng();p.active.ammo-=4;p.lastShot=time;sound(p,'shot',2200);log('smoke-attempt',p.name+' son bilginin olduğu smoke’a tarama denedi.',{actor:p.id,aim:[...fresh.p],attemptProbability:probability,probabilityVersion:PROBABILITY_VERSION});const candidate=people.filter(x=>x.team!==p.team&&x.hp>0&&distance(x.p,fresh.p)<150).sort((a,b)=>distance(a.p,fresh.p)-distance(b.p,fresh.p))[0];if(candidate&&roll<probability&&legalLOS(eye(p.p),eye(candidate.p))){damage(p,candidate,p.active.key,candidate.hp,{smoke:true,attempt:true});p.stats.smokeKills++;diagnostics.smokeKills++;}continue;
    }
    if(!(p.side==='CT'&&p.emergencyRotation&&bomb.plantedAt===null)&&command(p))continue;
    // An assigned Utility order reserves the player's throw until it resolves.
    if(!(p.orders??[]).some(o=>o.side===p.side&&o.kind!=='move'&&!completedOrders.has(o.id)))utilityThrow(p);
    if(p.fakeReturn&&p.side==='T'&&!p.fakeReturned&&(p.lastUtility>=0||time>40)&&bomb.plantedAt===null){p.fakeReturned=true;p.attackSite='b';p.destination='tunnels';setGoal(p,location('tunnels').id);log('fake-return',p.name+' A gösteriminden sonra B rotasına döndü.',{actor:p.id});}
    for(const memory of p.lootMemory.filter(g=>distance(p.p,g.p)<72&&time-g.time<10)){const gun=e.instances.get(memory.id);if(gun&&weaponScore(gun.key)>weaponScore(p.gun?.key??p.pistol?.key)&&pickupGun(e,p,gun,p.p,72,legalLOS(eye(p.p),[...gun.ground??p.p].map((v,k)=>k===2?v+8:v)))){p.stats.pickups++;p.active=p.gun??p.pistol;p.deployUntil=time+WEAPONS[p.active.key].deploy;log('pickup',p.name+' yerden aldı: '+WEAPONS[gun.key].label,{actor:p.id,gun:gun.id,key:gun.key});}}
    for(const item of groundItems.filter(g=>distance(p.p,g.p)<64&&legalLOS(eye(p.p),[g.p[0],g.p[1],g.p[2]+8]))){if(item.kind==='kit'&&p.side==='CT'&&!p.kit){p.kit=true;groundItems=groundItems.filter(g=>g.id!==item.id);log('kit-pickup',p.name+' defuse kitini aldı.',{actor:p.id});}else if(item.kind!=='kit'&&!p.utilityStock[item.kind]){p.utilityStock[item.kind]=1;groundItems=groundItems.filter(g=>g.id!==item.id);log('grenade-pickup',p.name+' el bombasını aldı.',{actor:p.id});}}
    if(bomb.plantedAt===null&&p.side==='T'){
     if(!bomb.carrier&&bomb.p){const observed=distance(p.p,bomb.p)<700&&legalLOS(eye(p.p),[bomb.p[0],bomb.p[1],bomb.p[2]+8]);if(observed){setGoal(p,nearestArea(bomb.p).id);if(distance(p.p,bomb.p)<70){bomb.carrier=p.id;bomb.p=null;log('bomb-pickup',p.name+' bombayı aldı.',{actor:p.id});}}}
     const inSite=['a','b'].find(s=>distance(p.p,location(s).p)<200);
     if(bomb.carrier===p.id&&inSite){if(bomb.plantActor!==p.id){bomb.attempt='plant-'+rn+'-'+(++plantAttemptSerial);log('plant-start',p.name+' bombayı kurmaya başladı.',{actor:p.id,site:inSite,attempt:bomb.attempt});}bomb.plantActor=p.id;bomb.site=inSite;bomb.plantProgress+=.2;p.action='Bomba kuruluyor';p.moving=false;if(bomb.plantProgress>=RULES.plantSeconds){bomb.plantedAt=time;bomb.p=[...p.p];bomb.carrier=null;p.stats.plants++;transact(e,p,'plant-'+rn,300,'Bomba kurma',rn,time);log('plant',p.name+' '+LOCATIONS[inSite].label+' bombayı kurdu.',{actor:p.id,p:[...p.p],site:inSite});}continue;}
     if(bomb.plantActor===p.id){bomb.plantActor=null;bomb.plantProgress=0;}
     if(p.initiative===0){p.action='Temas bekliyor';p.moving=false;continue;}
     if(fallbacks[p.team]?.until>time){setGoal(p,fallbacks[p.team].area);move(p,.2);p.action='Toparlanıyor';continue;}
     if(!p.waypoints.length){p.routeStage++;setGoal(p,location(p.attackSite).id);}
     const leader=teamMembers[p.team].find(x=>x.id===policies[p.team].igl),macro=leader?.traits.igl??30;
     const knownRisk=p.known.some(x=>time-x.time<7&&distance(x.p,location(p.attackSite).p)<500);
     if(knownRisk&&policies[p.team].fallback==='rotate'&&p.authority!=='orders-only'&&macro>60&&time<60){p.attackSite=p.attackSite==='a'?'b':'a';setGoal(p,location(p.attackSite).id);log('rotate',p.name+' son bilgiye göre yön değiştirdi.',{actor:p.id,site:p.attackSite});}
     if(time<Math.max(0,p.startAt??(100-p.initiative)*.12)){p.action='Plan zamanı bekleniyor';continue;}
    }else if(bomb.plantedAt!==null&&p.side==='CT'&&!teamBombInfo[p.team]){
     // The global planted announcement reveals no site. Check an assigned site
     // before the nearby bomb sound supplies its actual position to the team.
     if(!p.bombSearchSite){const search=chooseBombSearchSite({guard:p.guard,index:p.index,rotationSite:p.rotationSite,observations:teamMembers[p.team].flatMap(x=>x.known),now:time,centres:{a:location('a').p,b:location('b').p}});p.bombSearchSite=search.site;log('bomb-search',p.name+' '+search.site.toUpperCase()+' alanını kontrol ediyor.',{actor:p.id,team:p.team,...search});}
     if(distance(p.p,location(p.bombSearchSite).p)<300)p.bombSearchSite=p.bombSearchSite==='a'?'b':'a';
     setGoal(p,location(p.bombSearchSite).id);p.action='Bomba alanı araştırılıyor';
    }else if(bomb.plantedAt!==null&&p.side==='CT'&&retakeState[p.team]?.action!=='save-equipment'){
     if(policies[p.team].tactics.ctRetake==='grouped'&&retakeState[p.team]?.action==='wait-for-support'&&atRetakeEntry(distance(p.p,bomb.p))){p.action='Destek bekleniyor';p.moving=false;continue;}
     const dist=distance(p.p,bomb.p),liveCT=alive(p.team),defuser=liveCT.find(x=>x.id===assignedDefuser&&distance(x.p,bomb.p)<90&&legalLOS(eye(x.p),[bomb.p[0],bomb.p[1],bomb.p[2]+8]));
     if(dist<90&&defuser?.id===p.id){if(bomb.defuseActor!==p.id){bomb.defuseActor=p.id;bomb.defuseProgress=0;log('defuse-start',p.name+' '+(p.kit?'kitle ':'')+'çözmeye başladı.',{actor:p.id,kit:p.kit});}bomb.defuseProgress+=.2;p.action='Bomba çözülüyor';p.moving=false;if(bomb.defuseProgress>=(p.kit?5:10)){winner=p.team;reason='defuse';p.stats.defuses++;transact(e,p,'defuse-'+rn,300,'Bomba çözme',rn,time);log('defuse',p.name+' bombayı çözdü.',{actor:p.id});}continue;}
     if(p.id!==assignedDefuser&&!p.waypoints.length){p.action='Çözen oyuncuyu koruyor';p.facing=location(bomb.site==='b'?'tunnels':'short').p;continue;}
    }else if(bomb.plantedAt!==null&&p.side==='T'){
     if(policies[p.team].postPlant==='hold'){if(distance(p.p,bomb.p)>700){setGoal(p,location(bomb.site==='b'?'b-doors':'a-cross').id);move(p,.2);p.action='Bombaya destek';}else{p.waypoints=[];p.action='Bombayı koruyor';p.facing=location(bomb.site==='b'?'b-doors':'ct').p;}continue;}
    }
    if(p.side==='CT'&&bomb.plantedAt===null&&!p.waypoints.length){p.action='Alanı tutuyor';if(fresh&&!p.ctHold&&p.authority!=='orders-only'&&p.initiative>50){setGoal(p,nearestArea(fresh.p).id);}else p.facing=!p.rotationSite&&p.guardFacing?p.guardFacing:location((p.rotationSite??p.guard)==='b'?'tunnels':(p.rotationSite??p.guard)==='a'?'long':'mid').p;}
    if(!chooseRecovery(p)&&bomb.plantedAt!==null&&retakeState[p.team]?.action==='save-equipment')p.action='Save';
    move(p,.2);
   }
   // A cancelled plant/defuse loses progress. No transferable objective timer.
   if(bomb.plantActor&&!people.some(p=>p.id===bomb.plantActor&&p.hp>0&&p.action==='Bomba kuruluyor')){bomb.plantActor=null;bomb.plantProgress=0;}
   if(bomb.defuseActor&&!people.some(p=>p.id===bomb.defuseActor&&p.hp>0&&p.action==='Bomba çözülüyor')){bomb.defuseActor=null;bomb.defuseProgress=0;}
   if(winner===null){if(!alive(1-tTeam).length){winner=tTeam;reason='elimination';}else if(!alive(tTeam).length&&bomb.plantedAt===null){winner=1-tTeam;reason='elimination';}else if(bomb.plantedAt!==null&&time-bomb.plantedAt>=40){winner=tTeam;reason='bomb';log('bomb-explode','Bomba patladı.',{site:bomb.site});}else if(bomb.plantedAt===null&&time>=115.2){winner=1-tTeam;reason='time';}}
   if(Math.round(time*10)%10===0||winner!==null)snapshot();
  }
  if(winner===null){winner=1-tTeam;reason='time';log('clock-cap','Teknik süre sınırı: CT roundu aldı.');}
  // Round result is fixed before the post-round escape/hunt window.
  score[winner]++;log('round-result','Takım '+(winner+1)+' roundu aldı · '+({elimination:'eleme',bomb:'patlama',defuse:'çözme',time:'süre'}[reason]),{winner,reason,score:[...score]});
  const survivingAtResult=alive(winner);if(survivingAtResult.length===1&&survivingAtResult[0].clutchOpportunity){const p=survivingAtResult[0];p.stats.clutches++;moraleEvent(p,'clutch');log('clutch',p.name+' yalnız kaldığı roundu tamamladı.',{actor:p.id});}
  if(reason==='bomb'&&bomb.p)for(const p of people.filter(x=>x.hp>0&&distance(x.p,bomb.p)<600)){p.hp=0;p.stats.deaths++;const dropped=dropGun(e,p,p.p,p.gun?'gun':'pistol');for(const slot of ['gun','pistol'])if(p[slot]){p[slot].owner=null;p[slot].ground=null;p[slot]=null;}log('blast-death',p.name+' patlamadan kaçamadı.',{victim:p.id,gun:dropped?.id});}
  const fixedScore=[...score],postStart=time;
  for(let post=.2;post<=5;post=Math.round((post+.2)*10)/10){time=postStart+post;perceive();
   for(let t=0;t<2;t++){const policy=policies[t],hunter=alive(t).find(p=>p.id===policy.hunter)??alive(t).find(p=>p.id===policy.hunterBackup);
    for(const p of alive(t)){const enemy=p.visible.filter(x=>x.hp>0).sort((a,b)=>distance(p.p,a.p)-distance(p.p,b.p))[0];if(enemy&&policy.hunt!=='off'){fire(p,enemy,.2);continue;}
     const information=p.known.filter(x=>time-x.time<5).sort((a,b)=>b.time-a.time)[0];if(p.id===hunter?.id&&policy.hunt==='aggressive'&&information&&p.hp>35&&p.active?.ammo>5&&p.risk>=40){setGoal(p,nearestArea(information.p).id);p.action='Save avı';}else if(t!==winner){setGoal(p,location(p.side==='T'?'t':'ct').id);p.action='Save';}chooseRecovery(p);move(p,.2);
    }
   }if(Math.round(post*10)%10===0)snapshot();
  }
  const evidence={round:rn,observed:{a:observedPressure.a.size,b:observedPressure.b.size},confirmedSite:teamBombInfo[1-tTeam]?.site??null};
  defenseHistory[1-tTeam]=recordDefenseRound(defenseHistory[1-tTeam],evidence);
  log('coach-intel','Koç savunma gözlemlerini kaydetti.',{team:1-tTeam,model:OPPONENT_MODEL_VERSION,evidence});
  settle(e,people,winner,reason,bomb.plantedAt!==null,rn,loss);
  for(let t=0;t<2;t++){streak[t]=t===winner?0:streak[t]+1;const coaching=betweenRounds(teamMembers[t],coaches[t],policies[t],policies[t].morale,{round:rn,lost:t!==winner,pistol:rn===1||rn===13,streak:streak[t]},rng);for(const event of coaching)log(event.type,event.text,event);}
  for(const p of people){if(p.hp>0&&p.gun)p.stats.saveRounds++;const personal=e.transactions.filter(x=>x.round===rn&&x.player===p.id&&x.amount<0);p.stats.spent+=personal.reduce((s,x)=>s-x.amount,0);if(p.hp<=0){p.active=null;p.armor=0;p.helmet=false;p.kit=false;p.utilityStock={};}}
  validateOwnership(e,people);score=fixedScore;snapshot();
  rounds.push({number:rn,tTeam,winner,reason,score:[...score],duration:time,events,frames,balances:people.map(p=>({id:p.id,cash:p.cash,morale:p.morale,weapon:p.gun?.key??p.pistol?.key??null,alive:p.hp>0})),coaches:coaches.map(x=>({id:x.id,morale:x.morale,energy:x.energy,remaining:x.remaining}))});
  lastPistolLoser=rn===1||rn===13?1-winner:null;lastReason=reason;progress({round:rn,score:[...score]});
  const target=rn<=24?13:16+Math.floor((rn-25)/6)*3;
  if(Math.max(...score)>=target&&(rn<=24||Math.abs(score[0]-score[1])>=2))break;
 }
 return {engineHash:ENGINE_BUILD,cardsSnapshot:structuredClone(cards),experiment,radioVersion:RADIO_VERSION,behaviorVersion:BEHAVIOR_VERSION,behaviorTiers,reactionVersion:REACTION_VERSION,opponentModelVersion:OPPONENT_MODEL_VERSION,defenseHistory,probabilityVersion:PROBABILITY_VERSION,version:VERSION,mapVersion:MAP_VERSION,catalogVersion:CATALOG.version,classification:'experimental-local-simulation',seed:c.seed,configuration:c,score,winner:score[0]===score[1]?null:score[0]>score[1]?0:1,rounds,players:people.map(p=>({...p.stats,damage:Math.round(p.stats.damage),cash:p.cash,morale:Math.round(p.morale),weapon:p.gun?.key??null})),coaches:coaches.map(k=>({id:k.id,morale:k.morale,energy:k.energy,history:k.history,remaining:k.remaining})),transactions:e.transactions,diagnostics,limitations:CATALOG.limitations};
}
