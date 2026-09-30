import { afterEach, describe, expect, it, vi } from 'vitest';
import { materializeNativePrintMarginImages, materializePrintImageAssets } from './buildPrintDocumentHtml';

describe('materializeNativePrintMarginImages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps public images in the isolated header and footer documents as URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await materializeNativePrintMarginImages(`
      <template id="kalamapp-gotenberg-header"><!doctype html><html lang="fa"><head><meta charset="utf-8" /></head><body><img src="https://assets.example.test/company-logo.png" alt="لوگو" /></body></html></template>
      <template id="kalamapp-gotenberg-footer"><!doctype html><html lang="fa"><head><meta charset="utf-8" /></head><body><img src="https://assets.example.test/company-logo.png" alt="لوگو" /></body></html></template>
    `, 'https://app.example.test');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('<!doctype html><html lang="fa"><head>');
    expect(result).toContain('src="https://assets.example.test/company-logo.png"');
  });
});

describe('materializePrintImageAssets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps public catalog artwork as a URL for the PDF renderer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await materializePrintImageAssets(
      '<section style="background-image:url(https://assets.example.test/catalog.png)"><img src="https://assets.example.test/catalog.png" alt="تصویر کاتالوگ" /></section>',
      'https://app.example.test',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('src="https://assets.example.test/catalog.png"');
    expect(result).toContain('background-image:url(https://assets.example.test/catalog.png)');
  });

  it('uses the shared print-sized URL for a public storage asset without embedding it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await materializePrintImageAssets(
      '<img src="https://api.example.test/storage/v1/object/public/images/catalog.png" alt="تصویر کاتالوگ" />',
      'https://app.example.test',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('src="https://api.example.test/storage/v1/render/image/public/images/catalog.png?width=840&amp;quality=58&amp;resize=cover"');
  });
});
