import type { SupabaseClient } from '@supabase/supabase-js';
import { FILE_STORAGE_ANON_KEY, FILE_STORAGE_URL, fileStorageClient } from './storageClient';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../supabaseClient';
import {
  createUploadTask,
  dismissUploadTask,
  failUploadTask,
  finishUploadTask,
  markUploadTaskCanceled,
  setUploadTaskCancel,
  setUploadTaskRetry,
  updateUploadTaskProgress,
} from './uploadProgressStore';

type AnySupabaseClient = SupabaseClient<any, 'public', any>;

type UploadFileWithProgressOptions = {
  client: AnySupabaseClient;
  bucket: string;
  path: string;
  file: File | Blob;
  upsert?: boolean;
  cacheControl?: string;
  contentType?: string;
  metadata?: Record<string, any>;
  label?: string;
  detail?: string;
};

export class UploadCanceledError extends Error {
  constructor() {
    super('آپلود لغو شد.');
    this.name = 'UploadCanceledError';
  }
}

const resolveClientConfig = (client: AnySupabaseClient) => {
  if (client === fileStorageClient) {
    return {
      url: FILE_STORAGE_URL,
      anonKey: FILE_STORAGE_ANON_KEY,
    };
  }

  if (client === supabase) {
    return {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
    };
  }

  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  };
};

const encodeStorageObjectUrl = (baseUrl: string, bucket: string, path: string) => {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const encodedPath = path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${normalizedBase}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
};

const normalizeLabel = (path: string, explicitLabel?: string) => {
  if (explicitLabel?.trim()) return explicitLabel.trim();
  const fileName = path.split('/').filter(Boolean).pop();
  return fileName || 'فایل';
};

const readErrorMessage = (xhr: XMLHttpRequest) => {
  try {
    const parsed = JSON.parse(xhr.responseText || '{}');
    return String(parsed?.message || parsed?.error || xhr.statusText || 'خطا در آپلود فایل').trim();
  } catch {
    return String(xhr.statusText || 'خطا در آپلود فایل').trim();
  }
};

export const isUploadCanceledError = (error: unknown) =>
  error instanceof UploadCanceledError || String((error as any)?.name || '') === 'UploadCanceledError';

export const uploadFileWithProgress = async ({
  client,
  bucket,
  path,
  file,
  upsert = false,
  cacheControl = '3600',
  contentType,
  metadata,
  label,
  detail,
}: UploadFileWithProgressOptions) => {
  const { url, anonKey } = resolveClientConfig(client);
  const { data } = await client.auth.getSession();
  const accessToken = data?.session?.access_token || null;
  const authorizationToken = accessToken || anonKey;
  const totalBytes =
    file instanceof File || file instanceof Blob
      ? Number(file.size || 0)
      : 0;

  const taskId = createUploadTask(normalizeLabel(path, label), totalBytes, detail);
  setUploadTaskRetry(taskId, () => {
    dismissUploadTask(taskId);
    void uploadFileWithProgress({
      client,
      bucket,
      path,
      file,
      upsert,
      cacheControl,
      contentType,
      metadata,
      label,
      detail,
    });
  });
  const formData = new FormData();
  formData.append('cacheControl', cacheControl);
  if (metadata) {
    formData.append('metadata', JSON.stringify(metadata));
  }
  if (contentType && file instanceof File && !file.type) {
    formData.append('', file, file.name);
  } else if (file instanceof File) {
    formData.append('', file, file.name);
  } else {
    formData.append('', file, normalizeLabel(path, label));
  }

  return await new Promise<{ id?: string; path: string; fullPath: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    setUploadTaskCancel(taskId, () => xhr.abort());

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      updateUploadTaskProgress(taskId, event.loaded, event.total);
    });

    xhr.addEventListener('abort', () => {
      markUploadTaskCanceled(taskId);
      reject(new UploadCanceledError());
    });

    xhr.addEventListener('error', () => {
      const message = 'ارتباط با سرور هنگام آپلود قطع شد.';
      failUploadTask(taskId, message);
      reject(new Error(message));
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finishUploadTask(taskId);
        let parsed: any = {};
        try {
          parsed = JSON.parse(xhr.responseText || '{}');
        } catch {
          parsed = {};
        }
        resolve({
          id: parsed?.Id ? String(parsed.Id) : undefined,
          path,
          fullPath: parsed?.Key ? String(parsed.Key) : `${bucket}/${path}`,
        });
        return;
      }

      const message = readErrorMessage(xhr);
      failUploadTask(taskId, message);
      const error = new Error(message);
      (error as any).status = xhr.status;
      reject(error);
    });

    xhr.open('POST', encodeStorageObjectUrl(url, bucket, path), true);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('x-upsert', String(Boolean(upsert)));
    xhr.setRequestHeader('x-client-info', 'kalamapp-upload-progress/1.0');
    xhr.setRequestHeader('authorization', `Bearer ${authorizationToken}`);
    xhr.send(formData);
  });
};
