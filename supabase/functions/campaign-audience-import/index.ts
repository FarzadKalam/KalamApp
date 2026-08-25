// @ts-nocheck
// Secure, idempotent multi-file audience import for advertising campaigns.
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const FUNCTION_BUILD = 'campaign-audience-import-2026-08-25-01';
const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 100_000;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) => new Response(
  JSON.stringify({ build: FUNCTION_BUILD, ...payload }),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } },
);

const parseResponse = async (response: Response) => {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return raw; }
};

const requestRest = async ({
  baseUrl, apiKey, token, path, method = 'GET', body, prefer,
}: {
  baseUrl: string; apiKey: string; token: string; path: string; method?: string;
  body?: unknown; prefer?: string;
}) => {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(typeof payload === 'string' ? payload : String(payload?.message || payload?.hint || 'خطای پایگاه داده'));
  }
  return payload;
};

const normalizeDigits = (value: unknown) => String(value ?? '').translate
  ? String(value ?? '')
  : String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const cleanText = (value: unknown) => normalizeDigits(value)
  .replace(/^\uFEFF/, '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim();

const normalizeHeader = (value: unknown) => cleanText(value)
  .toLowerCase()
  .replace(/[\s_\-–—.()\[\]{}]+/g, '');

const PHONE_HEADERS = new Set([
  'mobile', 'mobile1', 'phone', 'phonenumber', 'mobilenumber',
  'موبایل', 'شماره', 'شمارهتلفن', 'شمارههمراه', 'شمارهتلفنهمراه', 'تلفنهمراه',
]);
const EMAIL_HEADERS = new Set(['email', 'emailaddress', 'ایمیل', 'پستالکترونیکی', 'رایانامه']);
const NAME_HEADERS = new Set(['name', 'fullname', 'displayname', 'نام', 'نامونامخانوادگی', 'ناممخاطب']);
const EXTERNAL_CODE_HEADERS = new Set(['externalcode', 'code', 'کد', 'کدخارجی', 'شناسهخارجی']);

const normalizePhone = (value: unknown) => {
  let phone = cleanText(value).replace(/[^\d+]/g, '');
  if (phone.startsWith('0098')) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith('98') && phone.length === 12) phone = `0${phone.slice(2)}`;
  else if (phone.startsWith('9') && phone.length === 10) phone = `0${phone}`;
  return /^09\d{9}$/.test(phone) ? phone : null;
};

const normalizeEmail = (value: unknown) => {
  const email = cleanText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
};

const safeCellValue = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  const text = cleanText(value).slice(0, 4000);
  // Keep later spreadsheet exports from interpreting imported values as formulas.
  return /^[=+@]/.test(text) ? `'${text}` : text;
};

const getExtension = (name: string) => String(name || '').trim().toLowerCase().split('.').pop() || '';

const readWorkbookRows = (bytes: Uint8Array, fileName: string): unknown[][] => {
  const extension = getExtension(fileName);
  let workbook: any;
  if (extension === 'csv') {
    let decoded = '';
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    } catch {
      throw new Error('فایل CSV باید با انکودینگ UTF-8 ذخیره شده باشد.');
    }
    workbook = XLSX.read(decoded, { type: 'string', raw: false });
  } else {
    workbook = XLSX.read(bytes, { type: 'array', raw: false, cellDates: true, codepage: 65001 });
  }
  const firstSheetName = workbook?.SheetNames?.[0];
  if (!firstSheetName || !workbook.Sheets?.[firstSheetName]) throw new Error('فایل هیچ برگه قابل خواندنی ندارد.');
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  }) as unknown[][];
};

const resolveColumns = (headerRow: unknown[], channelType: string) => {
  const normalized = headerRow.map(normalizeHeader);
  const target = channelType === 'sms' ? PHONE_HEADERS : EMAIL_HEADERS;
  const contactIndex = normalized.findIndex((header) => target.has(header));
  const nameIndex = normalized.findIndex((header) => NAME_HEADERS.has(header));
  const externalCodeIndex = normalized.findIndex((header) => EXTERNAL_CODE_HEADERS.has(header));
  return { normalized, contactIndex, nameIndex, externalCodeIndex };
};

const findHeaderRow = (rows: unknown[][], channelType: string) => {
  const max = Math.min(rows.length, 20);
  for (let index = 0; index < max; index += 1) {
    const columns = resolveColumns(Array.isArray(rows[index]) ? rows[index] : [], channelType);
    if (columns.contactIndex >= 0) return { headerIndex: index, ...columns };
  }
  throw new Error(channelType === 'sms'
    ? 'ستون موبایل در بیست ردیف نخست پیدا نشد.'
    : 'ستون ایمیل در بیست ردیف نخست پیدا نشد.');
};

const assertStorageUrl = (rawUrl: unknown, baseUrl: string) => {
  const url = new URL(String(rawUrl || ''));
  const expected = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.hostname !== expected.hostname || !url.pathname.startsWith('/storage/v1/object/')) {
    throw new Error('آدرس فایل خارج از فضای ذخیره‌سازی امن پروژه است.');
  }
  return url.toString();
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, message: 'روش درخواست معتبر نیست.' });

  const baseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!baseUrl || !serviceKey) return json(500, { success: false, message: 'تنظیمات سرور کامل نیست.' });
  const token = String(req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token === serviceKey) return json(401, { success: false, message: 'نشست کاربری معتبر نیست.' });

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { success: false, message: 'درخواست معتبر نیست.' }); }
  const toolId = String(body?.tool_id || '').trim();
  let importId = String(body?.import_id || '').trim();
  const requestedCampaignId = String(body?.campaign_id || '').trim();
  const requestedChannel = String(body?.channel || '').trim().toLowerCase();
  const recordFileIds = Array.from(new Set(
    (Array.isArray(body?.record_file_ids) ? body.record_file_ids : [])
      .map((value: any) => String(value || '').trim())
      .filter((value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)),
  ));
  if (!toolId || recordFileIds.length === 0 || recordFileIds.length > MAX_FILES) {
    return json(400, { success: false, message: `شناسه ابزار و یک تا ${MAX_FILES} فایل الزامی است.` });
  }

  let activeImportId = importId || null;
  try {
    const authResponse = await fetch(`${baseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    });
    const authUser = await parseResponse(authResponse);
    if (!authResponse.ok || !authUser?.id) return json(401, { success: false, message: 'نشست کاربری معتبر نیست.' });

    const toolRows = await requestRest({
      baseUrl, apiKey: serviceKey, token,
      path: `advertising_campaign_tools?id=eq.${encodeURIComponent(toolId)}&select=id,org_id,campaign_id,tool_type,enabled&limit=1`,
    });
    const tool = Array.isArray(toolRows) ? toolRows[0] : null;
    if (!tool || tool.enabled !== true || !['sms', 'email'].includes(String(tool.tool_type || ''))) {
      return json(400, { success: false, message: 'ابزار فعال پیامک یا ایمیل پیدا نشد.' });
    }
    if ((requestedCampaignId && requestedCampaignId !== String(tool.campaign_id || ''))
        || (requestedChannel && requestedChannel !== String(tool.tool_type || ''))) {
      return json(400, { success: false, message: 'کمپین یا کانال فایل با ابزار انتخاب‌شده تطبیق ندارد.' });
    }
    const [canEdit, moduleEnabled, featureEnabled] = await Promise.all([
      requestRest({ baseUrl, apiKey: serviceKey, token, path: 'rpc/can_edit_advertising_campaign', method: 'POST', body: { p_campaign_id: tool.campaign_id } }),
      requestRest({ baseUrl, apiKey: serviceKey, token, path: 'rpc/current_org_has_plan_module', method: 'POST', body: { p_module_id: 'advertising_campaigns', p_default_enabled: false } }),
      requestRest({ baseUrl, apiKey: serviceKey, token, path: 'rpc/current_org_has_plan_feature', method: 'POST', body: { p_feature_key: tool.tool_type === 'sms' ? 'campaign_sms' : 'campaign_email', p_default_enabled: false } }),
    ]);
    if (canEdit !== true || moduleEnabled !== true || featureEnabled !== true) {
      return json(403, { success: false, message: 'دسترسی یا قابلیت پلن برای ورود مخاطبان فعال نیست.' });
    }

    // Raw URLs are never accepted. Resolve file metadata from tenant-scoped
    // record_files rows attached to this exact campaign tool.
    const recordFileFilter = recordFileIds.map(encodeURIComponent).join(',');
    const recordFiles = await requestRest({
      baseUrl, apiKey: serviceKey, token: serviceKey,
      path: `record_files?id=in.(${recordFileFilter})&org_id=eq.${encodeURIComponent(tool.org_id)}&module_id=eq.advertising_campaign_tools&record_id=eq.${encodeURIComponent(tool.id)}&select=id,file_url,file_name,mime_type,asset_id&limit=${MAX_FILES}`,
    });
    if (!Array.isArray(recordFiles) || recordFiles.length !== recordFileIds.length) {
      return json(400, { success: false, message: 'یک یا چند فایل متعلق به این ابزار و سازمان نیست.' });
    }
    const resolvedById = new Map(recordFiles.map((row: any) => [String(row.id), row]));
    const files = recordFileIds.map((id) => {
      const row: any = resolvedById.get(id);
      return {
        recordFileId: id,
        assetId: String(row?.asset_id || '').trim() || null,
        name: cleanText(row?.file_name || `file-${id}`).slice(0, 255),
        mimeType: cleanText(row?.mime_type || '').slice(0, 255) || null,
        url: assertStorageUrl(row?.file_url, baseUrl),
      };
    });

    if (importId) {
      const imports = await requestRest({
        baseUrl, apiKey: serviceKey, token,
        path: `advertising_campaign_imports?id=eq.${encodeURIComponent(importId)}&tool_id=eq.${encodeURIComponent(toolId)}&select=id,org_id,campaign_id,tool_id&limit=1`,
      });
      if (!Array.isArray(imports) || !imports[0]) return json(404, { success: false, message: 'اجرای ورود فایل پیدا نشد.' });
    } else {
      const created = await requestRest({
        baseUrl, apiKey: serviceKey, token,
        path: 'advertising_campaign_imports', method: 'POST', prefer: 'return=representation',
        body: { org_id: tool.org_id, campaign_id: tool.campaign_id, tool_id: tool.id, status: 'pending', file_ids: recordFileIds },
      });
      importId = String(Array.isArray(created) ? created[0]?.id || '' : created?.id || '').trim();
      activeImportId = importId || null;
      if (!importId) throw new Error('اجرای ورود فایل ساخته نشد.');
    }

    const processingPromise = (async () => {
    const runId = crypto.randomUUID();
    let totalBytes = 0;
    let totalRows = 0;
    let processedRows = 0;
    let validRows = 0;
    let duplicateRows = 0;
    let invalidRows = 0;
    const seen = new Set<string>();
    const pendingRows: Record<string, any>[] = [];
    const fileSummaries: Record<string, any>[] = [];
    const errorSamples: Record<string, any>[] = [];

    const updateProgress = async (status: string) => requestRest({
      baseUrl, apiKey: serviceKey, token: serviceKey,
      path: 'rpc/update_advertising_campaign_import_progress', method: 'POST',
      body: {
        p_import_id: importId, p_status: status, p_total_rows: totalRows,
        p_processed_rows: processedRows, p_valid_rows: validRows,
        p_duplicate_rows: duplicateRows, p_invalid_rows: invalidRows,
        p_error_summary: { samples: errorSamples, files: fileSummaries, run_id: runId },
      },
    });
    await updateProgress('processing');

    const flush = async () => {
      if (pendingRows.length === 0) return;
      const batch = pendingRows.splice(0, pendingRows.length);
      await requestRest({
        baseUrl, apiKey: serviceKey, token: serviceKey,
        path: 'advertising_campaign_import_rows?on_conflict=import_id,contact_key', method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal', body: batch,
      });
    };

    for (const [fileIndex, file] of files.entries()) {
      const fileName = cleanText(file.name || `file-${fileIndex + 1}`).slice(0, 255);
      const extension = getExtension(fileName);
      if (!['csv', 'xlsx', 'xls'].includes(extension)) throw new Error(`فرمت فایل «${fileName}» پشتیبانی نمی‌شود.`);
      const fileUrl = assertStorageUrl(file.url, baseUrl);
      const response = await fetch(fileUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`خواندن فایل «${fileName}» ناموفق بود.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) throw new Error(`حجم فایل «${fileName}» معتبر نیست.`);
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error('مجموع حجم فایل‌ها بیش از حد مجاز است.');

      const matrix = readWorkbookRows(bytes, fileName);
      const { headerIndex, normalized, contactIndex, nameIndex, externalCodeIndex } = findHeaderRow(matrix, tool.tool_type);
      const dataRows = matrix.slice(headerIndex + 1).filter((row: any) => Array.isArray(row) && row.some((cell: any) => cleanText(cell)));
      totalRows += dataRows.length;
      if (totalRows > MAX_ROWS) throw new Error(`تعداد ردیف‌ها بیش از سقف ${MAX_ROWS.toLocaleString('fa-IR')} است.`);
      let fileValid = 0;
      let fileInvalid = 0;
      let fileDuplicate = 0;

      for (const [rowIndex, rawRow] of dataRows.entries()) {
        processedRows += 1;
        const contact = tool.tool_type === 'sms'
          ? normalizePhone(rawRow[contactIndex])
          : normalizeEmail(rawRow[contactIndex]);
        if (!contact) {
          invalidRows += 1; fileInvalid += 1;
          if (errorSamples.length < 50) errorSamples.push({ file: fileName, row: headerIndex + rowIndex + 2, reason: tool.tool_type === 'sms' ? 'شماره موبایل نامعتبر' : 'ایمیل نامعتبر' });
          continue;
        }
        const contactKey = tool.tool_type === 'email' ? contact.toLowerCase() : contact;
        if (seen.has(contactKey)) { duplicateRows += 1; fileDuplicate += 1; continue; }
        seen.add(contactKey);

        const variables: Record<string, string> = {};
        normalized.forEach((header, index) => {
          if (!header) return;
          const value = safeCellValue(rawRow[index]);
          if (value) variables[header] = value;
        });
        if (externalCodeIndex >= 0) variables.external_code = safeCellValue(rawRow[externalCodeIndex]);
        const displayName = nameIndex >= 0 ? safeCellValue(rawRow[nameIndex]).slice(0, 500) || null : null;
        pendingRows.push({
          org_id: tool.org_id, campaign_id: tool.campaign_id, tool_id: tool.id,
          import_id: importId, parse_run_id: runId, source_file_name: fileName,
          source_row_number: headerIndex + rowIndex + 2, contact_value: contact,
          contact_key: contactKey, display_name: displayName, variables,
        });
        validRows += 1; fileValid += 1;
        if (pendingRows.length >= 500) await flush();
        if (processedRows % 1000 === 0) await updateProgress('processing');
      }
      fileSummaries.push({ name: fileName, rows: dataRows.length, valid: fileValid, duplicate: fileDuplicate, invalid: fileInvalid });
      await flush();
      await updateProgress('processing');
    }

    // Only a successful run replaces the prior materialization.
    await requestRest({
      baseUrl, apiKey: serviceKey, token: serviceKey,
      path: `advertising_campaign_import_rows?import_id=eq.${encodeURIComponent(importId)}&parse_run_id=neq.${encodeURIComponent(runId)}`,
      method: 'DELETE', prefer: 'return=minimal',
    });
    await updateProgress('completed');
    return {
      import_id: importId, status: 'completed', total_rows: totalRows,
      processed_rows: processedRows, valid_rows: validRows, duplicate_rows: duplicateRows,
      invalid_rows: invalidRows, recognized_count: seen.size, files: fileSummaries,
    };
    })();

    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(processingPromise.catch(async (error: any) => {
        await requestRest({
          baseUrl, apiKey: serviceKey, token: serviceKey,
          path: 'rpc/update_advertising_campaign_import_progress', method: 'POST',
          body: {
            p_import_id: importId, p_status: 'failed', p_total_rows: 0,
            p_processed_rows: 0, p_valid_rows: 0, p_duplicate_rows: 0, p_invalid_rows: 0,
            p_error_summary: { message: String(error?.message || error).slice(0, 1000) },
          },
        }).catch(() => undefined);
        console.error('[campaign-audience-import] background import failed', String(error?.message || error));
      }));
      return json(202, { success: true, import_id: importId, status: 'processing' });
    }

    const completed = await processingPromise;
    return json(200, { success: true, ...completed });
  } catch (error: any) {
    if (activeImportId) {
      await requestRest({
        baseUrl, apiKey: serviceKey, token: serviceKey,
        path: 'rpc/update_advertising_campaign_import_progress', method: 'POST',
        body: {
          p_import_id: activeImportId, p_status: 'failed', p_total_rows: 0,
          p_processed_rows: 0, p_valid_rows: 0, p_duplicate_rows: 0, p_invalid_rows: 0,
          p_error_summary: { message: String(error?.message || error).slice(0, 1000) },
        },
      }).catch(() => undefined);
    }
    return json(400, { success: false, import_id: activeImportId, status: 'failed', message: String(error?.message || error || 'ورود مخاطبان ناموفق بود.') });
  }
});
