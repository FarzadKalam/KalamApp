import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upload, signedUrl, rpc, from } = vi.hoisted(() => {
  const upload = vi.fn();
  const signedUrl = vi.fn();
  const rpc = vi.fn();
  const from = vi.fn(() => ({ upload, createSignedUrl: signedUrl }));
  return { upload, signedUrl, rpc, from };
});
vi.mock('../supabaseClient', () => ({ supabase: { storage: { from }, rpc } }));

import { getSupportFileUrl, uploadSupportFiles } from './supportTickets';

describe('private support attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: null });
    signedUrl.mockResolvedValue({ data: { signedUrl: 'https://private.example/file' }, error: null });
  });

  it('rejects unsupported files before writing a storage object', async () => {
    const file = new File(['content'], 'script.js', { type: 'text/javascript' });
    await expect(uploadSupportFiles('ticket', 'message', [file])).rejects.toThrow('مجاز نیست');
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('registers each private object against its ticket message', async () => {
    const file = new File(['content'], 'guide.txt', { type: 'text/plain' });
    await uploadSupportFiles('ticket', 'message', [file]);
    expect(from).toHaveBeenCalledWith('saas-support-private');
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^ticket\/message\/[a-f0-9-]+\.txt$/), file,
      { contentType: 'text/plain', upsert: false });
    expect(rpc).toHaveBeenCalledWith('support_register_attachment', expect.objectContaining({
      p_message_id: 'message', p_file_name: 'guide.txt', p_mime_type: 'text/plain', p_file_size: file.size,
    }));
  });

  it('requests a short-lived URL from the private bucket', async () => {
    const url = await getSupportFileUrl({ id: 'attachment', file_name: 'guide.txt', mime_type: 'text/plain',
      file_size: 7, object_path: 'ticket/message/file.txt' });
    expect(url).toBe('https://private.example/file');
    expect(from).toHaveBeenCalledWith('saas-support-private');
    expect(signedUrl).toHaveBeenCalledWith('ticket/message/file.txt', 60);
  });
});
