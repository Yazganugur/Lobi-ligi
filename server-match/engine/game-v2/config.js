import {validateScenario} from './scenario.js';
import {normalizeOrders} from '../tactical-orders.js';
import {eligibleGameCards,initialDraft as oldDraft} from '../game-lab-model.js';
import {LOCATIONS,area} from './navigation.js';
import {TRAITS} from './morale.js';
import {DEFAULT_TACTICAL_POLICY} from './tactical-policy.js';
export const VERSION='lobi-tactics-v2.7';
export const UTILITY_TARGET_LABELS={auto:'Otomatik · taktiğe göre',doors:'Mid kapıları','a-cross':'A · CT geçişi',short:'A · short girişi','b-doors':'B · kapı girişi','b-tunnel':'B · tünel çıkışı',long:'Long',tunnels:'Üst tünel',a:'A alanı',b:'B alanı'};
export const ROLE_LABELS={rifle:'Tüfek',awp:'AWP',support:'Destek'};
export const PLAN_LABELS={default:'Kontrollü dağılım',rush:'Hızlı B',split:'Mid + short'};
export const MOVE_LABELS={run:'Koş',shift:'Sessiz yürü',adaptive:'Temasta sessiz'};
export function initialDraft(cards){
 const teams=oldDraft(cards).map(t=>t.map((p,i)=>({...p,move:'adaptive',authority:'local-adjustment',risk:50,route:i<2?'long':i===2?'short':'tunnels',utility:i===0||i===2?'flash':i===4?'he':'smoke',utilityTarget:'auto',throwAt:16+i*2,guard:p.zone,ctMove:'adaptive'})));
 const free=eligibleGameCards(cards).filter(c=>!teams.flat().some(p=>p.id===c.id));
 return {teams,coaches:free.slice(0,2).map(p=>p.id)};
}
export function defaultTeamPolicy(team,cards,coach){const ids=team.map(p=>p.id),recommended=TRAITS.filter(p=>ids.includes(p.id)&&p.roleProfile.primaryRecommended).sort((a,b)=>b.traits.igl-a.traits.igl),secondary=TRAITS.filter(p=>ids.includes(p.id)&&p.roleProfile.secondaryRecommended).sort((a,b)=>b.traits.secondaryIgl-a.traits.secondaryIgl);return {plan:'default',igl:recommended[0]?.id??ids[0],secondary:secondary.find(p=>p.id!==(recommended[0]?.id??ids[0]))?.id??'',coach,iglVoice:true,backupMacro:true,tactics:{...DEFAULT_TACTICAL_POLICY},morale:{teamTriggerBelow:60,individualTriggerBelow:35,iglTriggerBelow:65,teamConsecutiveLowRounds:2,timeoutCooldownRounds:2,talkType:'motivation'},hunter:team[0]?.id,hunterBackup:team[1]?.id,recovery:team[4]?.id,recoveryBackup:team[3]?.id,hunt:'safe',loot:'safe',fallback:'regroup',postPlant:'hold'};}
export function initialConfig(cards,draft=initialDraft(cards)){return {seed:'dust2-gecesi',teams:draft.teams,policies:draft.teams.map((t,i)=>defaultTeamPolicy(t,cards,draft.coaches[i])),overrides:{},maxRounds:48};}
export function replacePlayer(configuration,team,index,newId){
 const c=JSON.parse(JSON.stringify(configuration)),oldId=c.teams[team][index].id;
 if(oldId===newId)return c;
 const swap=id=>id===oldId?newId:id===newId?oldId:id;
 c.teams=c.teams.map(tm=>tm.map(p=>({...p,id:swap(p.id),orders:(p.orders??[]).map(o=>({...o,actor:swap(o.actor)}))})));
 c.policies=c.policies.map(p=>({...p,...Object.fromEntries(['igl','secondary','coach','hunter','hunterBackup','recovery','recoveryBackup'].map(k=>[k,swap(p[k])]))}));
 return c;
}
export function validateConfig(cards,c){
 validateScenario(c?.scenario);
 if(!c||!Array.isArray(c.teams)||c.teams.length!==2||c.teams.some(t=>t.length!==5))throw Error('Her takımda beş oyuncu gerekiyor.');
 const ids=c.teams.flat().map(p=>p.id),coaches=c.policies?.map(p=>p.coach)??[];
 if(coaches.length!==2||new Set([...ids,...coaches]).size!==12)throw Error('10 oyuncu ve 2 farklı koç seç. Aynı kişi iki görev üstlenemez.');
 const allowed=new Set(eligibleGameCards(cards).map(p=>p.id));if([...ids,...coaches].some(id=>!allowed.has(id)||!TRAITS.some(p=>p.id===id)&&!(id.startsWith('club:')&&cards.find(p=>p.id===id)?.clubCard&&c.clubProfiles?.[id]?.id===id)))throw Error('Uygun kart veya özellik ataması yok.');
 for(const p of Object.values(c.clubProfiles??{})){for(const key of ['igl','secondaryIgl','coach','tactics','motivation','resilience','communication','discipline','smokeKnowledge','coachAnalysis'])if(!Number.isFinite(p.traits?.[key])||p.traits[key]<0||p.traits[key]>100)throw Error('Kulüp özelliği geçersiz.');for(const key of ['generalLossFactor','pistolSensitivity','knifeSensitivity','streakSensitivity'])if(!Number.isFinite(p.temperament?.[key])||p.temperament[key]<.5||p.temperament[key]>1.5)throw Error('Kulüp moral profili geçersiz.');}
 if(!String(c.seed).trim()||String(c.seed).length>80)throw Error('Deney kodunu 1–80 karakter arasında yaz.');
 for(let t=0;t<2;t++){const p=c.policies[t];if(!c.teams[t].some(x=>x.id===p.igl)||p.secondary&&!c.teams[t].some(x=>x.id===p.secondary)||p.igl===p.secondary)throw Error('Ana ve ikinci IGL kadrodaki farklı oyuncular olmalı.');if(!PLAN_LABELS[p.plan])throw Error('Takım planı geçersiz.');for(const slot of c.teams[t]){if(!ROLE_LABELS[slot.role]||!LOCATIONS[slot.route]||!LOCATIONS[slot.guard]||!MOVE_LABELS[slot.move]||!MOVE_LABELS[slot.ctMove]||!UTILITY_TARGET_LABELS[slot.utilityTarget]||!['smoke','flash','he','fire'].includes(slot.utility)||!['orders-only','local-adjustment','free'].includes(slot.authority)||!Number.isFinite(slot.initiative)||slot.initiative<0||slot.initiative>100||!Number.isFinite(slot.risk)||slot.risk<0||slot.risk>100||!Number.isFinite(slot.throwAt)||slot.throwAt<0||slot.throwAt>100||slot.startAt!=null&&(!Number.isFinite(slot.startAt)||slot.startAt<0||slot.startAt>100)||[slot.routeArea,slot.guardArea].some(id=>id!=null&&!area(id)))throw Error('Oyuncu planı geçersiz.');}
  for(const key of ['hunter','hunterBackup','recovery','recoveryBackup'])if(p[key]&&!c.teams[t].some(x=>x.id===p[key]))throw Error('Save görevi kadrodaki oyuncuya verilmelidir.');
  for(const key of ['teamTriggerBelow','individualTriggerBelow','iglTriggerBelow'])if(!Number.isFinite(p.morale[key])||p.morale[key]<0||p.morale[key]>100)throw Error('Moral eşiği geçersiz.');
 }
 normalizeOrders(c.teams.flat().flatMap(p=>p.orders??[]),ids);for(const team of c.teams){normalizeOrders(team.flatMap(p=>p.orders??[]),team.map(p=>p.id));for(const p of team)if((p.orders??[]).some(o=>o.actor!==p.id))throw Error('Emir oyuncuya ait olmalı.');}
 for(const overrides of Object.values(c.overrides??{}))for(const v of Object.values(overrides))if(!Number.isFinite(v)||v<0||v>100)throw Error('Özellikler 0–100 arasında olmalı.');
 for(const slot of c.teams.flat())for(const key of ['guardFacing','routeFacing'])if(slot[key]!=null&&(!Array.isArray(slot[key])||slot[key].length!==3||slot[key].some(v=>!Number.isFinite(v))))throw Error('Invalid player facing.');
}
