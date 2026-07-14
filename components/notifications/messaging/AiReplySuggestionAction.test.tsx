import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiReplySuggestionAction from './AiReplySuggestionAction';

describe('AiReplySuggestionAction', () => {
  it('submits an optional instruction from the messaging composer', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AiReplySuggestionAction onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'پیشنهاد پاسخ هوش مصنوعی' }));
    fireEvent.change(await screen.findByPlaceholderText('مثلا: کوتاه و رسمی پاسخ بده'), {
      target: { value: 'صمیمی پاسخ بده' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'دریافت پیشنهاد' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('صمیمی پاسخ بده'));
  });
});
