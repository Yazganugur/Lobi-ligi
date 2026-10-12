// Pure pre-match policies shared by the V2 engine and scenario checks.
// Context contains legal team observations; no access to hidden world state.
export const TACTICAL_VERSION='prematch-policy-design-v2';
export const DEFAULT_TACTICAL_POLICY=Object.freeze({
  afterLostPistol:'conditional',forceMinimumEquipped:4,allowNextRoundEco:false,
  ctRetake:'grouped',minimumReady:3,maxWaitSeconds:4,
  safetySeconds:2,maxKnownEnemyAdvantage:2,
  allowOpportunisticSolo:false,individualAuthority:'local-adjustment',
  earlyRotation:true,
});
function nonnegative(value,name) {
  if(!Number.isFinite(value)||value<0) throw new RangeError(`Invalid ${name}`);
}
function validatePolicy(policy) {
  for(const key of ['forceMinimumEquipped','minimumReady']) if(!Number.isInteger(policy[key])||policy[key]<1||policy[key]>5) throw new RangeError(`Invalid ${key}`);
  for(const key of ['maxWaitSeconds','safetySeconds']) nonnegative(policy[key],key);
  if(!Number.isInteger(policy.maxKnownEnemyAdvantage)||policy.maxKnownEnemyAdvantage<0||policy.maxKnownEnemyAdvantage>5) throw new RangeError('Invalid enemy advantage limit');
  if(!['orders-only','local-adjustment','free'].includes(policy.individualAuthority)) throw new RangeError('Invalid individual authority');
  if(typeof policy.allowNextRoundEco!=='boolean'||typeof policy.allowOpportunisticSolo!=='boolean') throw new TypeError('Explicit policy switches required');
}
export function choosePostPistolBuy({players,forcePackageCost,nextRoundFullBuyIfForceAndLose,policy=DEFAULT_TACTICAL_POLICY}) {
  policy={...DEFAULT_TACTICAL_POLICY,...policy};validatePolicy(policy);
  if(players.length!==5||new Set(players.map(p=>p.id)).size!==5) throw new RangeError('Five unique players required');
  nonnegative(forcePackageCost,'force package cost');if(forcePackageCost===0) throw new RangeError('Positive catalog cost required');
  if(typeof nextRoundFullBuyIfForceAndLose!=='boolean') throw new TypeError('Explicit forecast scenario required');
  players.forEach(p=>nonnegative(p.money,'money'));
  const affordable=players.filter(p=>p.money>=forcePackageCost).map(p=>p.id);
  const mode=policy.afterLostPistol;
  if(!['eco','force','conditional'].includes(mode)) throw new RangeError('Invalid pistol policy');
  if(mode==='eco') return {action:'eco',reason:'precommitted-eco',affordable};
  if(mode==='force') return {action:'force',reason:'precommitted-force-within-actual-budgets',affordable};
  if(affordable.length<policy.forceMinimumEquipped) return {action:'eco',reason:'insufficient-packages',affordable};
  if(!nextRoundFullBuyIfForceAndLose&&!policy.allowNextRoundEco) return {action:'eco',reason:'protect-next-loss-full-buy',affordable};
  return {action:'force',reason:'conditional-force-approved',affordable};
}
export function chooseCtRetake({players,secondsRemaining,defuseSecondsWithKit,defuseSecondsWithoutKit,clearSecondsEstimate,
  knownEnemyCount=null,elapsedWaitingSeconds=0,callerId=null,callerUnderFire=false,isolatedVisibleEnemy=false,committed=false,activeDefuse=null,policy=DEFAULT_TACTICAL_POLICY}) {
  policy={...DEFAULT_TACTICAL_POLICY,...policy};validatePolicy(policy);
  for(const [name,value] of Object.entries({secondsRemaining,defuseSecondsWithKit,defuseSecondsWithoutKit,clearSecondsEstimate,elapsedWaitingSeconds})) nonnegative(value,name);
  if(defuseSecondsWithKit===0||defuseSecondsWithoutKit===0) throw new RangeError('Positive defuse duration required');
  if(knownEnemyCount!==null&&(!Number.isInteger(knownEnemyCount)||knownEnemyCount<0||knownEnemyCount>5)) throw new RangeError('Invalid known enemy count');
  if(new Set(players.map(p=>p.id)).size!==players.length||players.length>5) throw new RangeError('Invalid player identities');
  const alive=players.filter(p=>p.alive);
  alive.forEach(p=>{if(typeof p.hasKit!=='boolean') throw new TypeError('Own kit state required');if(p.etaToEntrySeconds!==null) nonnegative(p.etaToEntrySeconds,'own route ETA');});
  const caller=alive.find(p=>p.id===callerId);
  if(caller&&callerUnderFire) return {action:'defend-self',reason:'observed-immediate-contact'};
  if(!alive.length) return {action:'no-retake',reason:'no-surviving-ct'};
  if(policy.ctRetake==='save') return {action:'save-equipment',reason:'precommitted-save'};
  if(!['grouped','fast-contact'].includes(policy.ctRetake)) throw new RangeError('Invalid retake policy');
  if(typeof committed!=='boolean')throw new TypeError('Explicit commitment state required');
  if(activeDefuse!==null){
    nonnegative(activeDefuse.remainingSeconds,'remaining defuse duration');
    if(!alive.some(p=>p.id===activeDefuse.id))throw new RangeError('Active defuser must be alive');
    // The entry and clearing costs have already been paid. Requiring a fresh
    // ten-second defuse here used to abort a nearly completed objective.
    if(activeDefuse.remainingSeconds<=secondsRemaining)return {action:'continue-defuse',reason:'active-objective-has-time',group:[activeDefuse.id],waitSeconds:0,requiredSeconds:activeDefuse.remainingSeconds};
    return {action:'save-equipment',reason:'active-objective-cannot-finish'};
  }
  if(knownEnemyCount!==null&&knownEnemyCount-alive.length>policy.maxKnownEnemyAdvantage) return {action:'save-equipment',reason:'known-numerical-disadvantage'};
  const waitBudget=Math.max(0,policy.maxWaitSeconds-elapsedWaitingSeconds);
  const reachable=alive.filter(p=>p.etaToEntrySeconds!==null).sort((a,b)=>a.etaToEntrySeconds-b.etaToEntrySeconds||a.id.localeCompare(b.id));
  const minimum=Math.min(policy.minimumReady,alive.length);
  let best=null;
  for(let count=minimum;count<=reachable.length;count++){
    const group=reachable.slice(0,count),wait=group.at(-1).etaToEntrySeconds;
    if(!committed&&wait>waitBudget) continue;
    const defuse=group.some(p=>p.hasKit)?defuseSecondsWithKit:defuseSecondsWithoutKit;
    const required=wait+clearSecondsEstimate+defuse+policy.safetySeconds;
    if(required<=secondsRemaining&&(!best||required<best.requiredSeconds)) best={group:group.map(p=>p.id),waitSeconds:wait,requiredSeconds:required};
  }
  if(!best) return {action:'save-equipment',reason:'insufficient-retake-window-or-support',waitBudget};
  const soloAllowed=policy.allowOpportunisticSolo&&policy.individualAuthority!=='orders-only';
  if(caller&&isolatedVisibleEnemy&&soloAllowed&&policy.ctRetake==='fast-contact') return {action:'opportunistic-contact',reason:'observed-isolated-target-with-permission',...best};
  return {action:!committed&&best.waitSeconds>0?'wait-for-support':'grouped-retake',reason:committed?'continue-committed-retake':'planned-group-with-feasible-estimated-window',...best};
}
