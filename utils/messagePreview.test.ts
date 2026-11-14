import { describe, expect, it } from 'vitest';
import { getMessageListPreview } from './messagePreview';

describe('getMessageListPreview', () => {
  it('renders structured note content without exposing JSON fields', () => {
    expect(getMessageListPreview(JSON.stringify({
      text: 'نمونه پیام',
      attachments: [{ name: 'photo.jpg', url: 'https://example.test/photo.jpg', mimeType: 'image/jpeg' }],
    }))).toBe('نمونه پیام · 📷 تصویر');
  });

  it('uses a clear attachment label when there is no text', () => {
    expect(getMessageListPreview(JSON.stringify({
      text: '',
      attachments: [{ name: 'report.pdf', url: 'https://example.test/report.pdf', mimeType: 'application/pdf' }],
    }))).toBe('📎 report.pdf');
  });

  it('summarizes multiple attachments compactly', () => {
    expect(getMessageListPreview('', {
      attachments: [
        { name: 'one.jpg', fileType: 'image' },
        { name: 'two.mp4', fileType: 'video' },
      ],
    })).toBe('📎 ۲ پیوست');
  });

  it('summarizes multiple images with camera icon', () => {
    expect(getMessageListPreview('', {
      attachments: [
        { name: 'one.jpg', fileType: 'image' },
        { name: 'two.png', fileType: 'image' },
      ],
    })).toBe('📷 ۲ تصویر');
  });

  it('never leaks raw JSON arrays', () => {
    expect(getMessageListPreview(JSON.stringify([
      { name: 'photo.png', url: 'https://example.test/photo.png' },
    ]))).toBe('📷 تصویر');
  });

  it('never leaks truncated attachment JSON', () => {
    const truncated = '{"text":"","attachments":[{"name":"shot.jpg","url":"https://storage.example.test/files/123';
    expect(getMessageListPreview(truncated)).toBe('📷 تصویر');
  });
});
