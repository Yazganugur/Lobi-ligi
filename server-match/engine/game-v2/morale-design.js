// V2 design companion. NOT imported by the website or the running V1 engine.
// These are assigned game attributes, not measured leadership/personality.
export const VERSION = 'morale-design-v2-human-roles';
export const SEED = 'lobi-traits-2026-10-06-v1';
// Role preferences come from the user. Numerical presets are adjustable game
// design values, NOT observed leadership or real psychological measurements.
export const ROLE_PRESETS = Object.freeze({
  '76561198159160587': {preferredRole:'primary-igl',igl:86,resilience:88}, // Hedrax
  '76561198372190711': {preferredRole:'primary-igl',igl:83,resilience:86}, // Shelby
  '76561199023399084': {preferredRole:'primary-igl',igl:81,resilience:84}, // Haxaar
  '76561199801932351': {preferredRole:'primary-igl',igl:80,resilience:82}, // Integra
  '76561198169120909': {preferredRole:'secondary-igl',igl:42,secondaryIgl:83}, // Code
  '76561198846019719': {preferredRole:'secondary-igl',igl:32,secondaryIgl:86}, // Ri'şah
});
export const WEIGHTS = Object.freeze({
  tactics: {utility:.30, trading:.25, clutching:.20, opening:.10, overall:.15},
  motivation: {clutching:.35, trading:.25, utility:.20, overall:.20},
  resilience: {clutching:.55, trading:.25, overall:.20},
  communication: {trading:.40, utility:.35, clutching:.10, overall:.15},
  discipline: {trading:.40, utility:.30, clutching:.15, overall:.15},
  smokeKnowledge: {utility:.75, overall:.25},
  coachAnalysis: {utility:.45, trading:.30, opening:.10, overall:.15},
});
export const LABELS = {
  tactics:'Taktik yönetimi', motivation:'Motivasyon', resilience:'Toparlanma',
  communication:'İletişim', discipline:'Uygulama disiplini',
  smokeKnowledge:'Smoke bilgisi', coachAnalysis:'Koç analizi',
  igl:'Ana IGL', secondaryIgl:'İkinci IGL', coach:'Koç aday puanı',
};
const bounded = (value, lo=0, hi=100) => Math.min(hi, Math.max(lo, value));
const rounded = value => Math.round(value * 100) / 100;
function randomUnit(text) {
  let h=2166136261;
  for(const ch of text) h=Math.imul(h ^ ch.codePointAt(0),16777619) >>> 0;
  h ^= h >>> 16; h=Math.imul(h,0x7feb352d) >>> 0;
  h ^= h >>> 15; h=Math.imul(h,0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function assignTraits(card) {
  const inputs={overall:Number.isFinite(card.overall)?card.overall:null};
  for(const metric of card.cardMetrics ?? []) inputs[metric.key]=Number.isFinite(metric.score)?metric.score:null;
  const traits={}, breakdown={};
  for(const [key, weights] of Object.entries(WEIGHTS)) {
    const used=Object.entries(weights).filter(([field])=>Number.isFinite(inputs[field]));
    const total=used.reduce((sum,[,w])=>sum+w,0);
    const base=total?used.reduce((sum,[field,w])=>sum+w*inputs[field],0)/total:50;
    const jitter=(randomUnit(`${SEED}|${card.id}|${key}`)*2-1)*6;
    traits[key]=Math.round(bounded(base+jitter));
    breakdown[key]={base,jitter,value:traits[key],
      missingInputs:Object.keys(weights).filter(field=>!Number.isFinite(inputs[field])),
      availableWeight:rounded(total),neutralFallback:total===0};
  }
  traits.igl=Math.round(.60*traits.tactics+.40*traits.motivation);
  traits.coach=Math.round(.55*traits.coachAnalysis+.45*traits.motivation);
  const baselineTraits={...traits};
  const preset=ROLE_PRESETS[String(card.id)];
  traits.secondaryIgl=preset?.secondaryIgl ?? Math.round(.55*traits.communication+.45*traits.tactics);
  if(preset) {
    traits.igl=preset.igl;
    if(preset.resilience!==undefined) traits.resilience=preset.resilience;
  } else traits.igl=Math.min(55,traits.igl);
  // Macro leadership uses the user-adjusted main-IGL trait; raw weighted tactics
  // is kept separately. A strong secondary caller does not receive strong
  // global strategic authority by virtue of its combat stats.
  const roleProfile={preferredRole:preset?.preferredRole ?? 'unclassified',
    preferenceSource:preset?'user-specified':'not-specified',
    primaryRecommended:preset?.preferredRole==='primary-igl',
    secondaryRecommended:preset?.preferredRole==='secondary-igl',
    macroLeadership:traits.igl,microLeadership:traits.secondaryIgl,
    numericalPresetIsSynthetic:true};
  const temperament={generalLossFactor:rounded(.85+.30*randomUnit(`${SEED}|${card.id}|loss-sensitivity`)),
    pistolSensitivity:rounded(.85+.30*randomUnit(`${SEED}|${card.id}|pistol-sensitivity`)),
    knifeSensitivity:rounded(.8+.4*randomUnit(`${SEED}|${card.id}|knife-sensitivity`)),
    streakSensitivity:rounded(.85+.3*randomUnit(`${SEED}|${card.id}|streak-sensitivity`))};
  if(roleProfile.primaryRecommended) temperament.generalLossFactor=.9;
  return {inputs,baselineTraits,traits,breakdown,roleProfile,temperament};
}
export const DEFAULT_POLICY = Object.freeze({
  playerStart:100, coachStart:100, coachEnergyStart:100,
  teamTriggerBelow:60, teamRearmAt:68, teamConsecutiveLowRounds:2,
  individualTriggerBelow:35, individualRearmAt:45,
  iglTriggerBelow:65, iglOnPistolLoss:true, iglCooldownRounds:3,
  timeoutCooldownRounds:2, maxTimeoutsPerTeam:3,
  talkCeiling:100, talkMaxGain:20, talkEnergyCost:15,
  repeatedTalkFactor:.5, maximumIndividualPenalty:.25, maximumCoordinationPenalty:.15,
});
function percent(value, name) {
  if(!Number.isFinite(value)||value<0||value>100) throw new RangeError(`${name} must be in [0,100]`);
  return value;
}
export function readiness(morale) {
  percent(morale,'morale');
  return 1-.25*(100-morale)/100;
}
export function coordination(teamMorale) {
  percent(teamMorale,'teamMorale');
  return 1-.15*(100-teamMorale)/100;
}
export function previewCoachTalk({morale,coachMotivation,coachMorale,energy,repeat=0,fit=1,trust=1,jitter=1}) {
  for(const [name,value] of Object.entries({morale,coachMotivation,coachMorale,energy})) percent(value,name);
  if(!Number.isInteger(repeat)||repeat<0) throw new RangeError('repeat must be a non-negative integer');
  if(!Number.isFinite(fit)||fit<0||fit>1||!Number.isFinite(trust)||trust<0||trust>1||!Number.isFinite(jitter)||jitter<.9||jitter>1.1) throw new RangeError('Invalid talk modifiers');
  const proposedGain=20*(coachMotivation/100)*(coachMorale/100)**2*(energy/100)*(.5**repeat)*fit*trust*jitter;
  const gain=Math.min(20,proposedGain,Math.max(0,100-morale));
  return {before:morale,gain:rounded(gain),after:rounded(morale+gain),energyAfter:Math.max(0,energy-15)};
}
export function previewMoraleLoss({morale,resilience,temperament={generalLossFactor:1,pistolSensitivity:1,knifeSensitivity:1,streakSensitivity:1},roundLost=false,pistolLost=false,knifed=false,streak=0}) {
  percent(morale,'morale');percent(resilience,'resilience');
  if(!Number.isInteger(streak)||streak<0) throw new RangeError('streak must be a non-negative integer');
  for(const [key,value] of Object.entries(temperament)) if(!Number.isFinite(value)||value<.5||value>1.5) throw new RangeError(`Invalid temperament: ${key}`);
  if(pistolLost&&!roundLost) throw new RangeError('Pistol loss requires round loss');
  const round=roundLost?4:0;
  const pistol=pistolLost?4*(temperament.pistolSensitivity??1):0;
  const knife=knifed?18*(temperament.knifeSensitivity??1):0;
  const serial=roundLost&&streak>=3?Math.min(3,streak-2)*(temperament.streakSensitivity??1):0;
  const multiplier=(1.20-.60*resilience/100)*(temperament.generalLossFactor??1);
  const loss=Math.min(25,(round+pistol+knife+serial)*multiplier,morale);
  return {before:morale,loss:rounded(loss),after:rounded(morale-loss),multiplier:rounded(multiplier)};
}
export function timeoutRequest({playerMorales,lowTeamRounds=0,teamArmed=true,individualArmed=[],remaining=3,roundsSinceTimeout=Infinity}) {
  if(playerMorales.length!==5) throw new RangeError('Exactly five on-server players required');
  playerMorales.forEach(value=>percent(value,'playerMorale'));
  const teamMorale=playerMorales.reduce((a,b)=>a+b,0)/5;
  if(remaining<=0||roundsSinceTimeout<2) return {kind:'none',teamMorale};
  const candidates=playerMorales.map((morale,index)=>({morale,index}))
    .filter(p=>p.morale<35&&individualArmed[p.index]!==false).sort((a,b)=>a.morale-b.morale||a.index-b.index);
  if(candidates.length) return {kind:'individual',playerIndex:candidates[0].index,teamMorale};
  if(teamArmed&&teamMorale<60&&lowTeamRounds>=2) return {kind:'team',teamMorale};
  return {kind:'none',teamMorale};
}
