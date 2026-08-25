export type WorkflowValueMode = 'static' | 'from_source' | 'from_related' | 'formula';

export type WorkflowActionContract = {
  templateFields: string[];
  valueModes?: WorkflowValueMode[];
  outputVariables?: Array<{ key: string; labelFa: string; channelOnly?: boolean }>;
};

export const WORKFLOW_ACTION_CONTRACTS: Record<string, WorkflowActionContract> = {
  send_note: { templateFields: ['note_text'] },
  send_note_sms: { templateFields: ['note_text'] },
  send_web_form_link: {
    templateFields: ['channel_configs.sms.message', 'channel_configs.email.subject', 'channel_configs.email.body', 'channel_configs.bot.title', 'channel_configs.bot.message', 'channel_configs.note.note_text'],
    outputVariables: [{ key: 'web_form_link', labelFa: 'لینک وب‌فرم', channelOnly: true }],
  },
  send_sms: { templateFields: ['message'] },
  send_email: { templateFields: ['subject', 'body'] },
  run_ai_prompt: {
    templateFields: ['prompt_template', 'prompt', 'channel_configs.sms.message', 'channel_configs.email.subject', 'channel_configs.email.body', 'channel_configs.bot.title', 'channel_configs.bot.message', 'channel_configs.note.note_text'],
    outputVariables: [{ key: 'ai_answer', labelFa: 'پاسخ هوش مصنوعی', channelOnly: true }],
  },
  send_bot_message: { templateFields: ['title', 'message'] },
  send_telegram_bot: { templateFields: ['title', 'message'] },
  send_bale_bot: { templateFields: ['title', 'message'] },
  send_rubika_bot: { templateFields: ['title', 'message'] },
  update_record: { templateFields: [], valueModes: ['static', 'from_source', 'from_related', 'formula'] },
  lock_record: { templateFields: ['reason'] },
  send_to_next_stages: { templateFields: [], valueModes: ['static', 'from_source', 'from_related', 'formula'] },
  send_to_specific_stage: { templateFields: [], valueModes: ['static', 'from_source', 'from_related', 'formula'] },
  create_standalone_record: { templateFields: [], valueModes: ['static', 'from_source', 'from_related', 'formula'] },
  create_related_record: { templateFields: [], valueModes: ['static', 'from_source', 'from_related', 'formula'] },
  update_related_record: { templateFields: [], valueModes: ['static', 'from_source', 'from_related', 'formula'] },
  copy_process_template: { templateFields: [] },
  execute_process: { templateFields: [] },
  activate_next_process_stage: { templateFields: [] },
  activate_specific_process_stage: { templateFields: [] },
  publish_story: { templateFields: ['content', 'text_template', 'sms_template'] },
};

export const getWorkflowActionContract = (actionType: unknown): WorkflowActionContract =>
  WORKFLOW_ACTION_CONTRACTS[String(actionType || '').trim()] || { templateFields: [] };

export const getWorkflowActionOutputVariables = (actionType: unknown) =>
  getWorkflowActionContract(actionType).outputVariables || [];

export const isWorkflowOutputVariableAllowed = (actionType: unknown, variableKey: unknown) =>
  getWorkflowActionOutputVariables(actionType).some((item) => item.key === String(variableKey || '').trim());
