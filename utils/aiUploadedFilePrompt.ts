export type AiUploadedFilePrompt = {
  prompt: string;
  fileName: string;
  mimeType: string;
  size: number;
  data?: string | null;
  inputKind?: 'text' | 'file' | 'image';
  url?: string | null;
  assetId?: string | null;
  entryId?: string | null;
  moduleId?: string | null;
  recordId?: string | null;
};

const MAX_FILE_PROMPT_CHARS = 28_000;

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'xml',
  'html',
  'htm',
  'log',
  'yml',
  'yaml',
  'sql',
]);

const SPREADSHEET_EXTENSIONS = new Set(['xlsx', 'xls']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

const getFileExtension = (fileName: string) => {
  const parts = String(fileName || '').toLowerCase().split('.');
  return parts.length > 1 ? String(parts.pop() || '').trim() : '';
};

const isTextLikeFile = (file: File) => {
  const mimeType = String(file.type || '').toLowerCase();
  const ext = getFileExtension(file.name);
  return mimeType.startsWith('text/')
    || mimeType.includes('json')
    || mimeType.includes('xml')
    || mimeType.includes('csv')
    || TEXT_EXTENSIONS.has(ext);
};

const isImageFile = (file: File) => {
  const mimeType = String(file.type || '').toLowerCase();
  return mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(getFileExtension(file.name));
};

const fileToDataUrl = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const mimeType = file.type || 'application/octet-stream';
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const readSpreadsheet = async (file: File) => {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const chunks: string[] = [];
  workbook.SheetNames.slice(0, 5).forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      chunks.push(`--- شیت: ${sheetName} ---\n${csv.trim()}`);
    }
  });
  return chunks.join('\n\n');
};

const truncateForPrompt = (text: string) => {
  const normalized = String(text || '').replace(/\u0000/g, '').trim();
  if (normalized.length <= MAX_FILE_PROMPT_CHARS) return { text: normalized, truncated: false };
  return {
    text: normalized.slice(0, MAX_FILE_PROMPT_CHARS),
    truncated: true,
  };
};

export const buildAiUploadedFilePrompt = async (file: File): Promise<AiUploadedFilePrompt> => {
  const ext = getFileExtension(file.name);
  let content = '';
  let data: string | null = null;
  let inputKind: AiUploadedFilePrompt['inputKind'] = 'text';

  if (SPREADSHEET_EXTENSIONS.has(ext)) {
    content = await readSpreadsheet(file);
  } else if (isTextLikeFile(file)) {
    content = await file.text();
  } else if (isImageFile(file)) {
    data = await fileToDataUrl(file);
    inputKind = 'image';
  } else {
    data = await fileToDataUrl(file);
    inputKind = 'file';
  }

  if (data) {
    const fileSizeKb = Math.max(1, Math.round(file.size / 1024)).toLocaleString('fa-IR');
    return {
      prompt: [
        inputKind === 'image'
          ? 'این تصویر را تحلیل کن و اگر کاربر خواسته رکوردی ساخته شود، اطلاعات قابل استخراج را دقیق و ساختاریافته استفاده کن.'
          : 'این فایل را تحلیل کن و اگر کاربر خواسته رکوردی ساخته شود، اطلاعات قابل استخراج را دقیق و ساختاریافته استفاده کن.',
        '',
        `نام فایل: ${file.name}`,
        `نوع فایل: ${file.type || ext || 'نامشخص'}`,
        `حجم: ${fileSizeKb} کیلوبایت`,
      ].join('\n'),
      fileName: file.name,
      mimeType: file.type || ext || 'application/octet-stream',
      size: file.size,
      data,
      inputKind,
    };
  }

  const { text, truncated } = truncateForPrompt(content);
  if (!text) throw new Error('محتوای قابل خواندن از فایل پیدا نشد.');

  const fileSizeKb = Math.max(1, Math.round(file.size / 1024)).toLocaleString('fa-IR');
  const prompt = [
    'این فایل را بر اساس محتوای زیر تحلیل کن و اگر سوال مشخصی لازم است، اول خلاصه و نکات مهم را بگو.',
    '',
    `نام فایل: ${file.name}`,
    `نوع فایل: ${file.type || ext || 'نامشخص'}`,
    `حجم: ${fileSizeKb} کیلوبایت`,
    truncated ? 'توجه: به دلیل طول فایل، فقط بخش ابتدایی محتوا ارسال شده است.' : '',
    '',
    'محتوا:',
    text,
  ].filter(Boolean).join('\n');

  return {
    prompt,
    fileName: file.name,
    mimeType: file.type || ext || 'application/octet-stream',
    size: file.size,
    data: null,
    inputKind: 'text',
  };
};

export const buildAiUploadedFilePromptFromUrl = async (input: {
  url: string;
  name?: string | null;
  mimeType?: string | null;
  assetId?: string | null;
  entryId?: string | null;
  moduleId?: string | null;
  recordId?: string | null;
}): Promise<AiUploadedFilePrompt> => {
  const url = String(input.url || '').trim();
  if (!url) throw new Error('آدرس فایل انتخاب‌شده معتبر نیست.');
  const response = await fetch(url);
  if (!response.ok) throw new Error('دریافت فایل از فایل‌منیجر ناموفق بود.');
  const blob = await response.blob();
  const fallbackName = String(url.split('?')[0].split('/').pop() || 'file').trim() || 'file';
  const fileName = String(input.name || fallbackName).trim() || fallbackName;
  const file = new File([blob], fileName, {
    type: input.mimeType || blob.type || 'application/octet-stream',
  });
  const prepared = await buildAiUploadedFilePrompt(file);
  return {
    ...prepared,
    url,
    data: prepared.data || null,
    inputKind: prepared.inputKind || 'text',
    assetId: input.assetId || null,
    entryId: input.entryId || null,
    moduleId: input.moduleId || null,
    recordId: input.recordId || null,
  };
};
