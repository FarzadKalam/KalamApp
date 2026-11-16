import {expect,it,vi,afterEach} from 'vitest';
import {listVoipAudioOutputs,setVoipAudioOutput} from './voipAudioOutput';
afterEach(()=>vi.unstubAllGlobals());
it('reports unsupported output switching without pretending to activate speaker',async()=>{
 expect(await listVoipAudioOutputs({} as any)).toEqual([]);
 await expect(setVoipAudioOutput({} as any,'speaker')).rejects.toThrow();
});
it('switches the actual audio element only after the requested device succeeds',async()=>{
 const audio={setSinkId:vi.fn(async()=>{}),sinkId:'speaker'} as any;
 vi.stubGlobal('navigator',{mediaDevices:{enumerateDevices:async()=>[{kind:'audioinput',deviceId:'mic'},{kind:'audiooutput',deviceId:'speaker',label:'بلندگو'}]}});
 expect(await listVoipAudioOutputs(audio)).toEqual([{id:'',label:'خروجی پیش‌فرض دستگاه'},{id:'speaker',label:'بلندگو'}]);
 expect(await setVoipAudioOutput(audio,'speaker')).toBe('speaker');expect(audio.setSinkId).toHaveBeenCalledWith('speaker');
 audio.setSinkId.mockRejectedValueOnce(new Error('denied'));await expect(setVoipAudioOutput(audio,'other')).rejects.toThrow('denied');
});
