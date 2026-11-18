import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { AiSkill } from '../../supabase/functions/_shared/ai-skill-catalog';
import AiAgentSkillsEditor from './AiAgentSkillsEditor';

describe('organization skill settings', () => {
  it('adds a draft and keeps its identity while the administrator edits it', () => {
    function Settings() {
      const [skills, setSkills] = useState<AiSkill[]>([]);
      return <>
        <AiAgentSkillsEditor agentKey="sales_leads" settings={skills} onChange={setSkills} editable />
        <output data-testid="skill-draft">{JSON.stringify(skills)}</output>
      </>;
    }
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: 'افزودن مهارت' }));
    const draft = () => JSON.parse(screen.getByTestId('skill-draft').textContent || '[]');
    expect(draft()[0].id).toMatch(/^custom_/);
    const id = draft()[0].id;
    fireEvent.change(screen.getByRole('textbox', { name: 'نام مهارت' }), { target: { value: 'سیاست پیش‌فاکتور' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'دستورالعمل انجام کار' }), { target: { value: 'نرخ مصوب را پیدا کن.' } });
    fireEvent.click(screen.getByRole('switch', { name: 'فعال‌بودن مهارت' }));
    expect(draft()).toEqual([{ id, title: 'سیاست پیش‌فاکتور', instructions: 'نرخ مصوب را پیدا کن.', triggers: [], enabled: false }]);
    fireEvent.click(screen.getByRole('button', { name: 'حذف مهارت سفارشی' }));
    expect(draft()).toEqual([]);
  });
});
