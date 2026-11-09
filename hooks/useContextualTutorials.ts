import { useCallback, useEffect, useState } from 'react';
import { supabase, supabasePublic } from '../supabaseClient';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { getAppRuntimeCached } from '../utils/appRuntimeCache';
import type { Block } from '../components/cms/BlockEditor';

export type TutorialSummary = { id: string; title: string; slug: string; excerpt: string; help_group: string; content_blocks: Block[] };
export type TutorialViewer = { orgId: string | null; userId: string | null };
const SEEN_EVENT = 'kalam:contextual-tutorial-seen';
const readSeen = (key: string): Set<string> => {
  if (!key) return new Set();
  try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []); }
  catch { return new Set(); }
};
export function useContextualTutorials(contexts: string[], viewer?: TutorialViewer) {
  const contextKey = [...new Set(contexts)].sort().join('|');
  const [state, setState] = useState<{ scope: string; items: TutorialSummary[]; loading: boolean; error: unknown }>({ scope: '', items: [], loading: true, error: null });
  const [storageKey, setStorageKey] = useState('');
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const scope = JSON.stringify([viewer?.orgId || '', viewer?.userId || '', contextKey]);
  useEffect(() => {
    let active = true;
    setState({ scope, items: [], loading: true, error: null });setStorageKey('');setSeen(new Set());
    if (!contextKey) { setState({ scope, items: [], loading: false, error: null }); return; }
    void (async () => {
      try {
        const session = viewer || await fetchSessionBootstrap(supabase).then(snapshot => ({ orgId: snapshot.orgId, userId: snapshot.user?.id || null }));
        if (!active) return;
        if (!session?.orgId || !session?.userId) { setState({ scope, items: [], loading: false, error: null });return; }
        const key = `kalam:tutorial-seen:v1:${session.orgId}:${session.userId}`;
        setStorageKey(key);setSeen(readSeen(key));
        const items = await getAppRuntimeCached<TutorialSummary[]>({ key: `contextual-tutorials:${session.orgId}:${session.userId}:${contextKey}`, ttlMs: 5 * 60_000, force: attempt > 0, loader: async () => {
          const { data, error } = await supabasePublic.rpc('get_cms_contextual_tutorial_posts', { p_contexts: contextKey.split('|'), p_limit: 100 });
          if (error) throw error;
          return Array.isArray(data) ? data : [];
        } });
        if (active) setState({ scope, items, loading: false, error: null });
      } catch (error) { if (active) setState({ scope, items: [], loading: false, error }); }
    })();
    return () => { active = false; };
  }, [scope, contextKey, viewer?.orgId, viewer?.userId, attempt]);
  useEffect(() => {
    const sync = () => setSeen(readSeen(storageKey));
    window.addEventListener(SEEN_EVENT, sync);window.addEventListener('storage', sync);
    return () => { window.removeEventListener(SEEN_EVENT, sync);window.removeEventListener('storage', sync); };
  }, [storageKey]);
  const markSeen = useCallback((id: string) => {
    if (!storageKey) return;
    const next = new Set([...seen, ...readSeen(storageKey), id]);setSeen(next);
    try { localStorage.setItem(storageKey, JSON.stringify([...next].slice(-2000))); } catch { return; }
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, [storageKey, seen]);
  const items = state.scope === scope ? state.items : [];
  return { items, loading: state.scope !== scope || state.loading, error: state.scope === scope ? state.error : null, seen, markSeen, unreadCount: items.filter(item => !seen.has(item.id)).length, retry: () => setAttempt(value => value + 1) };
}
