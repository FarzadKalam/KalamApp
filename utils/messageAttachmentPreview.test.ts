import { describe, expect, it } from 'vitest';
import { canPreviewLocalMessageImage, getMessageAttachmentPreviewUrl } from './messageAttachmentPreview';

describe('bounded message image previews', () => {
  const attachment = { name: 'photo.jpg', url: 'https://api.test/storage/v1/object/public/images/photo.jpg' };
  it('requests only a bounded server thumbnail for legacy images of unknown size', () => {
    const url = getMessageAttachmentPreviewUrl(attachment)!;
    expect(url).toContain('/render/image/public/'); expect(url).toContain('width=260'); expect(url).toContain('height=260');
  });
  it('does not fetch heavy originals, TIFFs or unknown external images', () => {
    expect(getMessageAttachmentPreviewUrl({ ...attachment, sizeBytes: 60 * 1024 * 1024 })).toBeNull();
    expect(getMessageAttachmentPreviewUrl({ ...attachment, name: 'scan.tiff' })).toBeNull();
    expect(getMessageAttachmentPreviewUrl({ ...attachment, url: 'https://external.test/photo.jpg' })).toBeNull();
    expect(canPreviewLocalMessageImage(new Blob(['small']), 'scan.tiff')).toBe(false);
  });
  it('prefers an existing thumbnail even for heavy scans', () => {
    expect(getMessageAttachmentPreviewUrl({ ...attachment, name: 'scan.tiff', sizeBytes: 60000000, thumbnailUrl: 'https://api.test/small.webp' })).toBe('https://api.test/small.webp');
  });
});
