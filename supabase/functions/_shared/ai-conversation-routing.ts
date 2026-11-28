const normalizeRequest = (text: string) => text
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u200c\u200d]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const task = '(?:فعالیت|وظیفه|تسک|کار سازمانی)';
const create = '(?:بساز|ایجاد کن|ثبت کن|تعریف کن|اضافه کن|درج کن|برنامه ریزی کن)';
const update = '(?:ویرایش کن|اصلاح کن|تغییر بده|به روز کن|تکمیل کن|لغو کن)';
const taskCreation = new RegExp(`(?:^|[.!؟،؛]\\s*|(?:لطفاً|لطفا|و) )(?:(?:یک|یه|چند) )?${task}(?: (?:جدید|سازمانی))?(?: (?:را|رو))? (?:برای [^.!؟،؛]{1,70} )?${create}(?=$|[\\s.!؟،؛])`);
const explicitRecordAction = /(?:رکورد|در سامانه|در سیستم|در کلام اپ|ثبت نهایی)[^.!؟،؛]{0,60}(?:ثبت کن|ذخیره کن|ایجاد کن|ویرایش کن|به روز کن|تغییر بده)|(?:ثبت|ذخیره|ویرایش) (?:رکورد|در سامانه|در سیستم)/;

export const resolveAiConversationRouting = (input: {
  prompt: string;
  currentModule?: string | null;
  decision: Record<string, any>;
  recordCreationAllowed: boolean;
}) => {
  const { currentModule, decision, recordCreationAllowed } = input;
  const prompt = normalizeRequest(input.prompt);
  const capabilities = Array.isArray(decision.capabilities) ? decision.capabilities : [];
  const taskCreate = taskCreation.test(prompt);
  const taskUpdate = currentModule === 'tasks'
    && new RegExp(`(?:^|[.!؟،؛]\\s*)(?:(?:این|همین) )?${task} (?:را|رو) ${update}(?=$|[\\s.!؟،؛])`).test(prompt);
  const textRevision = /بازنویس|بازنویسی|ویرایش متن|اصلاح متن/.test(prompt);

  if (textRevision && !explicitRecordAction.test(prompt) && !taskCreate && !taskUpdate && capabilities.includes('record_creation')) {
    return {
      ...decision,
      capabilities: capabilities.filter(capability => capability !== 'record_creation'),
      target_module_id: null,
      mutation_mode: null,
      steps: Array.isArray(decision.steps) ? decision.steps.filter((step: any) => step?.operator !== 'record_creation') : [],
    };
  }
  if (recordCreationAllowed && !capabilities.length && (taskCreate || taskUpdate)) {
    return {
      ...decision,
      capabilities: ['record_creation'],
      target_module_id: 'tasks',
      mutation_mode: taskUpdate ? 'update' : 'create',
    };
  }
  return decision;
};
