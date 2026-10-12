import mesh from './geometry.json' with {type:'json'};
import {distance} from './navigation.js';
function bytes(text){const decoded=atob(text),buf=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)buf[i]=decoded.charCodeAt(i);return buf.buffer;}
let geometry;
function init(){if(!geometry){const b=bytes(mesh.bvh);geometry={v:new Float32Array(bytes(mesh.vertices)),tri:new Uint32Array(bytes(mesh.triangles)),f:new Float32Array(b),i:new Int32Array(b)};}return geometry;}
function box(g,node,a,d){let lo=0,hi=1;for(let k=0;k<3;k++){const mn=g.f[node*10+k],mx=g.f[node*10+k+3];if(Math.abs(d[k])<1e-9){if(a[k]<mn||a[k]>mx)return false;}else{let x=(mn-a[k])/d[k],y=(mx-a[k])/d[k];if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;}}return true;}
function triangle(g,index,a,d){
 const ids=[g.tri[index*3]*3,g.tri[index*3+1]*3,g.tri[index*3+2]*3],v=g.v;
 const e1=[v[ids[1]]-v[ids[0]],v[ids[1]+1]-v[ids[0]+1],v[ids[1]+2]-v[ids[0]+2]],e2=[v[ids[2]]-v[ids[0]],v[ids[2]+1]-v[ids[0]+1],v[ids[2]+2]-v[ids[0]+2]];
 const h=[d[1]*e2[2]-d[2]*e2[1],d[2]*e2[0]-d[0]*e2[2],d[0]*e2[1]-d[1]*e2[0]],det=e1[0]*h[0]+e1[1]*h[1]+e1[2]*h[2];if(Math.abs(det)<1e-8)return false;
 const s=[a[0]-v[ids[0]],a[1]-v[ids[0]+1],a[2]-v[ids[0]+2]],u=(s[0]*h[0]+s[1]*h[1]+s[2]*h[2])/det;if(u<0||u>1)return false;
 const q=[s[1]*e1[2]-s[2]*e1[1],s[2]*e1[0]-s[0]*e1[2],s[0]*e1[1]-s[1]*e1[0]],w=(d[0]*q[0]+d[1]*q[1]+d[2]*q[2])/det;if(w<0||u+w>1)return false;
 const t=(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])/det;return t>1e-5&&t<1-1e-5;
}
const rayCache=new Map();
function calculateRay(a,b){const g=init(),d=b.map((v,k)=>v-a[k]),stack=[0];if(distance(a,b)<1)return true;while(stack.length){const n=stack.pop();if(!box(g,n,a,d))continue;const off=n*10;if(g.i[off+6]<0){for(let j=g.i[off+8];j<g.i[off+8]+g.i[off+9];j++)if(triangle(g,j,a,d))return false;}else stack.push(g.i[off+6],g.i[off+7]);}return true;}
export function lineClear(a,b){const from=a.join(','),to=b.join(','),key=from<to?from+'|'+to:to+'|'+from;if(rayCache.has(key))return rayCache.get(key);const value=calculateRay(a,b);if(rayCache.size>=50000)rayCache.delete(rayCache.keys().next().value);rayCache.set(key,value);return value;}
export const eye=p=>[p[0],p[1],p[2]+64];
export function smokeBlocks(a,b,smokes,time){const d=b.map((v,k)=>v-a[k]),len=d.reduce((s,v)=>s+v*v,0);return smokes.some(s=>{if(s.until<=time)return false;const t=Math.max(0,Math.min(1,s.p.reduce((sum,v,k)=>sum+(v-a[k])*d[k],0)/Math.max(1,len))),point=a.map((v,k)=>v+t*d[k]);return distance(point,s.p)<s.radius;});}
