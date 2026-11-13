import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Input, Spin, Tag, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  answerWebPhoneCall,
  connectVoipWebPhone,
  dialWebPhone,
  rejectOrHangupWebPhoneCall,
  sendDtmfWebPhone,
  setVoipPanelOpen,
  toggleHoldWebPhone,
  toggleMuteWebPhone,
  transferWebPhoneCall,
  useVoipState,
} from '../../utils/voipStore';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { supabase } from '../../supabaseClient';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { blobToBase64 } from '../../utils/blobBase64';
import { getVoipRecordingFileName, loadVoipRecordingBlob, type VoipRecordingCall } from '../../utils/voipRecording';

// --- Pure SVG Icons (No Emojis) ---
const SvgIcons = {
  Phone: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  PhoneIncoming: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="16 2 16 8 22 8" />
      <line x1="23" y1="1" x2="16" y2="8" />
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  PhoneOutgoing: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="23 7 23 1 17 1" />
      <line x1="16" y1="8" x2="23" y2="1" />
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  PhoneOff: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  Mic: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  MicOff: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  Pause: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  ),
  Play: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  Swap: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  ),
  Keypad: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="4" height="4" rx="1" />
      <rect x="10" y="3" width="4" height="4" rx="1" />
      <rect x="17" y="3" width="4" height="4" rx="1" />
      <rect x="3" y="10" width="4" height="4" rx="1" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <rect x="17" y="10" width="4" height="4" rx="1" />
      <rect x="3" y="17" width="4" height="4" rx="1" />
      <rect x="10" y="17" width="4" height="4" rx="1" />
      <rect x="17" y="17" width="4" height="4" rx="1" />
    </svg>
  ),
  Robot: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8.01" y2="16" />
      <line x1="16" y1="16" x2="16.01" y2="16" />
    </svg>
  ),
  History: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  ChevronDown: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  ChevronUp: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  ),
  Close: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Backspace: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <line x1="18" y1="9" x2="12" y2="15" />
      <line x1="12" y1="9" x2="18" y2="15" />
    </svg>
  ),
  Copy: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  FileText: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  User: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Refresh: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
};

const KEYPAD_ROWS = [
  [{ digit: '1', sub: '' }, { digit: '2', sub: 'ABC' }, { digit: '3', sub: 'DEF' }],
  [{ digit: '4', sub: 'GHI' }, { digit: '5', sub: 'JKL' }, { digit: '6', sub: 'MNO' }],
  [{ digit: '7', sub: 'PQRS' }, { digit: '8', sub: 'TUV' }, { digit: '9', sub: 'WXYZ' }],
  [{ digit: '*', sub: '' }, { digit: '0', sub: '+' }, { digit: '#', sub: '' }],
];

const formatCallDuration = (answeredAtMs: number | null, nowMs: number) => {
  if (!answeredAtMs) return '00:00';
  const totalSec = Math.max(0, Math.floor((nowMs - answeredAtMs) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

type RecentCallItem = {
  id: string;
  counterparty_phone?: string | null;
  direction?: string | null;
  status?: string | null;
  started_at?: string | null;
  duration?: number | null;
  extension?: string | null;
  assignee_name?: string | null;
  recording_url?: string | null;
  file_id?: string | null;
  transcript?: string | null;
  transcript_status?: string | null;
};

type WebPhoneWidgetProps = {
  voipEnabled: boolean;
  dialMode?: string | null;
  planFeatureEnabled: boolean;
};

const WebPhoneWidget: React.FC<WebPhoneWidgetProps> = ({
  voipEnabled,
  dialMode,
  planFeatureEnabled,
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const voip = useVoipState();

  const [dialInput, setDialInput] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [, setShowTransferBox] = useState(false);
  const [showDtmfPad, setShowDtmfPad] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showAiDivertModal, setShowAiDivertModal] = useState(false);
  const [aiBriefText, setAiBriefText] = useState('');
  const [playHoldMusic, setPlayHoldMusic] = useState(true);

  const [busyAction, setBusyAction] = useState(false);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Recent calls history state
  const [recentCalls, setRecentCalls] = useState<RecentCallItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!voipEnabled || !planFeatureEnabled) return;
    if (dialMode === 'webphone_webrtc') {
      void connectVoipWebPhone();
    }
  }, [voipEnabled, planFeatureEnabled, dialMode]);

  useEffect(() => {
    if (!voip.activeCall?.answeredAtMs) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [voip.activeCall?.answeredAtMs]);

  const targetPhoneNumber = useMemo(() => {
    if (voip.activeCall?.remoteNumber) return voip.activeCall.remoteNumber;
    return dialInput.trim();
  }, [voip.activeCall?.remoteNumber, dialInput]);

  const contactInitials = useMemo(() => {
    const name = voip.activeCall?.remoteDisplayName || dialInput || 'تلفن';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}‌${parts[1][0]}`;
    return name.slice(0, 2);
  }, [voip.activeCall?.remoteDisplayName, dialInput]);

  // Fetch recent calls when drawer is expanded
  useEffect(() => {
    if (!showHistoryDrawer) return;
    const phone = targetPhoneNumber.replace(/[^0-9]/g, '');
    let isMounted = true;
    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        let query = supabase
          .from('voip_call_logs')
          .select('id, counterparty_phone, direction, status, started_at, duration, extension, recording_url, file_id, transcript, transcript_status')
          .order('started_at', { ascending: false })
          .limit(8);

        if (phone && phone.length >= 4) {
          query = query.ilike('counterparty_phone', `%${phone.slice(-7)}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (isMounted) {
          setRecentCalls((data as RecentCallItem[]) || []);
        }
      } catch (err) {
        console.warn('Failed to load recent voip calls:', err);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    };
    void fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [showHistoryDrawer, targetPhoneNumber]);

  if (!voipEnabled || !planFeatureEnabled) return null;
  if (!voip.panelOpen && !voip.activeCall) return null;

  const activeCall = voip.activeCall;

  const handleDial = async () => {
    const clean = dialInput.trim();
    if (!clean) return;
    setBusyAction(true);
    try {
      await dialWebPhone(clean);
      setDialInput('');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'برقراری تماس ناموفق بود.'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleAnswer = async () => {
    setBusyAction(true);
    try {
      await answerWebPhoneCall();
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'پاسخ به تماس ناموفق بود.'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleHangup = async () => {
    setBusyAction(true);
    try {
      await rejectOrHangupWebPhoneCall();
      setShowTransferBox(false);
      setShowDtmfPad(false);
      setShowAiDivertModal(false);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'پایان تماس ناموفق بود.'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget.trim()) return;
    setBusyAction(true);
    try {
      await transferWebPhoneCall(transferTarget.trim());
      message.success('درخواست انتقال تماس به داخلی مقصد ارسال شد.');
      setTransferTarget('');
      setShowTransferBox(false);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'انتقال تماس ناموفق بود.'));
    } finally {
      setBusyAction(false);
    }
  };

  // AI Voice Responder Handover
  const handleAiDivert = async () => {
    setBusyAction(true);
    try {
      // 1. Brief the model / log context if provided
      if (aiBriefText.trim()) {
        await supabase.from('voip_call_logs').update({
          metadata: {
            ai_brief: aiBriefText.trim(),
            ai_handover_at: new Date().toISOString(),
            hold_music: playHoldMusic,
          },
        }).eq('id', activeCall?.callId || '');
      }
      // 2. Blind transfer to the AI Voice Responder extension (e.g. '800' or designated IVR node)
      await transferWebPhoneCall('800');
      message.success('تماس با موفقیت به پاسخگوی هوش مصنوعی واگذار شد.');
      setShowAiDivertModal(false);
      setAiBriefText('');
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'واگذاری تماس به هوش مصنوعی ناموفق بود.'));
    } finally {
      setBusyAction(false);
    }
  };

  // Fast AI Speech-to-Text Transcription for Call History
  const handleTranscribeAudio = async (callItem: RecentCallItem) => {
    setTranscribingId(callItem.id);
    try {
      message.loading({ content: 'در حال استخراج و تبدیل صوت با مدل هوش مصنوعی...', key: 'ai-transcribe' });
      const mockCall: VoipRecordingCall = {
        id: callItem.id,
        recording_url: callItem.recording_url,
        file_id: callItem.file_id,
        started_at: callItem.started_at,
      };
      const blob = await loadVoipRecordingBlob(mockCall);
      const base64Audio = await blobToBase64(blob);

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'transcribe_voice',
          context: { mode: 'record', moduleId: 'voip_call_reports', recordId: callItem.id },
          audio: {
            data: base64Audio,
            mimeType: blob.type || 'audio/mpeg',
            filename: getVoipRecordingFileName(mockCall),
          },
        },
      });

      if (error) throw error;
      const resultText = String(data?.transcript || '').trim();
      if (!resultText) throw new Error('متنی از فایل صوتی دریافت نشد.');

      await supabase.from('voip_call_logs').update({
        transcript: resultText,
        transcript_status: 'ready',
        transcript_at: new Date().toISOString(),
      }).eq('id', callItem.id);

      setRecentCalls((prev) =>
        prev.map((c) => (c.id === callItem.id ? { ...c, transcript: resultText, transcript_status: 'ready' } : c))
      );
      message.success({ content: 'متن مکالمه با هوش مصنوعی آماده شد (هزینه طبق پلن منظور شد).', key: 'ai-transcribe' });
    } catch (err: any) {
      message.error({ content: toFaErrorMessage(err, 'تبدیل صوت به متن ناموفق بود.'), key: 'ai-transcribe' });
    } finally {
      setTranscribingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    message.success('متن در کلیپ‌بورد کپی شد.');
  };

  const openMatchedRecord = () => {
    if (!activeCall?.matchedContact) return;
    const { moduleId, recordId } = activeCall.matchedContact;
    navigate(`/${moduleId}/${recordId}`);
  };

  return (
    <div
      dir="rtl"
      className="fixed bottom-5 left-5 z-[1050] w-[326px] max-w-[calc(100vw-2.5rem)] rounded-3xl border border-slate-200/90 dark:border-[#242f3d] bg-white/95 dark:bg-[#17212b]/95 backdrop-blur-2xl shadow-2xl shadow-black/40 text-slate-800 dark:text-slate-100 overflow-hidden transition-all duration-300 font-sans"
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[#232e3c] bg-slate-50/70 dark:bg-[#1f2b38]/70">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${voip.status === 'registered' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : voip.status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-xs font-bold text-slate-900 dark:text-white">تلفن اینترنتی تازه سیستم</span>
          {voip.extension ? (
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              {voip.extension}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip title="اتصال مجدد">
            <button
              onClick={() => void connectVoipWebPhone({ force: true })}
              className="p-1 rounded-full text-slate-400 hover:text-sky-400 transition"
              aria-label="اتصال مجدد"
            >
              <SvgIcons.Refresh className={`w-3.5 h-3.5 ${voip.status === 'connecting' ? 'animate-spin' : ''}`} />
            </button>
          </Tooltip>
          {!activeCall ? (
            <button
              onClick={() => setVoipPanelOpen(false)}
              className="p-1 rounded-full text-slate-400 hover:text-rose-400 transition"
              aria-label="بستن شماره‌گیر"
            >
              <SvgIcons.Close className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Body */}
      <div className="p-4 space-y-3.5">
        {voip.errorMessage && voip.status !== 'registered' ? (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            {voip.errorMessage}
          </div>
        ) : null}

        {/* ACTIVE CALL STATE (TELEGRAM DESKTOP STYLE) */}
        {activeCall ? (
          <div className="space-y-4">
            {/* Telegram Circular Avatar & Waveform */}
            <div className="text-center space-y-2 py-1">
              <div className="relative w-16 h-16 mx-auto">
                <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-sky-500/30">
                  {contactInitials}
                </div>
                {activeCall.state === 'active' ? (
                  <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-[#17212b]" />
                ) : (
                  <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-amber-400 border-2 border-white dark:border-[#17212b] animate-ping" />
                )}
              </div>

              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                  {activeCall.remoteDisplayName}
                </div>
                {activeCall.remoteDisplayName !== activeCall.remoteNumber ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5" dir="ltr">
                    {activeCall.remoteNumber}
                  </div>
                ) : null}
              </div>

              {/* Live Audio Equalizer Waveform during Call */}
              {activeCall.state === 'active' ? (
                <div className="flex items-center justify-center gap-1.5 py-1">
                  <span className="w-1 h-3 bg-sky-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1 h-5 bg-sky-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1 h-7 bg-sky-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  <span className="w-1 h-4 bg-sky-400 rounded-full animate-bounce [animation-delay:200ms]" />
                  <span className="w-1 h-6 bg-sky-400 rounded-full animate-bounce [animation-delay:100ms]" />
                  <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400 font-bold mr-2">
                    {formatCallDuration(activeCall.answeredAtMs, nowMs)}
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {activeCall.direction === 'incoming' ? 'تماس ورودی در حال زنگ خوردن...' : 'در حال برقراری ارتباط...'}
                </div>
              )}

              {/* Matched CRM Contact Link */}
              {activeCall.matchedContact ? (
                <button
                  onClick={openMatchedRecord}
                  className="inline-flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 hover:underline pt-0.5 font-medium"
                >
                  <SvgIcons.User className="w-3.5 h-3.5" />
                  <span>پرونده {activeCall.matchedContact.title}</span>
                </button>
              ) : null}
            </div>

            {/* Call Control Actions */}
            {activeCall.state === 'ringing' && activeCall.direction === 'incoming' ? (
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  disabled={busyAction}
                  onClick={handleAnswer}
                  className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition"
                >
                  <SvgIcons.PhoneIncoming className="w-4 h-4" />
                  <span>پاسخ</span>
                </button>
                <button
                  disabled={busyAction}
                  onClick={handleHangup}
                  className="py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition"
                >
                  <SvgIcons.PhoneOff className="w-4 h-4" />
                  <span>رد تماس</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Secondary Action Pills */}
                <div className="grid grid-cols-4 gap-2">
                  <Tooltip title={activeCall.muted ? 'وصل میکروفون' : 'بی‌صدا'}>
                    <button
                      onClick={() => toggleMuteWebPhone()}
                      className={`h-10 rounded-2xl flex items-center justify-center transition border ${activeCall.muted ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30' : 'bg-slate-100 dark:bg-[#242f3d] text-slate-700 dark:text-slate-200 border-transparent hover:bg-slate-200 dark:hover:bg-[#2e3b4d]'}`}
                    >
                      {activeCall.muted ? <SvgIcons.MicOff className="w-4 h-4" /> : <SvgIcons.Mic className="w-4 h-4" />}
                    </button>
                  </Tooltip>

                  <Tooltip title={activeCall.held ? 'ادامه مکالمه' : 'انتظار (Hold)'}>
                    <button
                      onClick={() => void toggleHoldWebPhone()}
                      className={`h-10 rounded-2xl flex items-center justify-center transition border ${activeCall.held ? 'bg-amber-500 text-white border-amber-400 shadow-md shadow-amber-500/30' : 'bg-slate-100 dark:bg-[#242f3d] text-slate-700 dark:text-slate-200 border-transparent hover:bg-slate-200 dark:hover:bg-[#2e3b4d]'}`}
                    >
                      {activeCall.held ? <SvgIcons.Play className="w-4 h-4" /> : <SvgIcons.Pause className="w-4 h-4" />}
                    </button>
                  </Tooltip>

                  <Tooltip title="صفحه‌کلید شماره (DTMF)">
                    <button
                      onClick={() => setShowDtmfPad((prev) => !prev)}
                      className={`h-10 rounded-2xl flex items-center justify-center transition border ${showDtmfPad ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-100 dark:bg-[#242f3d] text-slate-700 dark:text-slate-200 border-transparent hover:bg-slate-200 dark:hover:bg-[#2e3b4d]'}`}
                    >
                      <SvgIcons.Keypad className="w-4 h-4" />
                    </button>
                  </Tooltip>

                  <Tooltip title="دایورت به هوش مصنوعی">
                    <button
                      onClick={() => setShowAiDivertModal((prev) => !prev)}
                      className={`h-10 rounded-2xl flex items-center justify-center transition border ${showAiDivertModal ? 'bg-purple-600 text-white border-purple-500' : 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20 hover:bg-purple-500/20'}`}
                    >
                      <SvgIcons.Robot className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>

                {/* Inline DTMF Pad */}
                {showDtmfPad ? (
                  <div className="grid grid-cols-3 gap-1.5 p-2 rounded-2xl bg-slate-100/60 dark:bg-[#121922] border border-slate-200 dark:border-[#242f3d]">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                      <button
                        key={digit}
                        onClick={() => void sendDtmfWebPhone(digit)}
                        className="h-8 rounded-xl bg-white dark:bg-[#1e2a37] text-xs font-mono font-bold hover:bg-sky-500 hover:text-white transition shadow-sm"
                      >
                        {digit}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Inline AI Divert Box */}
                {showAiDivertModal ? (
                  <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-purple-700 dark:text-purple-300">
                      <span className="flex items-center gap-1.5">
                        <SvgIcons.Robot className="w-4 h-4" />
                        <span>واگذاری به پاسخگوی هوش مصنوعی</span>
                      </span>
                      <button onClick={() => setShowAiDivertModal(false)} className="text-slate-400 hover:text-slate-200">
                        <SvgIcons.Close className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Input.TextArea
                      rows={2}
                      placeholder="توضیح یا سناریو به هوش مصنوعی (اختیاری: مثلاً به مشتری بگو فاکتور فردا ارسال میشه)..."
                      value={aiBriefText}
                      onChange={(e) => setAiBriefText(e.target.value)}
                      className="!text-xs !rounded-xl"
                    />
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          checked={playHoldMusic}
                          onChange={(e) => setPlayHoldMusic(e.target.checked)}
                          className="rounded text-purple-600"
                        />
                        <span>پخش آهنگ انتظار حین اتصال</span>
                      </label>
                      <Button
                        size="small"
                        type="primary"
                        loading={busyAction}
                        onClick={handleAiDivert}
                        className="!bg-purple-600 hover:!bg-purple-500 !border-purple-600 !rounded-xl text-xs font-bold"
                      >
                        تأیید و واگذاری
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Blind Transfer Row */}
                <div className="flex gap-1.5">
                  <Input
                    size="small"
                    placeholder="شماره داخلی مقصد..."
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                    dir="ltr"
                    className="!rounded-xl font-mono"
                  />
                  <Button
                    size="small"
                    disabled={!transferTarget.trim()}
                    loading={busyAction}
                    onClick={handleTransfer}
                    className="!rounded-xl text-xs"
                  >
                    انتقال
                  </Button>
                </div>

                {/* End Call Button */}
                <button
                  disabled={busyAction}
                  onClick={handleHangup}
                  className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition"
                >
                  <SvgIcons.PhoneOff className="w-4 h-4" />
                  <span>قطع مکالمه</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* DIALER KEYPAD STATE (STANDBY / PREPARING CALL) */
          <div className="space-y-3">
            {/* Display / Input Row with Backspace */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#121922] p-1.5 rounded-2xl border border-slate-200 dark:border-[#242f3d]">
              <Input
                dir="ltr"
                variant="borderless"
                placeholder="شماره تماس یا داخلی..."
                value={dialInput}
                onChange={(e) => setDialInput(e.target.value)}
                onPressEnter={() => void handleDial()}
                className="!font-mono !text-base !font-bold text-center !tracking-wider"
              />
              {dialInput ? (
                <button
                  onClick={() => setDialInput((prev) => prev.slice(0, -1))}
                  className="p-2 text-slate-400 hover:text-rose-400 transition"
                  aria-label="پاک کردن رقم آخر"
                >
                  <SvgIcons.Backspace className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            {/* Tactile Ergonomic 3x4 Keypad */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {KEYPAD_ROWS.flat().map(({ digit, sub }) => (
                <button
                  key={digit}
                  onClick={() => setDialInput((prev) => `${prev}${digit}`)}
                  className="h-11 rounded-2xl bg-slate-100/80 dark:bg-[#202b36] hover:bg-slate-200 dark:hover:bg-[#283644] active:scale-90 border border-slate-200/60 dark:border-[#2c3c4c]/40 transition flex flex-col items-center justify-center"
                >
                  <span className="font-mono font-black text-sm text-slate-800 dark:text-slate-100 leading-none">
                    {digit}
                  </span>
                  {sub ? (
                    <span className="font-mono text-[8px] text-slate-400 dark:text-slate-500 font-bold tracking-widest mt-0.5">
                      {sub}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Initiate Call Button */}
            <button
              disabled={!dialInput.trim() || voip.status !== 'registered' || busyAction}
              onClick={() => void handleDial()}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition"
            >
              <SvgIcons.PhoneOutgoing className="w-4 h-4" />
              <span>برقراری تماس صوتی</span>
            </button>
          </div>
        )}

        {/* TOGGLEABLE ACCORDION / DRAWER: CONTACT HISTORY & ACTIVITIES */}
        <div className="border-t border-slate-100 dark:border-[#232e3c] pt-2">
          <button
            onClick={() => setShowHistoryDrawer((prev) => !prev)}
            className="w-full py-2 px-2.5 rounded-xl bg-slate-50 dark:bg-[#1e2a37]/50 hover:bg-slate-100 dark:hover:bg-[#1e2a37] text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between transition"
          >
            <div className="flex items-center gap-2">
              <SvgIcons.History className="w-4 h-4 text-sky-500" />
              <span>سوابق و پرونده مخاطب</span>
              {recentCalls.length > 0 ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-500/10 text-sky-500 font-mono">
                  {toPersianNumber(recentCalls.length)}
                </span>
              ) : null}
            </div>
            {showHistoryDrawer ? <SvgIcons.ChevronUp className="w-4 h-4" /> : <SvgIcons.ChevronDown className="w-4 h-4" />}
          </button>

          {showHistoryDrawer ? (
            <div className="mt-2.5 space-y-2 max-h-56 overflow-y-auto pr-0.5 text-xs">
              {loadingHistory ? (
                <div className="text-center py-4 text-slate-400">
                  <Spin size="small" />
                  <div className="text-[10px] mt-1">در حال دریافت تاریخچه...</div>
                </div>
              ) : recentCalls.length === 0 ? (
                <div className="text-center py-3 text-slate-400 text-[11px]">
                  سابقه‌ای برای این شماره یافت نشد.
                </div>
              ) : (
                recentCalls.map((call) => (
                  <div
                    key={call.id}
                    className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#1a232d] border border-slate-200/80 dark:border-[#263342] space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                        {call.direction === 'inbound' || call.direction === 'incoming' ? (
                          <SvgIcons.PhoneIncoming className="w-3.5 h-3.5 text-sky-500" />
                        ) : (
                          <SvgIcons.PhoneOutgoing className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span>{safeJalaliFormat(call.started_at, 'YYYY/MM/DD HH:mm')}</span>
                      </div>
                      <Tag
                        className="!m-0 !text-[9px] !rounded-md"
                        color={call.status === 'answered' ? 'success' : call.status === 'missed' ? 'error' : 'default'}
                      >
                        {call.status === 'answered' ? 'پاسخ داده شد' : call.status === 'missed' ? 'بی‌پاسخ' : 'ناموفق'}
                      </Tag>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      <span>داخلی: {call.extension || '۱۰۱'}</span>
                      {call.duration ? <span>مدت: {toPersianNumber(Math.floor(call.duration / 60))}:{toPersianNumber(call.duration % 60)}</span> : null}
                    </div>

                    {/* Audio Recording Player if present */}
                    {call.recording_url ? (
                      <div className="pt-1 flex items-center gap-2">
                        <audio
                          controls
                          src={call.recording_url}
                          className="w-full h-7 rounded-lg"
                        />
                      </div>
                    ) : null}

                    {/* AI Transcription Action & Preview */}
                    <div className="pt-1 border-t border-slate-200/60 dark:border-[#2c3c4c]/40">
                      {call.transcript ? (
                        <div className="p-1.5 rounded-xl bg-purple-500/10 text-[10px] text-purple-700 dark:text-purple-300 space-y-1">
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1">
                              <SvgIcons.Robot className="w-3 h-3" />
                              <span>متن هوش مصنوعی:</span>
                            </span>
                            <button
                              onClick={() => copyToClipboard(call.transcript || '')}
                              className="text-slate-400 hover:text-purple-400"
                              title="کپی متن"
                            >
                              <SvgIcons.Copy className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="line-clamp-2 leading-relaxed">{call.transcript}</p>
                        </div>
                      ) : call.recording_url ? (
                        <button
                          disabled={transcribingId === call.id}
                          onClick={() => void handleTranscribeAudio(call)}
                          className="w-full py-1 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 text-[10px] font-bold flex items-center justify-center gap-1.5 transition"
                        >
                          <SvgIcons.Robot className="w-3.5 h-3.5" />
                          <span>{transcribingId === call.id ? 'در حال تبدیل با هوش مصنوعی...' : 'تبدیل سریع صوت به متن با AI'}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WebPhoneWidget;
