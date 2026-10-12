import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {ENGINE_BUILD} from './engine/game-v2/engine-build.js';
import {VERSION} from './engine/game-v2/config.js';
export {ENGINE_BUILD,VERSION};
export const MAX_REPLAY_BYTES=1500000;
let verified=false;
export function verifyPackage(){
 if(verified)return;
 const manifest=JSON.parse(readFileSync(new URL('./engine-manifest.json',import.meta.url),'utf8'));
 if(manifest.schema!==1||!Array.isArray(manifest.files)||manifest.files.length<20)throw Error('INVALID_ENGINE_PACKAGE');
 for(const f of manifest.files){if(!/^[a-zA-Z0-9_./-]+$/.test(f.file)||f.file.includes('..')||f.file.startsWith('/')||!(/^[a-f0-9]{64}$/.test(f.sha256)))throw Error('INVALID_ENGINE_PACKAGE');const data=readFileSync(new URL('./engine/'+f.file,import.meta.url));if(createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('ENGINE_PACKAGE_CHANGED');}
 verified=true;
}
export function validateResult(result,job){
 if(result.engineHash!==job.engineHash||result.version!==job.engineVersion)throw Error('ENGINE_MISMATCH');
 if(!Array.isArray(result.score)||result.score.length!==2||!result.score.every(n=>Number.isInteger(n)&&n>=0&&n<=36))throw Error('INVALID_SCORE');
 if(!Array.isArray(result.players)||result.players.length!==10||new Set(result.players.map(p=>p.id)).size!==10)throw Error('INVALID_ROSTER');
 if(result.rounds.length!==result.score[0]+result.score[1]||result.rounds.some((r,i)=>r.number!==i+1||![0,1].includes(r.winner)))throw Error('INVALID_ROUNDS');
 if([0,1].some(t=>result.rounds.filter(r=>r.winner===t).length!==result.score[t]))throw Error('INVALID_TOTAL');
 if(result.diagnostics.failedRoutes||result.diagnostics.negativeBalances)throw Error('INVALID_SIMULATION');
 for(const round of result.rounds){const frame=round.frames[0];if(frame?.players.length!==10||[0,1].some(t=>frame.players.filter(p=>p.team===t&&p.hp>0).length!==5))throw Error('INVALID_START');}
}
export function packResult(result,job){
 validateResult(result,job);
 const json=JSON.stringify(result),compressed=gzipSync(Buffer.from(json));
 if(compressed.length>MAX_REPLAY_BYTES)throw Error('REPLAY_TOO_LARGE');
 const resultHash=createHash('sha256').update(json).digest('hex');
 return {summary:{schema:1,engineHash:result.engineHash,engineVersion:result.version,score:result.score,winner:result.winner,players:result.players,rounds:result.rounds.map(r=>({number:r.number,tTeam:r.tTeam,winner:r.winner,reason:r.reason,duration:r.duration})),diagnostics:result.diagnostics},resultHash,replayGzip:compressed.toString('base64')};
}
export function calculate(job,{timeoutMs=200000}={}){
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./simulation.mjs',import.meta.url),{workerData:job});let done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(Error('SIMULATION_TIMEOUT')),timeoutMs);
  worker.on('message',m=>m.error?finish(Error(m.error)):finish(null,m.result));worker.on('error',e=>finish(e));worker.on('exit',code=>{if(!done)finish(Error('SIMULATION_EXIT_'+code));});
 });
}
export function createClient(env,fetcher=fetch){
 verifyPackage();
 if(env.SUPABASE_URL!=='https://qqvafjrwiqnrxepbbumh.supabase.co'||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('WORKER_NOT_CONFIGURED');
 return async(action,payload={})=>{const r=await fetcher(env.SUPABASE_URL+'/rest/v1/rpc/lobi_game_worker',{method:'POST',signal:AbortSignal.timeout(20000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_payload:payload})});
  if(!r.ok)throw Error('QUEUE_HTTP_'+r.status);return r.json();};
}
export async function processOne(rpc,{simulate=calculate}={}){
 const job=await rpc('claim',{engineHash:ENGINE_BUILD,engineVersion:VERSION});if(!job)return {status:'idle'};
 try{const result=await simulate(job),packed=packResult(result,job);await rpc('complete',{id:job.id,lease:job.lease,...packed});return {status:'complete',id:job.id,score:packed.summary.score};}
 catch(e){await rpc('fail',{id:job.id,lease:job.lease,error:String(e.message).slice(0,120)}).catch(()=>{});throw e;}
}
