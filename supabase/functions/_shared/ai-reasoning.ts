/** One catalog-driven contract for the composer, defaults and provider requests.
 * Verified baselines: docs/AI_PROCESS_CONTEXT_AND_CONTINUITY_FA.md.
 * Unknown aliases never inherit an effort enum from a similarly named model. */
export const REASONING_LEVEL_LABELS: Record<string,string> = {
  auto: 'خودکار مدل', none: 'بدون تفکر', minimal: 'حداقل', low: 'کم',
  medium: 'متوسط', high: 'زیاد', xhigh: 'بسیار زیاد', max: 'بیشینه', enabled: 'فعال',
};
export type ReasoningProfile = {
  supported: boolean; levels: string[]; parameter: 'reasoning_effort'|'thinking'|'enable_thinking'|'output_config';
  route?: 'responses'|'messages'; required?: boolean; source?: string;
};
const exactProfiles: Record<string,ReasoningProfile> = {
  'claude-haiku-5-5': { supported: true,levels: ['low','medium','high','xhigh','max'],parameter: 'output_config',route: 'messages' },
  'gpt-6-luna': { supported: true,levels: ['none','low','medium','high','xhigh','max'],parameter: 'reasoning_effort',route: 'responses' },
  'gpt-6-sol': { supported: true,levels: ['none','low','medium','high','xhigh','max'],parameter: 'reasoning_effort',route: 'responses' },
  'gpt-6.1-sol': { supported: true,levels: ['low','medium','high','xhigh','max'],parameter: 'reasoning_effort',route: 'responses',required: true },
  'glm-5.3': { supported: true,levels: ['low','high','max'],parameter: 'reasoning_effort',required: true },
  'qwen3.8-flash': { supported: true,levels: ['none','low','medium','xhigh'],parameter: 'enable_thinking' },
  'qwen3.8-27b': { supported: true,levels: ['none','low','medium','xhigh'],parameter: 'enable_thinking' },
  'qwen3.8-2.4t-a95b': { supported: true,levels: ['low','medium','xhigh'],parameter: 'reasoning_effort',required: true },
  // The current AvalAI references establish reasoning, but no reliable effort enum.
  'deepseek-v4.1-flash': { supported: true,levels: [],parameter: 'reasoning_effort' },
  'deepseek-flash': { supported: true,levels: [],parameter: 'reasoning_effort' },
  'glm-5.3-flash': { supported: true,levels: [],parameter: 'reasoning_effort' },
};
export const getReasoningProfile = (model: any): ReasoningProfile => {
  const id=String(model?.id || model?.model || '');
  const base=exactProfiles[id];
  const config=model?.metadata?.reasoning_config;
  if (config?.supported === false) return { supported: false,levels: [],parameter: 'reasoning_effort' };
  if (config && typeof config==='object' && (config.supported===true || config.parameter || config.route || config.levels?.length)) {
    const parameter=['reasoning_effort','thinking','enable_thinking','output_config'].includes(config.parameter) ? config.parameter : base?.parameter || 'reasoning_effort';
    const levels=config.levels?.length ? [...new Set<string>(config.levels.filter((value: any) => value!=='auto' && Object.hasOwn(REASONING_LEVEL_LABELS,value)))] : base?.levels || [];
    return { ...base,supported: true,parameter,levels: config.required ? levels.filter(value => value!=='none') : levels,
      required: config.required ?? base?.required,route: ['responses','messages'].includes(config.route) ? config.route : base?.route,source: config.source || 'catalog' };
  }
  return base || { supported: model?.metadata?.supports_reasoning===true || model?.metadata?.reasoning===true || model?.capability_tags?.includes('deep_reasoning')===true,
    levels: [],parameter: 'reasoning_effort' };
};
export const reasoningOptions = (model: any) => {
  const profile=getReasoningProfile(model);
  return profile.supported ? ['auto',...profile.levels].map(value => ({ value,label: REASONING_LEVEL_LABELS[value] })) : [];
};
export const resolveReasoningEffort = (model: any,explicit: unknown,...defaults: unknown[]) => {
  const valid=new Set(reasoningOptions(model).map(option => option.value));
  if (explicit != null && explicit!=='') {
    if (explicit==='auto') return 'auto';
    if (!valid.has(String(explicit))) throw new Error('سطح تفکر انتخاب‌شده برای این مدل پشتیبانی نمی‌شود؛ گزینه‌های مدل را دوباره دریافت کنید.');
    return String(explicit);
  }
  return defaults.map(value => String(value || '')).find(value => valid.has(value)) || 'auto';
};
export const applyReasoningParameters = (body: Record<string,any>,model: any,effort?: string | null) => {
  const profile=getReasoningProfile(model);
  const selected=resolveReasoningEffort(model,effort);
  // Profiles may use native Responses/Messages adapters; the common request
  // remains Chat-shaped until that adapter translates it.
  if (selected!=='auto') {
    if (profile.parameter==='enable_thinking') {
      body.enable_thinking=selected!=='none';
      if (selected!=='none' && selected!=='enabled') body.reasoning_effort=selected;
    } else if (profile.parameter==='thinking') body.thinking={ type: selected==='none' ? 'disabled' : 'enabled' };
    else if (profile.parameter==='output_config') body.output_config={ effort: selected };
    else body.reasoning_effort=selected;
  }
  if (profile.required && profile.parameter==='reasoning_effort' && !profile.route) body.thinking={ type: 'enabled' };
  if (profile.supported && selected!=='none') delete body.temperature;
  return body;
};
