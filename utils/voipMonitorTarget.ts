/** Internal listen capability; never show it as a customer's phone or persist it in public reports. */
export const isVoipMonitorTarget=(value:unknown)=>/^\*88\*[0-9]{16}$/.test(String(value||''));
