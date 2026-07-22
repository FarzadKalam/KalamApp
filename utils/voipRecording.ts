import { supabase } from '../supabaseClient';
import { uploadNoteAttachments } from './noteAttachments';
import type { NoteAttachment } from './noteContent';

export type VoipRecordingCall = {
  id?: string | null;
  call_id?: string | null;
  file_id?: string | null;
  recording_url?: string | null;
  source_number?: string | null;
  destination_number?: string | null;
  started_at?: string | null;
  metadata?: Record<string, any> | null;
};

const recordingBlobCache = new Map<string, Promise<Blob>>();

const getRecordingCacheKey = (call: VoipRecordingCall) =>
  String(call.id || call.call_id || call.file_id || call.recording_url || '').trim();

export const hasVoipRecording = (call: VoipRecordingCall | null | undefined) => {
  if (String(call?.recording_url || '').trim()) return true;
  const recordingAvailable = call?.metadata?.recording_available;
  if (recordingAvailable === false || recordingAvailable === 'false') return false;
  return Boolean(String(call?.file_id || '').trim() && String(call?.call_id || '').trim());
};

export const getVoipRecordingFileName = (call: VoipRecordingCall) => {
  const startedAt = String(call.started_at || '').trim().replace(/[:.]/g, '-');
  const suffix = startedAt ? `-${startedAt}` : '';
  return `voip-call${suffix}.mp3`;
};

const fetchRecordingBlob = async (call: VoipRecordingCall): Promise<Blob> => {
  const directUrl = String(call.recording_url || '').trim();
  const callLogId = String(call.id || '').trim();
  let proxyError: unknown = null;
  if (callLogId) {
    try {
      const { data, error } = await supabase.functions.invoke('telefonchy-recording', {
        body: { callLogId },
      });
      if (error) throw error;
      if (data instanceof Blob) {
        return data.type === 'application/octet-stream'
          ? data.slice(0, data.size, 'audio/mpeg')
          : data;
      }
      if (data instanceof ArrayBuffer) return new Blob([data], { type: 'audio/mpeg' });
      throw new Error('پاسخ فایل صوتی تماس معتبر نیست.');
    } catch (error) {
      proxyError = error;
    }
  }

  if (directUrl) {
    const response = await fetch(directUrl);
    if (response.ok) return await response.blob();
  }

  if (proxyError) throw proxyError;
  throw new Error('شناسه گزارش تماس برای دریافت صوت موجود نیست.');
};

export const loadVoipRecordingBlob = async (call: VoipRecordingCall): Promise<Blob> => {
  const cacheKey = getRecordingCacheKey(call);
  if (!cacheKey) return await fetchRecordingBlob(call);
  const cached = recordingBlobCache.get(cacheKey);
  if (cached) return await cached;
  const request = fetchRecordingBlob(call).catch((error) => {
    recordingBlobCache.delete(cacheKey);
    throw error;
  });
  recordingBlobCache.set(cacheKey, request);
  return await request;
};

export const persistVoipRecordingAttachment = async (
  call: VoipRecordingCall,
): Promise<NoteAttachment> => {
  const blob = await loadVoipRecordingBlob(call);
  const fileName = getVoipRecordingFileName(call);
  const file = new File([blob], fileName, { type: blob.type || 'audio/mpeg' });
  const attachments = await uploadNoteAttachments(
    'voip_call_reports',
    String(call.id || '').trim() || null,
    [file],
  );
  const attachment = attachments[0];
  if (!attachment) throw new Error('ذخیره فایل صوتی تماس ناموفق بود.');
  return { ...attachment, fileType: 'audio' };
};
