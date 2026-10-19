import { describe, expect, it } from 'vitest';
import { getFormTutorialContexts, getTutorialContexts } from './tutorialContexts';

describe('contextual tutorial routing', () => {
  it('matches shared and module-specific help for lists, records, and forms', () => {
    expect(getTutorialContexts('/customers', ['customers'])).toEqual(['module:customers','surface:list','module:customers:list']);
    expect(getTutorialContexts('/customers/sample', ['customers'])).toContain('surface:show');
    expect(getTutorialContexts('/customers/sample/edit', ['customers'])).toContain('module:customers:form');
    expect(getTutorialContexts('/customers/create', ['customers'])).toEqual(getFormTutorialContexts('customers'));
  });
  it('keeps report builders and non-module pages in their page context', () => {
    expect(getTutorialContexts('/', [])).toEqual(['page:dashboard']);
    expect(getTutorialContexts('/dashboard', [])).toEqual(['page:dashboard']);
    expect(getTutorialContexts('/reports/sample/edit', ['customers'])).toEqual(['page:reports']);
    expect(getTutorialContexts('/ai', [])).toEqual(['page:ai']);
  });
  it('does not attach tenant guides to SaaS administration', () => {
    for (const path of ['/taze-system/tutorials/new','/cms_tutorial_posts','/saas_orgs']) expect(getTutorialContexts(path, [])).toEqual([]);
    expect(getFormTutorialContexts('cms_tutorial_posts')).toEqual([]);
  });
});
