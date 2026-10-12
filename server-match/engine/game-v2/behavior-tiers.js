// Execution profiles, not separately trained ML models. Basic legal-intel
// reactions are available in every tier. Overall never comes from league Elo.
export const BEHAVIOR_VERSION='overall-execution-v1';
export function behaviorTier(overalls){
 if(overalls.length!==5||overalls.some(v=>!Number.isFinite(v)||v<0||v>100))throw new RangeError('Five valid card Overalls required');
 const average=overalls.reduce((s,v)=>s+v,0)/5;
 const level=average>=80?'C':average>=70?'B':'A';
 return {version:BEHAVIOR_VERSION,level,average,kind:'rule-based-execution-profile',trained:false,
  observationSeconds:{A:4,B:5,C:6}[level],reactionOverhead:{A:.5,B:.25,C:0}[level],
  patternMinimum:{A:3,B:2,C:2}[level]};
}
