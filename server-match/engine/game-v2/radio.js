// Immutable, sampled reports. Refreshing a visible target must not restart the
// delivery clock, and recipients must never receive its newer live position.
export const RADIO_VERSION='queued-sight-radio-v1';
export const RADIO_TTL=2;
export function queueSight(queue,observation,now){
 const pending=queue.filter(o=>now-o.time<RADIO_TTL);
 const latest=pending.filter(o=>o.id===observation.id).at(-1);
 if(!latest||now-latest.time>=.4-1e-6)pending.push({...observation,p:[...observation.p],time:now,source:'sight'});
 return pending;
}
export function deliveredSight(queue,{now,delay}){
 if(!Number.isFinite(now)||!Number.isFinite(delay)||delay<0)throw new RangeError('Invalid radio timing');
 const latest=new Map();
 for(const o of queue)if(now-o.time>=delay-1e-6&&now-o.time<RADIO_TTL&&now>=o.time){
  const prior=latest.get(o.id);if(!prior||prior.time<o.time)latest.set(o.id,o);
 }
 return [...latest.values()].map(o=>({...o,p:[...o.p],source:'radio',receivedAt:o.time+delay}));
}
