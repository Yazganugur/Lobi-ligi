// Explainable opponent tendencies. Only a team's own sightings/radio and
// confirmed bomb intel are accepted. Hidden world positions are not inputs.
export const OPPONENT_MODEL_VERSION='legal-intel-coach-v1';
const sites=['a','b'];
export function recordDefenseRound(history,evidence){
 if(!Number.isInteger(evidence.round)||evidence.round<1||!sites.every(s=>Number.isInteger(evidence.observed[s])&&evidence.observed[s]>=0&&evidence.observed[s]<=5)||evidence.confirmedSite!==null&&!sites.includes(evidence.confirmedSite))throw new RangeError('Invalid defensive intel');
 if(history.some(r=>r.round===evidence.round))throw new RangeError('Round evidence already recorded');
 const pressure=sites.filter(s=>evidence.observed[s]>=3);
 const site=evidence.confirmedSite??(pressure.length===1?pressure[0]:null);
 return [...history,{round:evidence.round,site,source:evidence.confirmedSite?'confirmed-bomb':site?'observed-pressure':'unknown',observed:{...evidence.observed}}].slice(-6);
}
export function defenseAdjustment(history,{coachAnalysis=50,igl=50,minimumObservations=2,enabled=true}={}){
 if(![coachAnalysis,igl].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw new RangeError('Invalid tactical staff');
 if(!Number.isInteger(minimumObservations)||minimumObservations<2||minimumObservations>6)throw new RangeError('Invalid pattern minimum');
 if(!enabled)return null;
 const known=history.filter(r=>sites.includes(r.site)),strength=(coachAnalysis+igl)/2,minimum=Math.max(minimumObservations,strength>=60?2:3);
 if(known.length<minimum)return null;
 const counts=Object.fromEntries(sites.map(s=>[s,known.filter(r=>r.site===s).length]));
 const site=counts.b>counts.a?'b':'a',confidence=(counts[site]+1)/(known.length+2);
 // A confirmed switch breaks the repeated-hit recommendation immediately.
 if(counts[site]<minimum||confidence<.65||known.at(-1).site!==site)return null;
 return {site,confidence,evidenceRounds:known.map(r=>r.round),observations:counts[site],extraDefender:1,model:OPPONENT_MODEL_VERSION};
}
export function chooseBombSearchSite({guard,index,rotationSite,observations,now,centres}){
 const scores=Object.fromEntries(sites.map(site=>[site,new Set(observations.filter(o=>now-o.time>=0&&now-o.time<=10&&Math.hypot(o.p[0]-centres[site][0],o.p[1]-centres[site][1])<1100).map(o=>o.id)).size]));
 const likely=scores.b>scores.a?'b':'a';
 if(scores[likely]>=2)return {site:likely,source:'recent-team-contact',observedEnemies:scores[likely]};
 if(sites.includes(rotationSite))return {site:rotationSite,source:'observed-support-rotation',observedEnemies:scores[rotationSite]};
 return {site:sites.includes(guard)?guard:index%2?'b':'a',source:'assigned-site-check',observedEnemies:0};
}
