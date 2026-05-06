import { describe, expect, it } from 'vitest';
import { extractBotMessageAttachments } from './messageAttachments';

describe('extractBotMessageAttachments', () => {
  it('dedupes payload and top-level urls while preserving mime metadata', () => {
    const attachments = extractBotMessageAttachments({
      file_url: 'https://example.com/a.jpg',
      file_name: 'a.jpg',
      mime_type: 'image/jpeg',
      payload: {
        media_url: 'https://example.com/a.jpg',
        attachments: [
          { url: 'https://example.com/a.jpg', mime_type: 'image/jpeg' },
          { url: 'https://example.com/b.pdf', file_name: 'b.pdf', mime_type: 'application/pdf' },
        ],
      },
    });

    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toMatchObject({ url: 'https://example.com/a.jpg', mimeType: 'image/jpeg' });
    expect(attachments[1]).toMatchObject({ url: 'https://example.com/b.pdf', mimeType: 'application/pdf' });
  });
});

