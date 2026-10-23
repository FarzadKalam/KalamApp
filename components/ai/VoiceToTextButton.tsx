import React, { useState } from 'react';
import { App } from 'antd';
import AiVoiceRecorder, { type RecordedVoice } from './AiVoiceRecorder';
import { supabase } from '../../supabaseClient';
import { blobToBase64 } from '../../utils/blobBase64';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type VoiceToTextButtonProps = {
  disabled?: boolean;
  size?: 'small' | 'middle' | 'large';
  className?: string;
  onTranscript: (transcript: string) => void | Promise<void>;
};

/** ضبط و تبدیل صوت با مدل ورودی صوتیِ تنظیم‌شده برای سازمان. */
const VoiceToTextButton: React.FC<VoiceToTextButtonProps> = ({ disabled = false, size = 'small', className, onTranscript }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const handleVoice = async (voice: RecordedVoice) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'transcribe_voice',
          audio: {
            data: await blobToBase64(voice.blob),
            mimeType: voice.mimeType,
            filename: voice.filename,
            durationMs: voice.durationMs,
          },
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(String(data?.message || 'تبدیل صوت به متن ناموفق بود.'));
      const transcript = String(data?.transcript || '').trim();
      if (!transcript) throw new Error('متنی از فایل صوتی دریافت نشد.');
      await onTranscript(transcript);
      message.success('متن گفتار به فیلد اضافه شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'تبدیل صوت به متن ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  return <AiVoiceRecorder disabled={disabled} loading={loading} size={size} className={className} onSend={handleVoice} />;
};

export default VoiceToTextButton;
