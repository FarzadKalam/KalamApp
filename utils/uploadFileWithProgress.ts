import type { SupabaseClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';
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

export const MAX_UPLOAD_FILE_SIZE_BYTES = 500 * 1024 * 1024;
export const MAX_UPLOAD_FILE_SIZE_LABEL_FA = '۵۰۰ مگابایت';
export const RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

export const getUploadFileSizeError = (file: Pick<Blob, 'size'>) => (
  Number(file?.size || 0) > MAX_UPLOAD_FILE_SIZE_BYTES
    ? `حجم هر فایل باید حداکثر ${MAX_UPLOAD_FILE_SIZE_LABEL_FA} باشد.`
    : null
);

export const shouldUseResumableUpload = (file: Pick<Blob, 'size'>) => (
  Number(file?.size || 0) > RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES
);

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

const encodeResumableStorageUrl = (baseUrl: string) => (
  `${baseUrl.replace(/\/+$/, '')}/storage/v1/upload/resumable`
);

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

const STORAGE_RETRY_DELAYS_MS = [350, 900] as const;

const isTransientStorageStatus = (status: number) =>
  status === 0
  || status === 408
  || status === 425
  || status === 429
  || (status >= 500 && status <= 504);

const waitForStorageRetry = (delayMs: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, delayMs);
});

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
  const fileSizeError = getUploadFileSizeError(file);
  if (fileSizeError) throw new Error(fileSizeError);

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
  let activeXhr: XMLHttpRequest | null = null;
  let cancelActiveResumableUpload: (() => void) | null = null;
  let canceled = false;
  setUploadTaskCancel(taskId, () => {
    canceled = true;
    activeXhr?.abort();
    cancelActiveResumableUpload?.();
  });

  const createFormData = () => {
    const formData = new FormData();
    formData.append('cacheControl', cacheControl);
    if (metadata) formData.append('metadata', JSON.stringify(metadata));
    if (file instanceof File) formData.append('', file, file.name);
    else formData.append('', file, normalizeLabel(path, label));
    return formData;
  };

  const uploadOnce = () => new Promise<{ id?: string; path: string; fullPath: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeXhr = xhr;

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      updateUploadTaskProgress(taskId, event.loaded, event.total);
    });

    xhr.addEventListener('abort', () => {
      reject(new UploadCanceledError());
    });

    xhr.addEventListener('error', () => {
      const error = new Error('ارتباط با سرور هنگام آپلود قطع شد.');
      (error as any).status = 0;
      reject(error);
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
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

      const error = new Error(readErrorMessage(xhr));
      (error as any).status = xhr.status;
      reject(error);
    });

    xhr.open('POST', encodeStorageObjectUrl(url, bucket, path), true);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('x-upsert', String(Boolean(upsert)));
    xhr.setRequestHeader('x-client-info', 'kalamapp-upload-progress/1.0');
    xhr.setRequestHeader('authorization', `Bearer ${authorizationToken}`);
    xhr.send(createFormData());
  });

  const uploadResumable = () => new Promise<{ id?: string; path: string; fullPath: string }>((resolve, reject) => {
    let settled = false;
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve({ path, fullPath: `${bucket}/${path}` });
    };
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error || 'آپلود فایل ناموفق بود.')));
    };
    const fileName = file instanceof File ? file.name : normalizeLabel(path, label);
    const lastModified = file instanceof File ? Number(file.lastModified || 0) : 0;
    const upload = new tus.Upload(file, {
      endpoint: encodeResumableStorageUrl(url),
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        'x-upsert': String(Boolean(upsert)),
        'x-client-info': 'kalamapp-resumable-upload/1.0',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
      chunkSize: RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES,
      fingerprint: async () => [
        'kalamapp-tus-v1',
        url,
        bucket,
        path,
        fileName,
        totalBytes,
        lastModified,
      ].join('::'),
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType || file.type || 'application/octet-stream',
        cacheControl,
        ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
      },
      onBeforeRequest: async (request) => {
        const { data: latestAuthData } = await client.auth.getSession();
        const latestToken = latestAuthData?.session?.access_token || authorizationToken;
        request.setHeader('apikey', anonKey);
        request.setHeader('authorization', `Bearer ${latestToken}`);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        updateUploadTaskProgress(taskId, bytesUploaded, bytesTotal);
      },
      onSuccess: () => {
        if (canceled) {
          finishReject(new UploadCanceledError());
          return;
        }
        finishResolve();
      },
      onError: (error) => {
        if (canceled) {
          finishReject(new UploadCanceledError());
          return;
        }
        finishReject(error);
      },
    });

    cancelActiveResumableUpload = () => {
      void upload.abort(false).finally(() => finishReject(new UploadCanceledError()));
    };

    void upload.findPreviousUploads()
      .catch(() => [])
      .then((previousUploads) => {
        if (canceled) {
          finishReject(new UploadCanceledError());
          return;
        }
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      });
  });

  if (shouldUseResumableUpload(file) && tus.isSupported) {
    try {
      const result = await uploadResumable();
      finishUploadTask(taskId);
      return result;
    } catch (error) {
      cancelActiveResumableUpload = null;
      if (isUploadCanceledError(error) || canceled) {
        markUploadTaskCanceled(taskId);
        throw new UploadCanceledError();
      }
      const message = String((error as any)?.message || 'آپلود فایل ناموفق بود.');
      failUploadTask(taskId, message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= STORAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    if (canceled) {
      markUploadTaskCanceled(taskId);
      throw new UploadCanceledError();
    }

    try {
      const result = await uploadOnce();
      finishUploadTask(taskId);
      return result;
    } catch (error) {
      activeXhr = null;
      if (isUploadCanceledError(error) || canceled) {
        markUploadTaskCanceled(taskId);
        throw new UploadCanceledError();
      }

      lastError = error;
      const status = Number((error as any)?.status || 0);
      if (!isTransientStorageStatus(status) || attempt >= STORAGE_RETRY_DELAYS_MS.length) break;
      await waitForStorageRetry(STORAGE_RETRY_DELAYS_MS[attempt]);
    }
  }

  const message = String((lastError as any)?.message || 'آپلود فایل ناموفق بود.');
  failUploadTask(taskId, message);
  throw lastError instanceof Error ? lastError : new Error(message);
};
