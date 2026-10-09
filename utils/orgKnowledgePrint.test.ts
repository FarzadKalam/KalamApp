import { describe, expect, it } from 'vitest';
import { buildBusinessModelCanvasPrintHtml } from './orgKnowledgePrint';
import type { BusinessModelCanvasSections } from './businessModelCanvas';

const emptySections = (): BusinessModelCanvasSections => ({
  key_partners: [],
  key_activities: [],
  key_resources: [],
  value_propositions: [],
  customer_relationships: [],
  channels: [],
  customer_segments: [],
  cost_structure: [],
  revenue_streams: [],
});

describe('buildBusinessModelCanvasPrintHtml', () => {
  it('keeps long cards un-clipped and sizes them from their content', () => {
    const sections = emptySections();
    sections.value_propositions = ['ارزش کوتاه'];
    sections.key_partners = Array.from({ length: 14 }, (_, index) => (
      `شریک کلیدی شماره ${index + 1} با توضیح کامل برای آزمون چیدمان پویا`
    ));

    const html = buildBusinessModelCanvasPrintHtml({
      sections,
      company: {
        companyName: 'سازمان آزمون',
        tradeName: '',
        logoUrl: '',
        phone: '',
        website: '',
      },
    });

    expect(html).toContain('شریک کلیدی شماره 14');
    expect(html).toContain('ارزش کوتاه');
    expect(html).toContain('overflow:visible');
    expect(html).toContain('min-height:');
    expect(html).not.toContain('height:126mm');
  });
});
