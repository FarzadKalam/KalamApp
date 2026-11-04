import { create } from 'zustand';
export type EmailComposeSeed = { to?: string[]; cc?: string[]; subject?: string; body?: string; accountId?: string; replyToId?: string; moduleId?: string; recordId?: string };
export const useEmailComposerStore = create<{ seed: EmailComposeSeed | null; open: (seed?: EmailComposeSeed) => void; close: () => void }>((set) => ({ seed: null, open: (seed = {}) => set({ seed }), close: () => set({ seed: null }) }));
