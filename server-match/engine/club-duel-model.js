import {matchSetup} from './club-manager-model.js';
import {validateConfig} from './game-v2/config.js';
// Build each side from its own saved plan. Using an opponent's cards alone
// silently discards that manager's board, buy choice and leadership assignment.
export function duelSetup(ticket,away){
 const home=matchSetup(ticket),other=matchSetup({...ticket,cards:away.cards,lineup:away.lineup,plan:away.plan,coach:away.coach,teamPractice:away.teamPractice,opponent:null});
 const homeIds=new Set(home.configuration.teams[0].map(s=>s.id));
 const awayIds=new Set(other.configuration.teams[0].map(s=>s.id));
 if([...awayIds].some(id=>homeIds.has(id)))throw Error('Karşılıklı maçta aynı oyuncu iki takımda yer alamaz.');
 const coachIds=['club:coach-0','club:coach-1'];
 const take=(setup,ids,side)=>setup.cards.filter(c=>ids.has(c.id)||c.id==='club:coach-0').map(c=>c.id==='club:coach-0'?{...c,id:coachIds[side]}:c);
 const cards=[...take(home,homeIds,0),...take(other,awayIds,1)],configuration={...home.configuration,teams:[home.configuration.teams[0],other.configuration.teams[0]],policies:[home.configuration.policies[0],{...other.configuration.policies[0],coach:coachIds[1]}],clubProfiles:{}};
 for(const [side,setup] of [home,other].entries())for(const slot of [...configuration.teams[side],{id:coachIds[side]}]){
  const original=slot.id===coachIds[side]?'club:coach-0':slot.id;
  configuration.clubProfiles[slot.id]={...setup.configuration.clubProfiles[original],id:slot.id};
 }
 validateConfig(cards,configuration);return {cards,configuration};
}
