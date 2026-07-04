import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiCapabilityComposerActions from './AiCapabilityComposerActions';

describe('AiCapabilityComposerActions', () => {
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
});
