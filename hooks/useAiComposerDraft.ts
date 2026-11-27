import { useCallback, useLayoutEffect, useRef, useState, type SetStateAction } from 'react';

export const getAiDraftScope = (userId?: string | null, orgId?: string | null) =>
  userId && orgId ? JSON.stringify([userId, orgId]) : null;

const DRAFT_PREFIX = 'tazesystem:ai-draft:v1:';
const storageKey = (scope: string, key: string) => `${DRAFT_PREFIX}${scope}:${key}`;

export const hasAiDraftConversation = (contextKey: string) => {
  try {
    return Object.keys(window.sessionStorage).some(key =>
      key.startsWith(DRAFT_PREFIX) && key.endsWith(`:last:${contextKey}`));
  } catch { return false; }
};

const read = (key: string) => {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
};

const write = (key: string, value: string | null) => {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch { /* Keep the in-memory editor usable when storage is unavailable. */ }
};

export const readAiDraftConversation = (scope: string, contextKey: string) =>
  read(storageKey(scope, `last:${contextKey}`));

export const rememberAiDraftConversation = (scope: string, contextKey: string, threadId: string | null) =>
  write(storageKey(scope, `last:${contextKey}`), threadId || 'new');

export const deleteAiThreadDraft = (scope: string, threadId: string) =>
  write(storageKey(scope, `thread:${threadId}`), null);

export const useAiComposerDraft = (scope: string | null, contextKey: string, threadId: string | null) => {
  const conversation = threadId ? `thread:${threadId}` : `new:${contextKey}`;
  const [value, setValue] = useState(() => scope ? read(storageKey(scope, conversation)) || '' : '');
  const active = useRef({ scope, conversation, value, contextKey, threadId });

  useLayoutEffect(() => {
    const previous = active.current;
    if (previous.scope === scope && previous.conversation === conversation) {
      active.current = { ...previous, contextKey, threadId };
      return;
    }
    const saved = scope ? read(storageKey(scope, conversation)) : null;
    const next = !previous.scope && previous.conversation === conversation
      ? saved ?? previous.value : saved || '';
    active.current = { scope, conversation, value: next, contextKey, threadId };
    if (scope && next && saved === null) {
      write(storageKey(scope, conversation), next);
    }
    if (scope && (threadId || next.trim())) rememberAiDraftConversation(scope, contextKey, threadId);
    setValue(next);
  }, [scope, conversation, contextKey, threadId]);

  const setDraft = useCallback((change: SetStateAction<string>) => {
    const current = active.current;
    const next = typeof change === 'function' ? change(current.value) : change;
    current.value = next;
    if (current.scope) {
      write(storageKey(current.scope, current.conversation), next);
      if (next.trim()) rememberAiDraftConversation(current.scope, current.contextKey, current.threadId);
    }
    setValue(next);
  }, []);

  return [value, setDraft] as const;
};
