import { beforeEach, describe, expect, it, vi } from 'vitest';

const tusMock = vi.hoisted(() => ({
  requestHeaders: new Map<string, string[]>(),
}));

vi.mock('tus-js-client', () => ({
  isSupported: true,
  Upload: class MockTusUpload {
    private readonly options: any;

    constructor(_file: Blob, options: any) {
      this.options = options;
    }

    findPreviousUploads() {
      return Promise.resolve([]);
    }

    resumeFromPreviousUpload() {}

    start() {
      tusMock.requestHeaders.clear();
      Object.entries(this.options.headers || {}).forEach(([name, value]) => {
        tusMock.requestHeaders.set(name.toLowerCase(), [String(value)]);
      });
      const request = {
        setHeader: (name: string, value: string) => {
          const normalizedName = name.toLowerCase();
          const values = tusMock.requestHeaders.get(normalizedName) || [];
          tusMock.requestHeaders.set(normalizedName, [...values, value]);
        },
      };
      void Promise.resolve(this.options.onBeforeRequest(request)).then(() => this.options.onSuccess());
    }

    abort() {
      return Promise.resolve();
    }
  },
}));

import {
  getUploadFileSizeError,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES,
  shouldUseResumableUpload,
  uploadFileWithProgress,
} from './uploadFileWithProgress';

describe('uploadFileWithProgress limits', () => {
  beforeEach(() => {
    tusMock.requestHeaders.clear();
  });

  it('accepts files up to and including 500 MiB', () => {
    expect(getUploadFileSizeError({ size: MAX_UPLOAD_FILE_SIZE_BYTES })).toBeNull();
  });

  it('rejects files larger than 500 MiB with a Persian message', () => {
    expect(getUploadFileSizeError({ size: MAX_UPLOAD_FILE_SIZE_BYTES + 1 })).toContain('۵۰۰ مگابایت');
  });

  it('uses resumable uploads only above the 6 MiB standard-upload boundary', () => {
    expect(shouldUseResumableUpload({ size: RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES })).toBe(false);
    expect(shouldUseResumableUpload({ size: RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES + 1 })).toBe(true);
  });

  it('sets resumable authentication headers exactly once per request', async () => {
    const accessToken = 'header.payload.signature';
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: accessToken } } }),
      },
    };
    const file = new File(
      [new Uint8Array(RESUMABLE_UPLOAD_CHUNK_SIZE_BYTES + 1)],
      'large-file.bin',
      { type: 'application/octet-stream' },
    );

    await uploadFileWithProgress({
      client: client as any,
      bucket: 'images',
      path: 'record_files/test/large-file.bin',
      file,
    });

    expect(tusMock.requestHeaders.get('authorization')).toEqual([`Bearer ${accessToken}`]);
    expect(tusMock.requestHeaders.get('apikey')).toHaveLength(1);
  });
});
