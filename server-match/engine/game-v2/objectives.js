import {NAV,area,location,distance,routeLength} from './navigation.js';
export function utilityTargetKey(player){
 const requested=player.utilityTarget;
 if(requested!=='auto'&&!(player.utility==='smoke'&&['a','b'].includes(requested)))return requested;
 if(player.side==='CT')return player.guard==='b'?'b-tunnel':player.guard==='mid'?'doors':player.index%2?'short':'a-cross';
 return player.attackSite==='b'?'b-doors':player.route==='mid'?'doors':'a-cross';
}
export function escapeDestination(position,start,bombPoint){
 if(distance(position,bombPoint)>950&&distance(area(start).p,bombPoint)>850)return {id:start,p:[...position],length:0};
 const candidates=NAV.filter(a=>distance(a.p,bombPoint)>950).sort((a,b)=>distance(a.p,position)-distance(b.p,position)).slice(0,12);
 let best=null;
 for(const candidate of candidates){const length=routeLength(start,candidate.id);if(Number.isFinite(length)&&(!best||length<best.length))best={id:candidate.id,p:candidate.p,length};}
 return best??{id:location('t').id,p:location('t').p,length:routeLength(start,location('t').id)};
}
