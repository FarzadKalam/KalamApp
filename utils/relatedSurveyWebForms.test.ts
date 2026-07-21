import { describe, expect, it, vi } from 'vitest';
import { createRelatedSurveyWebFormPath, fetchActiveSurveyWebForms } from './relatedSurveyWebForms';

describe('related survey web forms', () => {
  it('loads only active survey templates', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: 'form-1', name: 'رضایت مشتری', description: 'پس از خرید', route_slug: 'customer-feedback' }],
      error: null,
    });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit,
    };
    const supabaseClient = { from: vi.fn().mockReturnValue(query) };

    await expect(fetchActiveSurveyWebForms(supabaseClient)).resolves.toEqual([
      { id: 'form-1', name: 'رضایت مشتری', description: 'پس از خرید', routeSlug: 'customer-feedback' },
    ]);
    expect(query.eq).toHaveBeenNthCalledWith(1, 'target_module_id', 'surveys');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'form_type', 'survey');
    expect(query.eq).toHaveBeenNthCalledWith(3, 'is_active', true);
  });

  it('creates a tokenized path with the source record context', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'form-1', route_slug: 'customer-feedback' },
      error: null,
    });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const rpc = vi.fn().mockResolvedValue({ data: { token: 'secure-token' }, error: null });
    const supabaseClient = { from: vi.fn().mockReturnValue(query), rpc };

    await expect(createRelatedSurveyWebFormPath(supabaseClient, {
      webFormId: 'form-1',
      relatedModuleId: 'customers',
      relatedRecordId: 'record-1',
    })).resolves.toBe('/inquiry/customer-feedback?token=secure-token');
    expect(rpc).toHaveBeenCalledWith('create_web_form_link_token', {
      p_web_form_id: 'form-1',
      p_target_module_id: 'surveys',
      p_related_module_id: 'customers',
      p_related_record_id: 'record-1',
    });
  });
});
