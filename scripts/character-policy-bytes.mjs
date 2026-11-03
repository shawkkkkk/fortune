import {constants,openSync,fstatSync,readSync,closeSync} from 'node:fs';
/** Existing local policy only. Nonblocking open rejects FIFO/devices before reading. */
export function readCharacterPolicyBytes(path){
 const fd=openSync(path,constants.O_RDONLY|constants.O_NONBLOCK);
 try{
  const stat=fstatSync(fd);if(!stat.isFile()||stat.size>16384)throw Error('Regular bounded character policy required');
  const buffer=Buffer.alloc(16385);let size=0,count;
  while(size<buffer.length&&(count=readSync(fd,buffer,size,buffer.length-size,null))!==0)size+=count;
  if(size>16384)throw Error('Character policy bound');return buffer.subarray(0,size);
 }finally{closeSync(fd);}
}
