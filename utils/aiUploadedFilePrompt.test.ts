import { describe, expect, it } from 'vitest';
import { File } from 'node:buffer';
import { buildAiUploadedFilePrompt } from './aiUploadedFilePrompt';

describe('native AI attachment preparation', () => {
  it.each([
    ['calendar.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'file'],
    ['brief.pdf', 'application/pdf', 'file'],
    ['brief.csv', 'text/csv', 'file'],
    ['calendar.png', 'image/png', 'image'],
  ])('forwards the original bytes of %s', async (name, type, inputKind) => {
    const file = new File([new Uint8Array([0, 65, 255])], name, { type });
    const prepared = await buildAiUploadedFilePrompt(file as unknown as globalThis.File, { preferNativeInput: true });
    expect(prepared).toMatchObject({ fileName: name, mimeType: type, inputKind, data: `data:${type};base64,AEH/` });
  });
});
