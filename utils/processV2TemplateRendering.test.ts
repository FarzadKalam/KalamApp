import { describe, expect, it } from 'vitest';
import {
  buildProcessV2TemplateContext,
  renderProcessV2TemplateValueFromRecord,
} from './processV2AutoAssign';
import { createProcessLinkedFieldKey } from './processTargets';

const createSupabaseMock = (rows: Record<string, Record<string, any>>) => ({
  from: (table: string) => ({
    select: () => ({
      eq: (_field: string, id: string) => ({
        maybeSingle: async () => ({
          data: rows[`${table}:${id}`] || null,
          error: null,
        }),
      }),
    }),
  }),
});

describe('process v2 template rendering', () => {
  it('resolves readable Persian process tokens from linked records', async () => {
    const context = await buildProcessV2TemplateContext({
      supabaseClient: createSupabaseMock({
        'projects:project-1': { id: 'project-1', name: 'پروژه آذرخش' },
      }),
      moduleId: 'invoices',
      recordId: 'invoice-1',
      recordData: { id: 'invoice-1', system_code: 'INV-1' },
      processLinkMap: { projects: 'project-1' },
    });

    expect(
      renderProcessV2TemplateValueFromRecord('طراحی "{{عنوان پروژه (پروژه‌ها)}}"', context),
    ).toBe('طراحی "پروژه آذرخش"');
  });

  it('keeps old technical linked tokens working for existing process stages', async () => {
    const context = await buildProcessV2TemplateContext({
      supabaseClient: createSupabaseMock({
        'projects:project-1': { id: 'project-1', name: 'پروژه آذرخش' },
      }),
      moduleId: 'invoices',
      recordId: 'invoice-1',
      recordData: { id: 'invoice-1', system_code: 'INV-1' },
      processLinkMap: { projects: 'project-1' },
    });

    const oldToken = createProcessLinkedFieldKey('projects', 'name');
    expect(renderProcessV2TemplateValueFromRecord(`طراحی "{{${oldToken}}}"`, context)).toBe('طراحی "پروژه آذرخش"');
  });

  it('does not remove unresolved tokens from stage titles', () => {
    expect(renderProcessV2TemplateValueFromRecord('طراحی "{{نام پروژه مرتبط}}"', {})).toBe('طراحی "{{نام پروژه مرتبط}}"');
  });
});
