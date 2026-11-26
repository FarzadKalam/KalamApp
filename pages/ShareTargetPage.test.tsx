import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { createUploadTask, dismissUploadTask, finishUploadTask, updateUploadTaskProgress } from '../utils/uploadProgressStore';
import ShareTargetPage from './ShareTargetPage';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), insertNotes: vi.fn(), removeInbox: vi.fn() }));

vi.mock('../supabaseClient', () => {
  const chain = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain,
    limit: async () => ({ data: [], error: null }) };
  return { supabase: { from: () => chain } };
});
vi.mock('../utils/sessionCache', () => ({
  fetchSessionBootstrap: async () => ({ user: { id: 'sender' }, orgId: 'organization' }),
}));
vi.mock('../utils/profileDirectory', () => ({
  loadProfilesWithCompat: async () => ({ data: [{ id: 'recipient', full_name: 'همکار' }], error: null }),
}));
vi.mock('../utils/webShareInbox', () => ({
  getSharedInboxPayload: async () => ({
    id: 'test-share', title: '', text: '', url: '', createdAt: 0,
    files: [{ name: 'اول.txt' }, { name: 'دوم.txt' }],
  }),
  sharedInboxFileToFile: ({ name }: { name: string }) => new File(['data'], name, { type: 'text/plain' }),
  removeSharedInboxPayload: mocks.removeInbox,
}));
vi.mock('../utils/storageClient', () => ({
  FILE_STORAGE_BUCKET: 'test-files',
  fileStorageClient: { storage: { from: () => ({
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://files.example.test/${path}` } }),
  }) } },
}));
vi.mock('../utils/uploadFileWithProgress', () => ({
  uploadFileWithProgress: mocks.upload, isUploadCanceledError: () => false,
}));
vi.mock('../utils/noteDispatch', () => ({ insertNotesWithFallback: mocks.insertNotes }));
vi.mock('../utils/channelSettings', () => ({ getActiveChannelSettings: async () => ({}) }));
vi.mock('../utils/fileShortLinks', () => ({
  shortenAttachmentsForExternalShare: async (attachments: unknown[]) => attachments,
}));

const taskIds: string[] = [];
afterEach(() => {
  cleanup();
  taskIds.splice(0).forEach(dismissUploadTask);
  window.localStorage.clear();
  vi.clearAllMocks();
});

it('shows each shared file’s progress and sends only after the last upload succeeds', async () => {
  const finishFiles: Array<() => void> = [];
  mocks.upload.mockImplementation(({ file, onTaskCreated }: any) => new Promise<void>((resolve) => {
    const id = createUploadTask(file.name, file.size);
    taskIds.push(id);
    onTaskCreated(id);
    finishFiles.push(() => { finishUploadTask(id); resolve(); });
  }));
  render(<App><MemoryRouter initialEntries={['/share-target?share_id=test-share']}><ShareTargetPage /></MemoryRouter></App>);
  fireEvent.click(await screen.findByRole('button', { name: /^ارسال$/ }));
  expect(await screen.findByText('بارگذاری فایل ۱ از ۲')).toBeInTheDocument();
  act(() => updateUploadTaskProgress(taskIds[0], 2, 4));
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  expect(mocks.insertNotes).not.toHaveBeenCalled();

  await act(async () => finishFiles[0]());
  expect(screen.getByText('بارگذاری فایل ۲ از ۲')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  expect(mocks.upload).toHaveBeenNthCalledWith(2, expect.objectContaining({ allowManualRetry: false }));
  await act(async () => finishFiles[1]());
  await waitFor(() => expect(mocks.insertNotes).toHaveBeenCalledTimes(1));
  expect(mocks.removeInbox).toHaveBeenCalledWith('test-share');
});
