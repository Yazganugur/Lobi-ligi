import {workerData,parentPort} from 'node:worker_threads';
import {simulateMatch} from './engine/game-v2/model.js';
import {matchSetup} from './engine/club-manager-model.js';
import {duelSetup} from './engine/club-duel-model.js';
import {ENGINE_BUILD} from './engine/game-v2/engine-build.js';
import {VERSION} from './engine/game-v2/config.js';
try{
 if(workerData.engineHash!==ENGINE_BUILD||workerData.engineVersion!==VERSION)throw Error('ENGINE_MISMATCH');
 const setup=workerData.away?duelSetup(workerData.ticket,workerData.away):matchSetup(workerData.ticket);
 parentPort.postMessage({result:simulateMatch(setup.cards,setup.configuration)});
}catch(e){parentPort.postMessage({error:e.message});}
