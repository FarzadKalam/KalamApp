import { fetchSessionBootstrap } from './sessionCache';

type PendingUpload = { task: Promise<unknown>; scope: Promise<string> };
const pendingUploads = new Map<string, Set<PendingUpload>>();
const uploadScope = async (client: any) => {
  const session = await fetchSessionBootstrap(client);
  return `${session.orgId || ''}:${session.user?.id || ''}`;
};
export const trackMainFileUpload = (client: any, moduleId: string, task: Promise<unknown>) => {
  const tasks = pendingUploads.get(moduleId) || new Set<PendingUpload>();
  pendingUploads.set(moduleId, tasks);
  const pending = { task, scope: uploadScope(client) };
  tasks.add(pending);
  void task.finally(() => { tasks.delete(pending); if (!tasks.size) pendingUploads.delete(moduleId); }).catch(() => undefined);
};
export const waitForMainFileUploads = async (client: any, moduleId: string) => {
  if (!pendingUploads.get(moduleId)?.size) return;
  const scope = await uploadScope(client);
  await Promise.all([...(pendingUploads.get(moduleId) || [])].map(async (pending) => {
    if (await pending.scope === scope) await pending.task;
  }));
};

export type MainRecordFile = {
  file_url: string;
  file_name: string | null;
  mime_type: string | null;
  file_type: 'image' | 'video' | 'file';
};

export const mergeMainRecordFiles = (files: MainRecordFile[]) =>
  [...new Map(files.filter((file) => file.file_url).map((file) => [file.file_url, file])).values()];

const draftKey = (orgId: string, userId: string, moduleId: string, url: string) =>
  `main-record-files:${orgId}:${userId}:${moduleId}:${url}`;

// Keep draft attachments with the draft's main URL, scoped to its organization and user.
export const stageMainRecordFiles = async (client: any, moduleId: string, previousUrl: string, mainUrl: string, files: MainRecordFile[]) => {
  const session = await fetchSessionBootstrap(client);
  if (!session.orgId || !session.user?.id) throw new Error('سازمان یا کاربر برای ثبت فایل مشخص نیست.');
  const previousKey = draftKey(session.orgId, session.user.id, moduleId, previousUrl);
  const previous = JSON.parse(sessionStorage.getItem(previousKey) || '[]') as MainRecordFile[];
  sessionStorage.setItem(draftKey(session.orgId, session.user.id, moduleId, mainUrl), JSON.stringify(mergeMainRecordFiles([...previous, ...files])));
  if (previousUrl !== mainUrl) sessionStorage.removeItem(previousKey);
};

export const persistStagedMainRecordFiles = async (client: any, moduleId: string, table: string, mainUrl: string, recordId?: string | null) => {
  if (!mainUrl) return;
  const session = await fetchSessionBootstrap(client);
  if (!session.orgId || !session.user?.id) return;
  const key = draftKey(session.orgId, session.user.id, moduleId, mainUrl);
  const files = JSON.parse(sessionStorage.getItem(key) || '[]') as MainRecordFile[];
  if (!files.length) return;
  let targetId = recordId;
  if (!targetId) {
    const result = await client.from(table).select('id').eq('org_id', session.orgId).eq('image_url', mainUrl).limit(2);
    if (result.error) throw result.error;
    if (result.data?.length !== 1) throw new Error('رکورد ذخیره‌شده برای اتصال پیوست‌ها مشخص نیست.');
    targetId = result.data[0].id;
  }
  const existing = await client.from('record_files').select('file_url').eq('org_id', session.orgId).eq('module_id', moduleId).eq('record_id', targetId).in('file_url', files.map((file) => file.file_url));
  if (existing.error) throw existing.error;
  const urls = new Set((existing.data || []).map((file: any) => file.file_url));
  const missing = files.filter((file) => !urls.has(file.file_url));
  if (missing.length) {
    const result = await client.from('record_files').insert(missing.map((file, index) => ({ ...file, org_id: session.orgId, module_id: moduleId, record_id: targetId, sort_order: index })));
    if (result.error) throw result.error;
  }
  sessionStorage.removeItem(key);
};
