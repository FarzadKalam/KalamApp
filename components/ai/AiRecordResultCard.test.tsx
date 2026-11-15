import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiRecordResultCard from './AiRecordResultCard';
vi.mock('../../moduleRegistry', () => ({ MODULES: { leads: {} } }));
afterEach(cleanup);
describe('saved record receipt', () => {
  it('provides durable links to created and updated records and truthfully shows a failed attachment', () => {
    render(<MemoryRouter><AiRecordResultCard metadata={{ created_records: [{ id: 'a', module_id: 'leads', title: 'سالن اول' }],
      updated_records: [{ id: 'b', module_id: 'leads', title: 'سالن دوم' }],
      attachment_results: [{ record_id: 'a', name: 'دایرکت', success: false, message: 'دسترسی فایل تغییر کرده است.' }] }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /سالن اول/ }).getAttribute('href')).toBe('/leads/a');
    expect(screen.getByRole('link', { name: /سالن دوم/ }).getAttribute('href')).toBe('/leads/b');
    expect(screen.getByText(/دسترسی فایل تغییر کرده/)).toBeTruthy();
  });
});
