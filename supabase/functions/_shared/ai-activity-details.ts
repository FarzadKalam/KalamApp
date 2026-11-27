import type { AiActivityActionType, AiAgentId } from './ai-agents.ts';

export type AiActivityDescription = { agentId: AiAgentId; actionType?: AiActivityActionType; detail: string };
type ModuleLabel = (moduleId: string) => string | undefined;

export const joinAiActivityLabels = (labels: string[]) => {
  const names = [...new Set(labels.filter(Boolean))];
  return names.length > 1 ? `${names.slice(0, -1).join('، ')} و ${names.at(-1)}` : names[0] || '';
};

export const describeAiAgentCollaboration = (agentNames: string[]) => {
  const names = [...new Set(agentNames.filter(Boolean))];
  return names.length > 1 ? `در حال هماهنگی ${names[0]} با ${joinAiActivityLabels(names.slice(1))}` : null;
};

export const describeAiSkillOwners = (args: unknown, ownerLabel: (skillId: string) => string | undefined) => {
  const ids = (args as { skillIds?: unknown } | null)?.skillIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 3) return null;
  const labels = ids.map(id => typeof id === 'string' ? ownerLabel(id) : undefined);
  if (labels.some(label => !label)) return null;
  return `در حال خواندن دستورهای تخصصی ${joinAiActivityLabels(labels.filter((label): label is string => Boolean(label)))}`;
};

export const describeModuleRead = (modules: string[], label: ModuleLabel, mode?: 'continuation' | 'related'): AiActivityDescription => {
  const names = joinAiActivityLabels(modules.map(module => label(module) || ''));
  const start = mode === 'continuation' ? 'در حال ادامهٔ بررسی' : mode === 'related' ? 'در حال یافتن داده‌های مرتبط در' : 'در حال بررسی';
  return { agentId: 'organization_data', detail: names ? `${start} ${names}` : 'در حال بررسی داده‌های مرتبط' };
};

export const describeAiToolActivity = (name: string, args: unknown, label: ModuleLabel): AiActivityDescription | null => {
  const input = args && typeof args === 'object' ? args as Record<string, unknown> : {};
  const moduleId = typeof input.moduleId === 'string' ? input.moduleId : '';
  if (['read_organization_data', 'count_organization_data', 'aggregate_organization_data'].includes(name)) {
    return label(moduleId) ? describeModuleRead([moduleId], label, input.afterId || input.offset ? 'continuation' : undefined) : null;
  }
  if (name === 'read_agent_skills') return { agentId: 'agent_instructions', detail: 'در حال خواندن دستورهای تخصصی ایجنت' };
  if (name === 'read_process_context') return { agentId: 'process_operation', detail: 'در حال بررسی مراحل و جزئیات فرآیند' };
  if (name === 'read_conversation_memory') return { agentId: 'organization_knowledge', detail: 'در حال مرور پیام‌ها و زمینهٔ گفتگو' };
  if (name === 'describe_organization_data') return { agentId: 'organization_data', detail: 'در حال بررسی ساختار اطلاعات و فیلدهای مجاز' };
  if (['lookup_record_field', 'get_organization_field_options'].includes(name)) {
    return { agentId: 'organization_data', detail: 'در حال جست‌وجوی مقادیر مجاز فیلدها' };
  }
  return null;
};

export const describeAiAttachments = (mimeTypes: string[]) => {
  const categories = mimeTypes.map(type => type.startsWith('audio/') ? 'فایل صوتی' : type.startsWith('image/') ? 'تصویر' : 'سند');
  return `در حال بررسی ${joinAiActivityLabels(categories) || 'پیوست‌ها'}`;
};
