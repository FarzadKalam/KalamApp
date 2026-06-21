import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiChatSurfacePrototype from './AiChatSurfacePrototype';

describe('AiChatSurfacePrototype', () => {
  it('renders the AI v2 shell with thread list and AI response toggle', () => {
    render(<AiChatSurfacePrototype />);

    expect(screen.getByTestId('ai-chat-v2-prototype')).toBeInTheDocument();
    expect(screen.getAllByText('هوش مصنوعی نسخه ۲')[0]).toBeInTheDocument();
    expect(screen.getAllByText('تحلیل فروش امروز')[0]).toBeInTheDocument();
    expect(screen.getByText('پاسخ هوش مصنوعی')).toBeInTheDocument();
    expect(screen.getByLabelText('افزودن همکاران به گفتگو')).toBeInTheDocument();
  }, 15000);
});
