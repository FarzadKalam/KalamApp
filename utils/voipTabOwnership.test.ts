import {afterEach,expect,it,vi} from 'vitest';
import {acquireVoipTabOwnership} from './voipTabOwnership';
afterEach(()=>vi.unstubAllGlobals());
it('denies a second owner until the first tab releases the SIP account',async()=>{
 let occupied=false;
 vi.stubGlobal('navigator',{locks:{request:async(_key:string,_options:any,callback:any)=>{
  if(occupied)return callback(null);occupied=true;try{return await callback({name:'fixture'});}finally{occupied=false;}
 }}});
 const release=await acquireVoipTabOwnership('org:user');expect(release).toBeTypeOf('function');
 expect(await acquireVoipTabOwnership('org:user')).toBeNull();release!();
 await Promise.resolve();expect(await acquireVoipTabOwnership('org:user')).toBeTypeOf('function');
});
