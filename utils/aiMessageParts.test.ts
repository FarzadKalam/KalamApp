import { describe, expect, it } from 'vitest';
import { extractAiMessageAttachments, normalizeAiMessageText } from './aiMessageParts';

describe('aiMessageParts', () => {
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
