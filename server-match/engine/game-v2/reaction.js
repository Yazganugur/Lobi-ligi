// Approximate acoustics for this prototype. Range is navigation-path length,
// not an exact reproduction of Source 2 sound propagation or a learned value.
export const REACTION_VERSION='legal-intel-reaction-v1';
export const PLANT_SOUND_RANGE=2000;
export const PLANT_INTEL_TTL=5;
export function audiblePlantCue({listener,site,now,attempt,pathLength,previous=null}){
 if(!['a','b'].includes(site)||!Number.isFinite(now)||now<0||!Number.isFinite(pathLength)||pathLength<0||!attempt)throw new RangeError('Invalid acoustic event');
 if(listener.hp<=0||listener.side!=='CT'||pathLength>PLANT_SOUND_RANGE)return null;
 const first=previous?.attempt===attempt&&previous.source==='plant-sound'?previous.receivedAt:now;
 return {site,attempt,source:'plant-sound',receivedAt:first,heardAt:first,observedAt:now,listener:listener.id};
}
export function relayPlantCue(cue,{now,delay}){
 if(!Number.isFinite(now)||!Number.isFinite(delay)||delay<0)throw new RangeError('Invalid radio timing');
 if(!cue||cue.source!=='plant-sound'||now<cue.heardAt+delay||now-cue.observedAt>PLANT_INTEL_TTL)return null;
 return {...cue,source:'plant-radio',receivedAt:cue.heardAt+delay};
}
export function defensiveThreat({observations,plantCue,now,centres,memorySeconds=4}){
 const counts=['a','b'].map(site=>({site,ids:[...new Set(observations.filter(o=>now-o.time>=0&&now-o.time<=memorySeconds&&Math.hypot(o.p[0]-centres[site][0],o.p[1]-centres[site][1])<1100).map(o=>o.id))]})).sort((a,b)=>b.ids.length-a.ids.length);
 const strongest=counts[0];
 if(strongest.ids.length>=5)return {site:strongest.site,source:'five-seen',observedEnemies:strongest.ids.length,ids:strongest.ids,urgent:true};
 if(plantCue&&now>=plantCue.receivedAt&&now-plantCue.observedAt<=PLANT_INTEL_TTL)return {site:plantCue.site,source:plantCue.source,observedEnemies:counts.find(c=>c.site===plantCue.site).ids.length,ids:[],urgent:true,receivedAt:plantCue.receivedAt,attempt:plantCue.attempt};
 return strongest.ids.length>=2?{site:strongest.site,source:'observed-pressure',observedEnemies:strongest.ids.length,ids:strongest.ids,urgent:false}:null;
}
export function reactionDelay({threat,coachAnalysis,igl,overhead=0}){
 const staff=Math.max(0,Math.min(1,(coachAnalysis+igl)/200));
 return threat.urgent ? .2+.4*(1-staff)+overhead*.4 : .4+1.6*(1-staff)+overhead;
}
export function shouldSupport({guard,index,authority,threat}){
 if(!threat||authority==='orders-only'||guard===threat.site)return false;
 return threat.urgent||guard==='mid'||threat.observedEnemies>=3&&(threat.site==='b'?index===1:index===3);
}
