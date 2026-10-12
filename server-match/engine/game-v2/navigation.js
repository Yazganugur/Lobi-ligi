import asset from './navigation.json' with {type:'json'};
export const MAP_VERSION=asset.version;
export const MAP_PROVENANCE=asset.manifest;
export const NAV=asset.areas;
const byId=new Map(NAV.map(a=>[a.id,a]));
export const LOCATIONS={t:{label:'T başlangıç',p:[-650,-780,80]},ct:{label:'CT başlangıç',p:[250,2250,0]},a:{label:'A alanı',p:[1120,2630,128]},b:{label:'B alanı',p:[-1530,2650,32]},mid:{label:'Mid',p:[-320,1250,0]},short:{label:'Short',p:[570,2070,64]},long:{label:'Long',p:[1430,1250,0]},tunnels:{label:'Üst tünel',p:[-1850,1600,64]},lower:{label:'Alt tünel',p:[-1200,1100,0]},doors:{label:'Mid kapıları',p:[-470,2100,0]},'a-cross':{label:'A · CT geçişi',p:[1000,2350,64]},'b-doors':{label:'B · kapı girişi',p:[-1320,2270,32]},'b-tunnel':{label:'B · tünel çıkışı',p:[-1920,2370,32]}};
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export const radar=p=>[(p[0]-asset.transform.pos_x)/asset.transform.scale,(asset.transform.pos_y-p[1])/asset.transform.scale];
export const worldFromRadar=(x,y)=>[x*asset.transform.scale+asset.transform.pos_x,asset.transform.pos_y-y*asset.transform.scale,0];
export function nearestArea(p){let best=NAV[0],d=Infinity;for(const a of NAV){const x=distance(a.p,p);if(x<d){d=x;best=a;}}return best;}
export function location(key){return nearestArea(LOCATIONS[key]?.p??LOCATIONS.mid.p);}
export function area(id){return byId.get(id);}
class Heap{constructor(){this.a=[];}push(value){const a=this.a;a.push(value);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=value[0])break;a[i]=a[p];i=p;}a[i]=value;}pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(2*i+1<a.length){let c=2*i+1;if(c+1<a.length&&a[c+1][0]<a[c][0])c++;if(a[c][0]>=last[0])break;a[i]=a[c];i=c;}a[i]=last;}return first;}get length(){return this.a.length;}}
const cache=new Map();
export function route(start,goal){
 if(start===goal)return [start];const key=start+':'+goal;if(cache.has(key))return cache.get(key);
 const target=area(goal);if(!area(start)||!target)return [];
 const heap=new Heap(),cost=new Map([[start,0]]),prev=new Map();heap.push([0,start]);
 while(heap.length){const [,id]=heap.pop();if(id===goal){const path=[id];while(prev.has(path[0]))path.unshift(prev.get(path[0]));cache.set(key,path);return path;}
  const a=area(id);for(const [other] of a.links){const next=area(other);const c=cost.get(id)+distance(a.p,next.p);if(c>=(cost.get(other)??Infinity))continue;cost.set(other,c);prev.set(other,id);heap.push([c+distance(next.p,target.p),other]);}
 }
 cache.set(key,[]);return [];
}
export function routePoints(start,goal){const path=route(start,goal),points=[];for(let i=0;i<path.length;i++){const a=area(path[i]);points.push({p:[...a.p],area:a.id});if(i<path.length-1){const link=a.links.find(v=>v[0]===path[i+1]),v=a.corners[link[1]],w=a.corners[(link[1]+1)%a.corners.length];points.push({p:v.map((x,k)=>(x+w[k])/2),area:a.id});}}return points;}
export function routeLength(start,goal){const points=routePoints(start,goal);if(!points.length)return Infinity;let total=0;for(let i=1;i<points.length;i++)total+=distance(points[i-1].p,points[i].p);return total;}
const formationCache=new Map();
export function formationAreas(baseId,count=5){
 const key=baseId+':'+count;if(formationCache.has(key))return formationCache.get(key);
 const base=area(baseId),chosen=[base],candidates=NAV.filter(a=>a.id!==baseId&&Math.abs(a.p[2]-base.p[2])<48&&distance(a.p,base.p)<300).sort((a,b)=>distance(a.p,base.p)-distance(b.p,base.p)||a.id-b.id);
 for(const a of candidates){if(chosen.every(b=>Math.hypot(a.p[0]-b.p[0],a.p[1]-b.p[1])>=48)&&routeLength(baseId,a.id)<500)chosen.push(a);if(chosen.length>=count)break;}
 // A very narrow custom area may not admit a full formation. Do not invent
 // positions outside the walkable navigation mesh to satisfy a visual grid.
 formationCache.set(key,chosen);return chosen;
}
const localAreaCache=new Map();
export function walkableLocalPoint(point,fromArea){
 const base=area(fromArea);if(!base)return null;
 if(!localAreaCache.has(fromArea))localAreaCache.set(fromArea,NAV.filter(a=>distance(a.p,base.p)<400&&Math.abs(a.p[2]-base.p[2])<80));
 for(const a of localAreaCache.get(fromArea)){
  let sign=0,inside=true;
  for(let i=0;i<a.corners.length;i++){const v=a.corners[i],w=a.corners[(i+1)%a.corners.length],cross=(w[0]-v[0])*(point[1]-v[1])-(w[1]-v[1])*(point[0]-v[0]);if(Math.abs(cross)<1e-5)continue;const next=Math.sign(cross);if(sign&&next!==sign){inside=false;break;}sign=next;}
  if(!inside)continue;
  const [v,w,u]=a.corners,e=w.map((x,k)=>x-v[k]),f=u.map((x,k)=>x-v[k]),n=[e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]];
  if(Math.abs(n[2])<1e-6)continue;
  const z=v[2]-(n[0]*(point[0]-v[0])+n[1]*(point[1]-v[1]))/n[2];
  if(Math.abs(z-point[2])<24)return {p:[point[0],point[1],z],area:a.id};
 }
 return null;
}
