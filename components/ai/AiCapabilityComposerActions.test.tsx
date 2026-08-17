import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiCapabilityComposerActions from './AiCapabilityComposerActions';

describe('AiCapabilityComposerActions', () => {
  afterEach(() => cleanup());

  it('keeps text chat first and adds free chat as the final, separate operator', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AiCapabilityComposerActions
        selected={['web_search']}
        onChange={onChange}
        onVoiceSend={vi.fn()}
        onFilePrepared={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('انتخاب عملکرد هوش مصنوعی'));
    const textChatLabel = await screen.findByText('گفتگوی متنی');
    const operatorList = textChatLabel.closest('label')?.parentElement;
    expect(operatorList?.querySelector('label')?.textContent).toContain('گفتگوی متنی');
    const freeChatLabel = await screen.findByText('گفتگوی آزاد');
    const capabilityLabels = Array.from(document.querySelectorAll('label'))
      .filter((label) => label.textContent?.includes('گفتگوی متنی') || label.textContent?.includes('گفتگوی آزاد') || label.textContent?.includes('تحلیل اسناد'));
    expect(capabilityLabels.at(-1)?.textContent).toContain('گفتگوی آزاد');

    fireEvent.click(textChatLabel.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(onChange).toHaveBeenLastCalledWith(['text_chat']);

    rerender(
      <AiCapabilityComposerActions
        selected={['text_chat']}
        onChange={onChange}
        onVoiceSend={vi.fn()}
        onFilePrepared={vi.fn()}
      />
    );
    const documentLabel = await screen.findByText('تحلیل اسناد');
    fireEvent.click(documentLabel.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(onChange).toHaveBeenLastCalledWith(['document_analysis']);
    fireEvent.click(freeChatLabel.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(onChange).toHaveBeenLastCalledWith(['free_chat']);
    fireEvent.click(document.querySelector('button.ant-drawer-close') as HTMLButtonElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows auto-detected capabilities as checked while auto mode remains active', async () => {
    const onChange = vi.fn();
    render(
      <AiCapabilityComposerActions
        selected={[]}
        autoSuggested={['web_search', 'deep_reasoning']}
        onChange={onChange}
        onVoiceSend={vi.fn()}
        onFilePrepared={vi.fn()}
      />
    );

    expect(screen.getByText('تصمیم‌گیری خودکار')).toBeInTheDocument();
    expect(screen.getByText('تشخیص: جستجوی گوگل')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('انتخاب عملکرد هوش مصنوعی'));

    await waitFor(() => expect(screen.getAllByText('تشخیص خودکار').length).toBeGreaterThan(0));
    const webSearchCheckbox = screen.getByText('جستجوی گوگل').closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(webSearchCheckbox?.checked).toBe(true);
  });

  it('keeps the attachment control available for every selected operator', () => {
    const { rerender } = render(
      <AiCapabilityComposerActions
        selected={['image_generation']}
        onChange={vi.fn()}
        onVoiceSend={vi.fn()}
        onFilePrepared={vi.fn()}
      />
    );

    expect(screen.getByLabelText('پیوست فایل به هوش مصنوعی')).toBeInTheDocument();

    rerender(
      <AiCapabilityComposerActions
        selected={['video_generation']}
        onChange={vi.fn()}
        onVoiceSend={vi.fn()}
        onFilePrepared={vi.fn()}
      />
    );
    expect(screen.getByLabelText('پیوست فایل به هوش مصنوعی')).toBeInTheDocument();
  });
});
