import snapshot from './traits.json' with {type:'json'};
import {previewMoraleLoss,previewCoachTalk,readiness,coordination,DEFAULT_POLICY} from './morale-design.js';
export {readiness,coordination};
export const TRAITS=snapshot.records;
export const TRAIT_LABELS={igl:'Ana IGL',secondaryIgl:'İkinci IGL',coach:'Koç',tactics:'Taktik',motivation:'Motivasyon',resilience:'Direnç',communication:'İletişim',discipline:'Disiplin',smokeKnowledge:'Smoke bilgisi',coachAnalysis:'Analiz'};
const clamp=x=>Math.max(0,Math.min(100,x));
export function profile(id,overrides={},clubProfile){const record=TRAITS.find(p=>p.id===id)??clubProfile;if(!record)throw Error('Özellik ataması eksik: '+id);return {...record,traits:{...record.traits,...overrides}};}
export function coachState(id,overrides,clubProfile){return {id,profile:profile(id,overrides,clubProfile),morale:100,energy:100,remaining:3,lowRounds:0,lastTimeout:-100,lastIgl:-100,teamArmed:true,individualArmed:{},talkCounts:{},history:[]};}
export function teamMorale(players){return players.reduce((s,p)=>s+p.morale,0)/players.length;}
export function moraleEvent(player,type,extra={}){const before=player.morale;if(type==='loss')player.morale=previewMoraleLoss({morale:before,resilience:player.traits.resilience,temperament:player.temperament,roundLost:true,...extra}).after;else if(type==='knife')player.morale=previewMoraleLoss({morale:before,resilience:player.traits.resilience,temperament:player.temperament,knifed:true}).after;else if(type==='utility-fail')player.morale=clamp(before-3*(1.2-.6*player.traits.resilience/100));else player.morale=clamp(before+({win:4,clutch:6,trade:2,kill:1}[type]??0));return {before,after:player.morale};}
export function betweenRounds(players,coach,leadership,policy,context,random){
 const p={...DEFAULT_POLICY,...policy},events=[],round=context.round,beforePlayers=new Map(players.map(p=>[p.id,p.morale]));
 if(context.lost){for(const player of players)moraleEvent(player,'loss',{pistolLost:context.pistol,streak:context.streak});coach.morale=clamp(coach.morale-(3+Math.min(4,context.streak))*(1.2-.6*coach.profile.traits.resilience/100));}
 else{for(const player of players)moraleEvent(player,'win');coach.morale=clamp(coach.morale+3);coach.energy=clamp(coach.energy+4);}
 for(const player of players)if(beforePlayers.get(player.id)!==player.morale)events.push({type:'morale-update',actor:player.id,cause:context.lost?'loss':'win',before:beforePlayers.get(player.id),after:player.morale,resilience:player.traits.resilience,text:player.name+' round sonucu moral değişimi.'});
 const mean=teamMorale(players);coach.lowRounds=mean<p.teamTriggerBelow?coach.lowRounds+1:0;
 if(mean>=p.teamRearmAt)coach.teamArmed=true;
 for(const player of players)if(player.morale>=p.individualRearmAt)coach.individualArmed[player.id]=true;
 // Death doesn't disable the voice channel. Macro authority stays with the
 // designated IGL unless communications were explicitly disabled pre-match.
 const igl=players.find(x=>x.id===leadership.igl),backup=players.find(x=>x.id===leadership.secondary);
 const caller=leadership.iglVoice!==false?igl:leadership.backupMacro?backup:null;
 if(caller&&round-coach.lastIgl>=p.iglCooldownRounds&&((context.lost&&context.pistol&&p.iglOnPistolLoss)||mean<p.iglTriggerBelow)){
  const strength=caller===igl?caller.traits.igl:caller.traits.secondaryIgl*.55;
  const gains=players.map(x=>{const before=x.morale;x.morale=clamp(before+7*strength/100*readiness(caller.morale)*(.9+.2*random()));return {id:x.id,before,after:x.morale};});
  coach.lastIgl=round;events.push({type:'igl-talk',actor:caller.id,text:caller.name+' kısa bir takım konuşması yaptı.',gains,macroStrength:strength});
 }
 const individual=players.filter(x=>x.morale<p.individualTriggerBelow&&coach.individualArmed[x.id]!==false).sort((a,b)=>a.morale-b.morale)[0];
 const kind=individual?'individual':coach.teamArmed&&teamMorale(players)<p.teamTriggerBelow&&coach.lowRounds>=p.teamConsecutiveLowRounds?'team':null;
 if(kind&&coach.remaining>0&&round-coach.lastTimeout>=p.timeoutCooldownRounds&&coach.energy>=p.talkEnergyCost){
  const family=policy?.talkType??'motivation',key=family+':'+kind,repeat=coach.talkCounts[key]??0,targets=individual?[individual]:players;
  const gains=targets.map(x=>{const talk=previewCoachTalk({morale:x.morale,coachMotivation:coach.profile.traits.motivation*(.75+.25*coach.profile.traits.coach/100),coachMorale:coach.morale,energy:coach.energy,repeat,fit:family==='analysis'?.75+.25*coach.profile.traits.coachAnalysis/100:1,trust:.8+.2*x.traits.communication/100,jitter:.9+.2*random()});const before=x.morale;x.morale=talk.after;return {id:x.id,before,after:x.morale};});
  coach.energy=Math.max(0,coach.energy-p.talkEnergyCost);coach.remaining--;coach.lastTimeout=round;coach.talkCounts[key]=repeat+1;
  if(individual)coach.individualArmed[individual.id]=false;else coach.teamArmed=false;
  const event={type:'coach-talk',actor:coach.id,kind,repeat,coachMorale:coach.morale,energy:coach.energy,remaining:coach.remaining,gains,text:individual?'Koç, '+individual.name+' ile birebir konuştu.':'Koç takım için taktik mola aldı.'};events.push(event);coach.history.push({...event,round});
 }
 return events;
}
