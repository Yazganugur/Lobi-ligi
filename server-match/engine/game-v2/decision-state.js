// Shared by the ETA calculation and the actual hold condition. A nonzero ETA
// for a player already holding at entry creates an impossible rendezvous.
export const RETAKE_STAGING_RADIUS=350;
export function atRetakeEntry(distanceToBomb){return distanceToBomb<RETAKE_STAGING_RADIUS;}
export function retakeEntryEta({distanceToBomb,pathLength,speed}){
 if(!Number.isFinite(distanceToBomb)||distanceToBomb<0||!Number.isFinite(speed)||speed<=0)throw new RangeError('Invalid own route estimate');
 if(atRetakeEntry(distanceToBomb))return 0;
 if(!Number.isFinite(pathLength))return null;
 return Math.max(0,pathLength-RETAKE_STAGING_RADIUS)/speed;
}
export function remainingPathLength(position,points){
 let total=0,last=position;
 for(const waypoint of points){const p=waypoint.p??waypoint;total+=Math.hypot(...p.map((v,k)=>v-last[k]));last=p;}
 return total;
}
