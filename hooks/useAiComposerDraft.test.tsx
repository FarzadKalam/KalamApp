import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAiDraftScope, readAiDraftConversation, useAiComposerDraft } from './useAiComposerDraft';

const scope = getAiDraftScope('person', 'organization')!;
const context = 'route:/ai';

beforeEach(() => window.sessionStorage.clear());

describe('assistant prompt drafts', () => {
  it('restores the exact input after reload and remembers which conversation contained it', () => {
    const draft = renderHook(() => useAiComposerDraft(scope, context, 'thread-b'));
    const text = 'موضوع کمپین\n  متن در حال نوشتن ';
    act(() => draft.result.current[1](text));
    draft.unmount();
    expect(readAiDraftConversation(scope, context)).toBe('thread-b');
    const loaded = renderHook(({ actor }) => useAiComposerDraft(actor, context, 'thread-b'),
      { initialProps: { actor: null as string | null } });
    loaded.rerender({ actor: scope });
    expect(loaded.result.current[0]).toBe(text);
    act(() => loaded.result.current[1](''));
    loaded.unmount();
    expect(renderHook(() => useAiComposerDraft(scope, context, 'thread-b')).result.current[0]).toBe('');
  });

  it('preserves an unsent new chat separately and isolates different accounts and organizations', () => {
    const { result, rerender } = renderHook(({ key, actor }) => useAiComposerDraft(actor, context, key), {
      initialProps: { key: null as string | null, actor: scope },
    });
    act(() => result.current[1]('متن چت جدید'));
    expect(readAiDraftConversation(scope, context)).toBe('new');
    rerender({ key: 'thread-a', actor: scope });
    expect(result.current[0]).toBe('');
    act(() => result.current[1]('متن چت قدیمی'));
    rerender({ key: 'thread-a', actor: getAiDraftScope('person', 'other-org')! });
    expect(result.current[0]).toBe('');
    rerender({ key: null, actor: scope });
    expect(result.current[0]).toBe('متن چت جدید');
  });
});
