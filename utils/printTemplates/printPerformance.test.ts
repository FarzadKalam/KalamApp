import { describe, expect, it } from 'vitest';
import { createPrintPerformanceTracker } from './printPerformance';

describe('print performance tracker', () => {
  it('records step durations and metadata for direct pdf flows', async () => {
    const tracker = createPrintPerformanceTracker('print_share_prepare', {
      moduleId: 'customers',
      recordId: 'rec-1',
    });

    await tracker.step('render_static_print_html', async () => '<div>PDF</div>', (html) => ({
      staticHtmlLength: html.length,
    }));
    await tracker.step('request_render_pdf', async () => new Blob(['pdf'], { type: 'application/pdf' }), (blob) => ({
      blobSize: blob.size,
    }));

    const report = tracker.finalize({ status: 'ready_for_share' });

    expect(report.flow).toBe('print_share_prepare');
    expect(report.metadata.moduleId).toBe('customers');
    expect(report.metadata.status).toBe('ready_for_share');
    expect(report.steps.map((step) => step.name)).toEqual([
      'render_static_print_html',
      'request_render_pdf',
    ]);
    expect(report.steps[1].metadata?.blobSize).toBeGreaterThan(0);
  });
});
