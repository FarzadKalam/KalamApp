import { describe, expect, it } from 'vitest';
import { collectBotMessageMediaFileRefs, extractBotMessageAttachments } from './messageAttachments';
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

  it('rewrites legacy storage hosts before rendering media', () => {
    const attachments = extractBotMessageAttachments({
      payload: {
        attachments: [{
          name: 'voice.webm',
          url: 'https://api.kalamapp.ir/storage/v1/object/public/images/record_files/notes/unlinked/voice.webm',
          mime_type: 'audio/webm',
          file_type: 'voice',
        }],
      },
    });

    expect(attachments[0]?.url).toBe('https://api.tazesystem.ir/storage/v1/object/public/images/record_files/notes/unlinked/voice.webm');
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

  it('reads Rubika-style media urls from alternate payload fields', () => {
    const attachments = extractBotMessageAttachments({
      message_type: 'image',
      payload: {
        download_url: 'https://api.tazesystem.ir/storage/v1/object/public/bot-media/rubika/photo.webp',
        filename: 'photo.webp',
        media_type: 'image',
      },
    });

    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.name).toBe('photo.webp');
    expect(attachments[0]?.fileType).toBe('image');
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

  it('uses stored mime type when Rubika imports an image as a generic file', () => {
    const attachments = extractBotMessageAttachments({
      message_type: 'file',
      payload: {
        attachments: [
          {
            name: 'rubika-file',
            url: 'https://api.tazesystem.ir/storage/v1/object/public/images/rubika/rubika-file',
            mime_type: 'image/webp',
            file_type: 'file',
          },
        ],
      },
    });

    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.fileType).toBe('image');
  });

  it('recognizes official Rubika media type names', () => {
    expect(resolveNoteAttachmentFileType({ fileType: 'GalleryImage', name: 'rubika' })).toBe('image');
    expect(resolveNoteAttachmentFileType({ fileType: 'CameraVideo', name: 'rubika' })).toBe('video');
    expect(resolveNoteAttachmentFileType({ fileType: 'Gif', mimeType: 'video/mp4' })).toBe('video');
    expect(resolveNoteAttachmentFileType({ fileType: 'Music', name: 'track' })).toBe('audio');
    expect(resolveNoteAttachmentFileType({ fileType: 'RecordAudio', mimeType: 'audio/mpeg' })).toBe('voice');
  });

  it('finds legacy nested Rubika file ids for later media hydration', () => {
    const refs = collectBotMessageMediaFileRefs({
      message_type: 'image',
      file_name: 'photo.png',
      payload: {
        update: {
          new_message: {
            file: {
              file_id: 'rubika-file-1',
              file_name: 'photo.png',
            },
            aux_data: {
              type: 'GalleryImage',
            },
          },
        },
      },
    });

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      fileId: 'rubika-file-1',
      fileName: 'photo.png',
      fileType: 'image',
    });
  });

  it('keeps nested voice payloads as voice attachments even without text', () => {
    const attachments = extractBotMessageAttachments({
      message_type: 'voice',
      payload: {
        update: {
          new_message: {
            voice: {
              file_id: 'voice-file-1',
              file_name: 'voice.ogg',
              url: 'https://api.tazesystem.ir/storage/v1/object/public/bot-media/rubika/voice.ogg',
              mime_type: 'audio/ogg',
            },
          },
        },
      },
    });

    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      name: 'voice.ogg',
      fileType: 'voice',
    });
  });

  it('keeps nested voice file ids retryable as voice', () => {
    const refs = collectBotMessageMediaFileRefs({
      message_type: 'voice',
      payload: {
        update: {
          new_message: {
            voice: {
              file_id: 'voice-file-2',
              file_name: 'voice.opus',
            },
          },
        },
      },
    });

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      fileId: 'voice-file-2',
      fileName: 'voice.opus',
      fileType: 'voice',
    });
  });

  it('keeps captioned media text separate from the media attachment type', () => {
    const attachments = extractBotMessageAttachments({
      message_type: 'image',
      payload: {
        attachments: [
          {
            name: 'photo.jpg',
            url: 'https://api.tazesystem.ir/storage/v1/object/public/bot-media/telegram/photo.jpg',
            mime_type: 'image/jpeg',
            file_type: 'image',
          },
        ],
      },
    });

    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.fileType).toBe('image');
  });
});
