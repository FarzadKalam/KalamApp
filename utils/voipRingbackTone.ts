let audio:AudioContext|null=null;
let oscillator:OscillatorNode|null=null;
let gain:GainNode|null=null;
let timer:ReturnType<typeof setInterval>|null=null;
/** Called from the dial gesture, before asynchronous SIP work, to unlock local call progress audio. */
export function prepareVoipRingbackTone(){
 if(typeof window==='undefined'||!window.AudioContext)return;
 try{audio??=new window.AudioContext();if(audio.state==='suspended')void audio.resume().catch(()=>undefined);}catch{/* Audio is optional. */}
}
/** Ringback starts only after the remote SIP endpoint reports 180 Ringing. */
export function startVoipRingbackTone(){
 if(!audio||oscillator)return;
 try{
  oscillator=audio.createOscillator();gain=audio.createGain();oscillator.frequency.value=425;
  oscillator.connect(gain);gain.connect(audio.destination);gain.gain.value=0;oscillator.start();
  const ring=()=>{if(!audio||!gain)return;const now=audio.currentTime;gain.gain.setValueAtTime(0.035,now);gain.gain.setValueAtTime(0,now+1);};
  ring();timer=setInterval(ring,5000);
 }catch{stopVoipRingbackTone();}
}
export function stopVoipRingbackTone(){
 if(timer)clearInterval(timer);timer=null;
 try{oscillator?.stop();oscillator?.disconnect();gain?.disconnect();}catch{/* Already stopped. */}
 oscillator=null;gain=null;
}
export function disposeVoipRingbackTone(){
 stopVoipRingbackTone();if(audio)void audio.close().catch(()=>undefined);audio=null;
}
