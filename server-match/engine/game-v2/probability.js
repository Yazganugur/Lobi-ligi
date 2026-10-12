// Design probabilities; these are not fitted professional-player measurements.
export const PROBABILITY_VERSION='event-probabilities-v1';
export function hazardProbability(rate,seconds){if(!Number.isFinite(rate)||!Number.isFinite(seconds)||rate<0||seconds<0)throw Error('Geçersiz olay hızı.');return -Math.expm1(-rate*seconds);}
export function smokeAttemptProbability({skill=50,morale=100,base=.03}={}){return Math.max(0,Math.min(.2,base*(.5+skill/100)*(.75+.25*morale/100)));}
export function shuffled(items,rng){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
