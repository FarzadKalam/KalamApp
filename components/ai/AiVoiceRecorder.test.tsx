import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiVoiceRecorder from './AiVoiceRecorder';

class TestRecorder {
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  start = () => { this.state = 'recording'; };
  stop = () => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recording']) });
    this.onstop?.();
  };
}

class TestSpeech {
  static current: TestSpeech;
  onresult?: (event: { results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend?: () => void;
  start = vi.fn();
  stop = vi.fn();
  constructor() { TestSpeech.current = this; }
  hear(transcript: string, isFinal = true) {
    act(() => this.onresult?.({ results: [Object.assign([{ transcript }], { isFinal })] }));
  }
}

const start = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'ضبط فایل صوتی' }));
  await screen.findByRole('button', { name: 'توقف ضبط صدا' });
};

describe('AI voice recording', () => {
  const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  afterEach(() => {
    cleanup();
    if (mediaDevicesDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const setup = (speech: typeof TestSpeech | undefined) => {
    const microphone = { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) };
    Object.defineProperty(navigator, 'mediaDevices', { value: microphone, configurable: true });
    vi.stubGlobal('MediaRecorder', TestRecorder);
    vi.stubGlobal('SpeechRecognition', speech);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-recording');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const onSend = vi.fn();
    const onTranscribe = vi.fn(async () => 'متن آماده از سرور');
    render(<App><AiVoiceRecorder onSend={onSend} onTranscribe={onTranscribe} onMoveTranscriptToComposer={() => {}} /></App>);
    return { onSend, onTranscribe };
  };

  it('restarts live recognition after a pause and preserves the previous spoken segment', async () => {
    const { onSend, onTranscribe } = setup(TestSpeech);
    await start();
    const speech = TestSpeech.current;
    speech.hear('بخش اول');
    expect(screen.getByRole('status').textContent).toBe('بخش اول');
    act(() => speech.onend?.());
    expect(speech.start).toHaveBeenCalledTimes(2);
    speech.hear('بخش دوم');
    expect(screen.getByRole('status').textContent).toBe('بخش اول بخش دوم');
    fireEvent.click(screen.getByRole('button', { name: 'توقف ضبط صدا' }));
    fireEvent.click(screen.getByRole('button', { name: 'ارسال فایل صوتی' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'بخش اول بخش دوم' })));
    expect(onTranscribe).not.toHaveBeenCalled();
  });

  it('starts one dedicated transcription on stop when live recognition is unavailable', async () => {
    const { onSend, onTranscribe } = setup(undefined);
    await start();
    fireEvent.click(screen.getByRole('button', { name: 'توقف ضبط صدا' }));
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'متن پیام صوتی' }) as HTMLTextAreaElement).value).toBe('متن آماده از سرور'));
    const send = screen.getByRole('button', { name: 'ارسال فایل صوتی' });
    await waitFor(() => expect(send).not.toHaveClass('ant-btn-loading'));
    fireEvent.click(send);
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ transcript: 'متن آماده از سرور' })));
    expect(onTranscribe).toHaveBeenCalledTimes(1);
  });
});
