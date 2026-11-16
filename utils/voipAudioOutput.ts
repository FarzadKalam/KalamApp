type SelectableAudio = HTMLAudioElement & {setSinkId?:(id:string)=>Promise<void>;sinkId?:string};
export type VoipAudioOutput={id:string;label:string};
export async function listVoipAudioOutputs(audio:SelectableAudio|null):Promise<VoipAudioOutput[]>{
 if(!audio?.setSinkId||!navigator.mediaDevices?.enumerateDevices)return [];
 const devices=await navigator.mediaDevices.enumerateDevices();
 return [{id:'',label:'خروجی پیش‌فرض دستگاه'},...devices.filter(device=>device.kind==='audiooutput'&&device.deviceId&&device.deviceId!=='default').map((device,index)=>({id:device.deviceId,label:device.label||`خروجی صدا ${index+1}`}))];
}
export async function setVoipAudioOutput(audio:SelectableAudio|null,id:string){
 if(!audio?.setSinkId)throw new Error('این مرورگر انتخاب خروجی صدا را پشتیبانی نمی‌کند؛ خروجی را از تنظیمات صدای دستگاه انتخاب کنید.');
 await audio.setSinkId(id);
 return audio.sinkId??id;
}
