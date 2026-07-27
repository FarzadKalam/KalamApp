import { describe, expect, it } from 'vitest';
import { getMessageListPreview } from './messagePreview';

describe('getMessageListPreview', () => {
  it('renders structured note content without exposing JSON fields', () => {
    expect(getMessageListPreview(JSON.stringify({
      text: 'نمونه پیام',
      attachments: [{ name: 'photo.jpg', url: 'https://example.test/photo.jpg', mimeType: 'image/jpeg' }],
    }))).toBe('نمونه پیام · تصویر');
  });

  it('uses a clear attachment label when there is no text', () => {
    expect(getMessageListPreview(JSON.stringify({
      text: '',
      attachments: [{ name: 'report.pdf', url: 'https://example.test/report.pdf', mimeType: 'application/pdf' }],
    }))).toBe('فایل: report.pdf');
  });

  it('summarizes multiple attachments compactly', () => {
    expect(getMessageListPreview('', {
      attachments: [
        { name: 'one.jpg', fileType: 'image' },
        { name: 'two.mp4', fileType: 'video' },
      ],
    })).toBe('۲ پیوست');
  });
});
