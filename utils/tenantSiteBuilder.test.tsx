import { describe, expect, it } from 'vitest';
import { isPublicPageVisible, validateSiteBlocks } from './tenantSiteBuilder';

describe('tenant site builder safety helpers', () => {
  it('keeps draft-only or unpublished content out of public visibility', () => {
    expect(isPublicPageVisible(null, 'org-a', 'home')).toBe(false);
    expect(isPublicPageVisible({ orgSlug: 'org-a', pageSlug: 'home' }, 'org-a', 'home')).toBe(false);
  });
  it('requires both organization and page slug to match', () => {
    const published = { orgSlug: 'org-a', pageSlug: 'about', publishedBlocks: [{ type: 'paragraph', text: 'live' }] };
    expect(isPublicPageVisible(published, 'org-a', 'about')).toBe(true);
    expect(isPublicPageVisible(published, 'org-b', 'about')).toBe(false);
    expect(isPublicPageVisible(published, 'org-a', 'home')).toBe(false);
  });
  it('validates JSON block structure and rejects unsafe protocols', () => {
    expect(validateSiteBlocks([{ type: 'paragraph', text: 'safe' }])).toBeNull();
    expect(validateSiteBlocks([{ type: 'button', text: 'go', href: 'javascript:alert(1)' }])).toContain('HTTP(S)');
    expect(validateSiteBlocks({ type: 'paragraph' })).toContain('آرایه');
  });
});
