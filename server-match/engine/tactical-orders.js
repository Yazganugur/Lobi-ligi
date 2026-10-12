export const ORDER_VERSION='club-orders-v1';
export const ORDER_KINDS={move:'Konuma ilerle',smoke:'Smoke at',flash:'Flash at',fire:'Yanıcı at'};
export function normalizeOrders(input,ids){
 if(!Array.isArray(input)||input.length>15)throw Error('En fazla 15 taktik emri ekleyebilirsin.');
 const seen=new Set(),out=[];
 for(const r of input){if(!r||typeof r.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(r.id)||seen.has(r.id)||!ids.includes(r.actor)||!['T','CT'].includes(r.side)||!ORDER_KINDS[r.kind]||![r.x,r.y,r.at].every(Number.isFinite)||r.x<0||r.x>1024||r.y<0||r.y>1024||r.at<0||r.at>100||!['time','after-order'].includes(r.trigger)||!['continue','hold'].includes(r.fallback))throw Error('Taktik emri geçersiz.');seen.add(r.id);out.push({id:r.id,actor:r.actor,side:r.side,kind:r.kind,x:r.x,y:r.y,at:r.at,trigger:r.trigger,after:r.trigger==='after-order'?r.after:null,fallback:r.fallback});}
 for(const o of out){const chain=new Set([o.id]);let node=o;while(node.trigger==='after-order'){const parent=out.find(p=>p.id===node.after&&p.side===o.side);if(!parent||chain.has(parent.id))throw Error('Emir bağı eksik veya döngü içeriyor.');chain.add(parent.id);node=parent;}}
 // Persist parents before children, matching the server's dependency contract.
 const sorted=[],added=new Set();
 function add(o){if(added.has(o.id))return;if(o.trigger==='after-order')add(out.find(p=>p.id===o.after));added.add(o.id);sorted.push(o);}
 out.forEach(add);return sorted;
}
export function pruneOrders(orders,ids,removed=[]){let next=orders.filter(o=>ids.includes(o.actor)&&!removed.includes(o.id));let size;do{size=next.length;next=next.filter(o=>o.trigger==='time'||next.some(p=>p.id===o.after));}while(next.length!==size);return next;}
export function gateOrders(orders,team){const missing=[];for(const o of orders){const c=team.find(c=>c.id===o.actor);if(!c){missing.push('Emirdeki oyuncu ilk beşte değil.');continue;}if(o.kind==='flash'&&!c.specialties.includes('flash'))missing.push(c.name+': Flash desteği eğitimi gerekiyor.');if(o.kind==='fire'&&c.stats.utility<60)missing.push(c.name+': en az 60 Utility gerekiyor.');}return [...new Set(missing)];}
export function readyOrder(orders,completed,time){return orders.find(o=>!completed.has(o.id)&&time>=o.at&&(o.trigger==='time'||completed.get(o.after)==='done'))??null;}
