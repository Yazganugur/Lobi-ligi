import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package-manifest.json'),'utf8'));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lobi-worker-integrity-'));
try{
 for(const entry of manifest.files){
  const bytes=fs.readFileSync(path.join(root,entry.file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.file);
  assert.equal(bytes.includes(Buffer.from('\r\n')),false,'Noncanonical line endings: '+entry.file);
  const target=path.join(temporary,entry.file);fs.mkdirSync(path.dirname(target),{recursive:true});
  // Reproduce Git's Linux text checkout without modifying the original package.
  fs.writeFileSync(target,bytes.toString('utf8').replace(/\r\n/g,'\n'));
 }
 const run=()=>spawnSync(process.execPath,['--input-type=module','-e',`import {verifyPackage} from ${JSON.stringify(pathToFileURL(path.join(temporary,'worker.mjs')).href)}; verifyPackage();`],{encoding:'utf8',timeout:30000});
 let result=run();assert.equal(result.status,0,result.stderr);
 const config=path.join(temporary,'engine/game-v2/config.js');
 fs.appendFileSync(config,'\n// accidental package modification\n');
 result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/ENGINE_PACKAGE_CHANGED:game-v2\/config.js/);
 console.log(JSON.stringify({status:'PASS',files:manifest.files.length,checks:['exact manifest hashes','LF-only package','Linux checkout verifies','modified engine rejected']}));
}finally{
 const resolved=path.resolve(temporary),tempRoot=path.resolve(os.tmpdir())+path.sep;
 if(!resolved.startsWith(tempRoot)||!path.basename(resolved).startsWith('lobi-worker-integrity-'))throw Error('Unsafe test cleanup path');
 fs.rmSync(resolved,{recursive:true,force:true});
}
