import {openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createPublicClient,http} from 'viem';
import {WorkWaiverObservationBook as Book} from './work-waiver-observation-book.mjs';
function bytes(path,max){const fd=openSync(path,constants.O_RDONLY|constants.O_NONBLOCK);try{if(!fstatSync(fd).isFile())throw Error('Regular input required');const b=Buffer.alloc(max+1);let size=0;while(size<b.length){const n=readSync(fd,b,size,b.length-size,null);if(!n)break;size+=n;}if(size>max)throw Error('Input bound');return b.subarray(0,size);}finally{closeSync(fd);}}
const json=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join()!==[...keys].sort().join())throw Error('Literal fields required');};
let book;
try{
 if(process.env.FORTUNE_WORK_WAIVER_BOOK_ENABLED!=='true')throw Error('Disabled');
 const [mode,configPath,requestPath,...extra]=process.argv.slice(2);
 if(extra.length||!configPath||!['read','capture'].includes(mode)||(mode==='read'?requestPath!==undefined:!requestPath||process.env.FORTUNE_WORK_WAIVER_BOOK_WRITE_ENABLED!=='true'))throw Error('Explicit mode required');
 const pinned=bytes(configPath,16384),config=json(pinned);exact(config,['bookPath','bookId','policy']);
 if(typeof config.bookId!=='string'||!/^[0-9a-f]{64}$/.test(config.bookId))throw Error('Book identity required');
 const check=()=>{if(!pinned.equals(bytes(configPath,16384)))throw Error('Configuration changed');};
 book=new Book(config.bookPath,config.policy,{enabled:true});const view=book.read();
 if(view.bookId!==config.bookId)throw Error('Book identity differs');
 const configSha256=createHash('sha256').update(pinned).digest('hex');
 if(mode==='read'){check();console.log(JSON.stringify({configSha256,observation:view}));}
 else{
  const requestBytes=bytes(requestPath,69632),request=json(requestBytes);exact(request,['policies','expectedHead']);
  const checkInputs=()=>{check();if(!requestBytes.equals(bytes(requestPath,69632)))throw Error('Request changed');};
  const urls=[process.env.FORTUNE_WORK_READ_RPC_URL,process.env.FORTUNE_WORK_SECONDARY_RPC_URL].map(v=>new URL(v||''));
  if(urls.some(u=>u.protocol!=='https:'||u.username||u.password||u.hash)||urls[0].origin===urls[1].origin)throw Error('Providers');
  // Pin local inputs around every awaited read, including the reader's final RPC.
  // This does not defend against privileged host changes after the last check.
  const methods=new Set(['getChainId','getBlockNumber','getBlock','getCode','getTransaction','getTransactionReceipt','readContract']);
  const clients=urls.map(u=>{const client=createPublicClient({transport:http(u.href,{timeout:5000,retryCount:0,fetchOptions:{redirect:'error',credentials:'omit'}})});return new Proxy(client,{get(target,key){const v=Reflect.get(target,key,target);if(!methods.has(key)||typeof v!=='function')return v;return async(...args)=>{checkInputs();const value=await Reflect.apply(v,target,args);checkInputs();return value;};}});});
  book.close();book=undefined;checkInputs();
  book=new Book(config.bookPath,config.policy,{enabled:true,readOnly:false});
  if(book.read().bookId!==config.bookId)throw Error('Book identity differs');checkInputs();
  const result=await book.capture(clients,request.policies,request.expectedHead);
  console.log(JSON.stringify({configSha256,bookId:config.bookId,result}));
 }
}catch{console.error('Work waiver observation book unavailable. Inspect existing history and reviewed inputs before explicit retry; failure does not prove no commit. No financial transaction was submitted.');process.exitCode=1;}
finally{book?.close();}
