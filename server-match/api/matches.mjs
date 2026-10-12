import {timingSafeEqual} from 'node:crypto';
import {createClient,processOne} from '../worker.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const secret=process.env.CRON_SECRET,actual=String(req.headers.authorization??''),expected='Bearer '+secret;
 if(!secret||secret.length<32||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return res.status(401).json({error:'UNAUTHORIZED'});
 try{const rpc=createClient(process.env),rows=await Promise.allSettled(Array.from({length:4},()=>processOne(rpc)));return res.status(rows.some(r=>r.status==='rejected')?503:200).json({completed:rows.filter(r=>r.status==='fulfilled'&&r.value.status==='complete').length,idle:rows.filter(r=>r.status==='fulfilled'&&r.value.status==='idle').length,failed:rows.filter(r=>r.status==='rejected').length});}
 catch(e){console.error('match-worker',String(e.message).replace(/[^A-Za-z0-9_:-]/g,'').slice(0,100));return res.status(503).json({error:'MATCH_WORKER_FAILED'});}
}
