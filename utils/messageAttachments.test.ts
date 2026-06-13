import { describe, expect, it } from 'vitest';
import { extractBotMessageAttachments } from './messageAttachments';
import { resolveNoteAttachmentFileType } from './noteContent';

describe('extractBotMessageAttachments', () => {
  it('reads multiple bot attachments from payload.attachments', () => {
    const attachments = extractBotMessageAttachments({
      payload: {
        attachments: [
          {
            name: 'img-1.jpg',
            url: 'https://api.tazesystem.ir/storage/v1/object/public/images/a/img-1.jpg',
            mime_type: 'image/jpeg',
            file_type: 'image',
          },
          {
            name: 'img-2.jpg',
            url: 'https://api.tazesystem.ir/storage/v1/object/public/images/a/img-2.jpg',
            mime_type: 'image/jpeg',
            file_type: 'image',
          },
        ],
      },
    });

    expect(attachments).toHaveLength(2);
    expect(attachments.map((item) => item.name)).toEqual(['img-1.jpg', 'img-2.jpg']);
    expect(attachments.every((item) => item.fileType === 'image')).toBe(true);
  });

  it('dedupes repeated album attachments by url', () => {
    const attachments = extractBotMessageAttachments({
      file_url: 'https://api.tazesystem.ir/storage/v1/object/public/images/a/img-1.jpg',
      file_name: 'img-1.jpg',
      mime_type: 'image/jpeg',
      payload: {
        attachments: [
          {
            name: 'img-1.jpg',
            url: 'https://api.tazesystem.ir/storage/v1/object/public/images/a/img-1.jpg',
            mime_type: 'image/jpeg',
            file_type: 'image',
          },
        ],
      },
    });

    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.url).toContain('img-1.jpg');
  });

  it('keeps regular mp3 attachments as audio unless voice is explicit', () => {
    expect(resolveNoteAttachmentFileType({
      name: 'track.mp3',
      mimeType: 'audio/mpeg',
    })).toBe('audio');

    expect(resolveNoteAttachmentFileType({
      name: 'voice.mp3',
      mimeType: 'audio/mpeg',
      fileType: 'voice',
    })).toBe('voice');
  });
});
