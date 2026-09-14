import { describe, expect, it } from 'vitest';

import {
  getUploadFileSizeError,
  MAX_UPLOAD_FILE_SIZE_BYTES,
} from './uploadFileWithProgress';

describe('uploadFileWithProgress limits', () => {
  it('accepts files up to and including 500 MiB', () => {
    expect(getUploadFileSizeError({ size: MAX_UPLOAD_FILE_SIZE_BYTES })).toBeNull();
  });

  it('rejects files larger than 500 MiB with a Persian message', () => {
    expect(getUploadFileSizeError({ size: MAX_UPLOAD_FILE_SIZE_BYTES + 1 })).toContain('۵۰۰ مگابایت');
  });

  it('accepts files above the former resumable threshold when they are within the size limit', () => {
    expect(getUploadFileSizeError({ size: 7 * 1024 * 1024 })).toBeNull();
  });
});
