import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiWelcomeState from './AiWelcomeState';
import AiSourcesCard, { extractAiSourcesFromMetadata } from './AiSourcesCard';

vi.mock('../../moduleRegistry', () => ({
  MODULES: {
    customers: { id: 'customers', titles: { fa: 'مشتریان', faSingular: 'مشتری' }, fields: [], blocks: [] },
  },
}));

afterEach(cleanup);

describe('AiWelcomeState', () => {
  it('renders context-aware welcome and prompt cards and forwards prompt selection', () => {
    const onSelectPrompt = vi.fn();
    render(
      <AiWelcomeState
        personalTitle="دستیار فروش"
        selectedAgents={['lead_orchestrator']}
        contextMode="list"
        moduleId="customers"
        selectedRecordCount={3}
        onSelectPrompt={onSelectPrompt}
      />,
    );

    expect(screen.getByText('سلام! دستیار فروش در خدمت شماست')).toBeInTheDocument();
    const promptBtn = screen.getByText('تحلیل و گزارش مشتریان');
    fireEvent.click(promptBtn);
    expect(onSelectPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('مشتریان'),
    }));
  });
});

describe('AiSourcesCard', () => {
  it('extracts unique sources and expands details on click', () => {
    const sources = extractAiSourcesFromMetadata({
      sources: [
        { title: 'آیین‌نامه فروش ۱۴۰۵', description: 'بند ۴ سقف تخفیف' },
        { title: 'مستند وب', url: 'https://example.test/policy' },
        { title: 'آیین‌نامه فروش ۱۴۰۵', description: 'تکراری' },
      ],
    });
    expect(sources).toHaveLength(2);

    render(<AiSourcesCard sources={sources} />);
    const toggle = screen.getByRole('button', { name: /منبع و ارجاع/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('بند ۴ سقف تخفیف')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('بند ۴ سقف تخفیف')).toBeInTheDocument();
  });
});
