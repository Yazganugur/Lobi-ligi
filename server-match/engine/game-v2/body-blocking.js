// Approximate standing player cylinders, separate from static map geometry.
// These are prototype dimensions, not a claim of exact CS2 hitbox parity.
export const BODY_RADIUS=16;
export const BODY_HEIGHT=72;
export function avoidanceCandidates(position,next,preferLeft=true){
 const dx=next[0]-position[0],dy=next[1]-position[1],step=Math.min(32,Math.hypot(dx,dy)),angle=Math.atan2(dy,dx),sign=preferLeft?1:-1;
 return [45,-45,90,-90,135,-135,180].map(degrees=>{const a=angle+sign*degrees*Math.PI/180;return [position[0]+Math.cos(a)*step,position[1]+Math.sin(a)*step,position[2]];});
}
export function movementBlocked(position,next,teammates){
 return teammates.some(p=>{
  if(p.hp<=0||Math.abs(next[2]-p.p[2])>=BODY_HEIGHT)return false;
  const before=Math.hypot(position[0]-p.p[0],position[1]-p.p[1]),after=Math.hypot(next[0]-p.p[0],next[1]-p.p[1]);
  // Already overlapping spawn positions may separate, never move deeper in.
  return after<BODY_RADIUS*2&&after<before-1e-4;
 });
}
export function friendlyInShotLane(from,to,teammates){
 const dx=to[0]-from[0],dy=to[1]-from[1],length=dx*dx+dy*dy;
 if(length<1e-8)return null;
 let nearest=null;
 for(const p of teammates){
  if(p.hp<=0)continue;
  const t=((p.p[0]-from[0])*dx+(p.p[1]-from[1])*dy)/length;
  if(t<=0||t>=1)continue;
  const z=from[2]+(to[2]-from[2])*t;
  if(z<p.p[2]||z>p.p[2]+BODY_HEIGHT)continue;
  const lateral=Math.hypot(from[0]+t*dx-p.p[0],from[1]+t*dy-p.p[1]);
  if(lateral<BODY_RADIUS&&(!nearest||t<nearest.fraction))nearest={id:p.id,fraction:t};
 }
 return nearest;
}
