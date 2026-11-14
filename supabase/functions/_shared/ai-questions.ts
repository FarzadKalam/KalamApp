export type AiQuestion = { id: string; title: string; options: string[] };
const visibleText = (value: unknown) => typeof value === 'string'
  ? value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '').trim() : '';

export const normalizeAiQuestions = (input: unknown): AiQuestion[] => {
  if (!Array.isArray(input)) return [];
  const titles = new Set<string>();
  return input.flatMap((item) => {
    const title = visibleText(typeof item === 'string' ? item : item?.title || item?.question).slice(0, 500);
    if (!title || titles.has(title)) return [];
    titles.add(title);
    const options: string[] = Array.isArray(item?.options) ? item.options
      .map((option: any) => visibleText(typeof option === 'string' ? option : option?.label).slice(0, 160)).filter(Boolean) : [];
    return [{ id: `question_${titles.size}`, title, options: Array.from(new Set(options)).slice(0, 3) }];
  }).slice(0, 4);
};

export const buildAiQuestionAnswer = (questions: AiQuestion[], answers: Record<string, string>) =>
  questions.map((question) => `${question.title}\nپاسخ: ${String(answers[question.id] || '').trim()}`).join('\n\n');

export const AI_QUESTIONS_PROMPT = 'وقتی برای ادامه به پاسخ کاربر نیاز داری، فقط سؤال‌های ضروری و هنوز بی‌پاسخ را مطرح کن. برای نمایش پرسش تعاملی، فقط JSON با ساختار {"reply":"توضیح کوتاه فارسی","questions":[{"title":"پرسش","options":["گزینه اول","گزینه دوم"]}]} برگردان. options اختیاری است؛ گزینهٔ حدسی، شناسه یا UUID نساز. تأیید تغییر داده از مسیر کارت عملیاتی انجام می‌شود. در پاسخ عادی JSON تولید نکن.';

export const presentAiQuestionResponse = (content: string) => {
  try {
    const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (parsed && typeof parsed.reply === 'string' && Array.isArray(parsed.questions)) {
      return { answer: visibleText(parsed.reply), questions: normalizeAiQuestions(parsed.questions) };
    }
    if (parsed?.proposed_action || parsed?.action_type) {
      return { answer: visibleText(parsed.reply || parsed.proposed_action?.summary_fa || parsed.summary_fa) || 'اقدام پیشنهادی آمادهٔ بررسی است؛ هنوز اجرا نشده است.', questions: [] as AiQuestion[] };
    }
  } catch { /* A normal prose reply or an action block after prose. */ }
  let actionSummary = '';
  const answer = content.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (block, raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.proposed_action && !parsed?.action_type) return block;
      actionSummary = visibleText(parsed.reply || parsed.proposed_action?.summary_fa || parsed.summary_fa);
      return '';
    } catch { return block; }
  }).trim();
  if (answer !== content.trim()) return { answer: answer || actionSummary || 'اقدام پیشنهادی آمادهٔ بررسی است؛ هنوز اجرا نشده است.', questions: [] as AiQuestion[] };
  return { answer: content, questions: [] as AiQuestion[] };
};
