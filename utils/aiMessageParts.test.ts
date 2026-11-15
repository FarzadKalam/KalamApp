import { describe, expect, it } from 'vitest';
import { extractAiMessageAttachments, normalizeAiMessageText, removeAiAttachmentCaptions } from './aiMessageParts';

describe('aiMessageParts', () => {
  it('hides old generated captions only for an actual attachment, preserving user prose', () => {
    expect(removeAiAttachmentCaptions('ثبت کن\nتصویر: photo.jpg', [{ name: 'photo.jpg' }])).toBe('ثبت کن');
    expect(removeAiAttachmentCaptions('فایل: شرایط مشتری', [{ name: 'photo.jpg' }])).toBe('فایل: شرایط مشتری');
  });
  it('normalizes structured ai text blocks', () => {
    expect(normalizeAiMessageText([
      { type: 'output_text', text: 'متن اول' },
      { type: 'output_text', text: 'متن دوم' },
    ])).toBe('متن اول\nمتن دوم');
  });

  it('extracts attachments from ai metadata and bundle inputs', () => {
    const attachments = extractAiMessageAttachments({
      content: [{ type: 'image_url', image_url: { url: 'https://example.test/image.png' } }],
      metadata: {
        file: { url: 'https://example.test/doc.pdf', fileName: 'doc.pdf', mimeType: 'application/pdf' },
        bundle_inputs: [
          { type: 'image', filename: 'photo.jpg', data: 'data:image/jpeg;base64,aaa', mimeType: 'image/jpeg' },
        ],
      },
    });
    expect(attachments).toHaveLength(3);
    expect(attachments.map((item) => item.name)).toEqual(['doc.pdf', 'photo.jpg', 'image.png']);
  });
});
