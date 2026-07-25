import { describe, expect, it } from 'vitest';
import {
  buildProcessV2TemplateContext,
  renderProcessV2TemplateValueFromRecord,
} from './processV2AutoAssign';
import { createProcessLinkedFieldKey } from './processTargets';
import { FieldType } from '../types';

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

  it('never exposes a raw relation uuid in a visible stage title', () => {
    expect(renderProcessV2TemplateValueFromRecord(
      '{{customer_id}}',
      { customer_id: '20000000-0000-4000-8000-000000000002' },
      FieldType.TEXT,
    )).toBe('[رکورد مرتبط]');
  });

  it('resolves stable field-key tokens used by the process variable picker', async () => {
    const context = await buildProcessV2TemplateContext({
      supabaseClient: createSupabaseMock({}),
      moduleId: 'projects',
      recordId: 'project-1',
      recordData: { id: 'project-1', name: 'پروژه آذرخش', description: 'شرح پروژه' },
    });

    expect(renderProcessV2TemplateValueFromRecord('پیگیری {{name}}', context)).toBe('پیگیری پروژه آذرخش');
    expect(renderProcessV2TemplateValueFromRecord('توضیحات: {{description}}', context)).toBe('توضیحات: شرح پروژه');
  });

  it('resolves the shared Jalali system date variables in process templates', async () => {
    const context = await buildProcessV2TemplateContext({
      supabaseClient: createSupabaseMock({}),
      moduleId: 'projects',
      recordId: 'project-1',
      recordData: { id: 'project-1', name: 'پروژه آذرخش' },
    });

    expect(renderProcessV2TemplateValueFromRecord('{{current_date_numeric}}', context)).toMatch(/^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/);
    expect(renderProcessV2TemplateValueFromRecord('{{تاریخ امروز (حروف)}}', context)).not.toContain('{{');
  });
});
