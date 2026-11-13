import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiCapabilityComposerActions from './AiCapabilityComposerActions';

vi.mock('../../supabaseClient', () => ({
  supabase: {}, supabasePublic: {}, supabaseSignUpClient: {},
  SUPABASE_URL: 'https://supabase.invalid', SUPABASE_ANON_KEY: 'isolated-test-only',
  SUPABASE_AUTH_STORAGE_KEY: 'isolated-ai-test',
}));

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

    fireEvent.click(screen.getByLabelText('انتخاب ایجنت هوش مصنوعی'));
    const textChatLabel = await screen.findByText('مهارت گفتگو');
    const operatorList = textChatLabel.closest('label')?.parentElement;
    expect(operatorList?.querySelector('label')?.textContent).toContain('مهارت گفتگو');
    const freeChatLabel = await screen.findByText('مهارت گفتگوی آزاد');
    const capabilityLabels = Array.from(document.querySelectorAll('label'))
      .filter((label) => label.textContent?.includes('مهارت گفتگو') || label.textContent?.includes('مهارت گفتگوی آزاد') || label.textContent?.includes('مهارت تحلیل اسناد'));
    expect(capabilityLabels.at(-1)?.textContent).toContain('مهارت گفتگوی آزاد');

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
    const documentLabel = await screen.findByText('مهارت تحلیل اسناد');
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

    expect(screen.getByText('ایجنت راهبر')).toBeInTheDocument();
    expect(screen.getByText('تشخیص: مهارت پژوهش وب')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('انتخاب ایجنت هوش مصنوعی'));

    await waitFor(() => expect(screen.getAllByText('تشخیص خودکار').length).toBeGreaterThan(0));
    const webSearchCheckbox = screen.getByText('مهارت پژوهش وب').closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
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

  it('clearly separates Agents and Skills capsules with distinct labels and controls', () => {
    const onChange = vi.fn();
    const onAgentsChange = vi.fn();
    render(
      <AiCapabilityComposerActions
        selected={['pricing_adjustment']}
        onChange={onChange}
        selectedAgents={['sales_leads', 'instagrammer']}
        onAgentsChange={onAgentsChange}
        onVoiceSend={vi.fn()}
        onFilePrepared={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('انتخاب ایجنت‌های تخصصی')).toHaveTextContent('ایجنت‌ها');
    expect(screen.getByLabelText('انتخاب عملکرد هوش مصنوعی')).toHaveTextContent('مهارت‌ها');
    expect(screen.getByText('بازاریابی و فروش')).toBeInTheDocument();
    expect(screen.getByText('اینستاگرامر')).toBeInTheDocument();
    expect(screen.getByText('تنظیم قیمت')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('حذف ایجنت بازاریابی و فروش'));
    expect(onAgentsChange).toHaveBeenCalledWith(['instagrammer']);

    fireEvent.click(screen.getByLabelText('حذف مهارت تنظیم قیمت'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('strictly hides non-accessible agents from the picker and hides the Agents trigger when none can chat', async () => {
    const partialAccess = {
      sales_leads: { canView: true, canChat: true, canUse: true, isHidden: false } as any,
      hr_manager: { canView: true, canChat: false, canUse: false, isHidden: false } as any,
      instagrammer: { canView: false, canChat: false, canUse: false, isHidden: true } as any,
    };

    const { rerender } = render(
      <AiCapabilityComposerActions
        selected={[]}
        onChange={vi.fn()}
        selectedAgents={[]}
        onAgentsChange={vi.fn()}
        agentAccessMap={partialAccess}
        onVoiceSend={vi.fn()}
        onFilePrepared={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('انتخاب ایجنت‌های تخصصی'));
    expect(await screen.findByText('ایجنت بازاریابی و فروش')).toBeInTheDocument();
    expect(screen.queryByText('ایجنت منابع انسانی')).not.toBeInTheDocument();
    expect(screen.queryByText('ایجنت اینستاگرامر')).not.toBeInTheDocument();

    rerender(
      <AiCapabilityComposerActions
        selected={[]}
        onChange={vi.fn()}
        selectedAgents={[]}
        onAgentsChange={vi.fn()}
        agentAccessMap={{
          sales_leads: { canView: false, canChat: false, canUse: false, isHidden: true } as any,
        }}
        onVoiceSend={vi.fn()}
        onFilePrepared={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('انتخاب ایجنت‌های تخصصی')).not.toBeInTheDocument();
  });
});
