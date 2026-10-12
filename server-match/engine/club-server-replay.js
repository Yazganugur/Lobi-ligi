export async function unpackServerReplay(record){
 if(typeof record.gzip!=='string'||record.gzip.length>2000000||!/^[a-f0-9]{64}$/.test(record.resultHash))throw Error('Sunucu kaydı geçersiz.');
 const compressed=Uint8Array.from(atob(record.gzip),c=>c.charCodeAt(0)),reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 const parts=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>30000000){await reader.cancel();throw Error('Round kaydı çok büyük.');}parts.push(value);}
 const raw=new Uint8Array(size);let offset=0;for(const part of parts){raw.set(part,offset);offset+=part.length;}
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==record.resultHash)throw Error('Round kaydı doğrulanamadı. Sonuç yeniden hesaplanmadı.');
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
}
