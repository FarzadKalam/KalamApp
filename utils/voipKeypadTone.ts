// Local touch feedback only; SIP DTMF is sent separately after a call is answered.
const frequencies:Record<string,[number,number]>={
 '1':[697,1209],'2':[697,1336],'3':[697,1477],
 '4':[770,1209],'5':[770,1336],'6':[770,1477],
 '7':[852,1209],'8':[852,1336],'9':[852,1477],
 '*':[941,1209],'0':[941,1336],'#':[941,1477],
};
let context:AudioContext|null=null;
let releaseTone:(()=>void)|null=null;
export function playVoipKeypadTone(digit:string){
 const pair=frequencies[digit];if(!pair||typeof window==='undefined'||!window.AudioContext)return;
 try{
  context??=new window.AudioContext();
  if(context.state==='suspended')void context.resume().catch(()=>undefined);
  releaseTone?.();
  const audio=context;const gain=audio.createGain();const now=audio.currentTime;
  gain.gain.setValueAtTime(0.0001,now);gain.gain.exponentialRampToValueAtTime(0.05,now+0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001,now+0.09);gain.connect(audio.destination);
  let remaining=2;
  const tones=pair.map(frequency=>{
   const oscillator=audio.createOscillator();oscillator.frequency.value=frequency;oscillator.connect(gain);
   oscillator.onended=()=>{oscillator.disconnect();if(!--remaining)gain.disconnect();};
   oscillator.start(now);oscillator.stop(now+0.1);return oscillator;
  });
  releaseTone=()=>tones.forEach(tone=>{try{tone.stop();}catch{/* Already ended. */}});
 }catch{/* Audio feedback must never prevent typing or calling. */}
}
export function disposeVoipKeypadTone(){
 releaseTone?.();releaseTone=null;
 if(context)void context.close().catch(()=>undefined);
 context=null;
}
