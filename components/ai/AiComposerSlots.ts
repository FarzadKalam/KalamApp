import { createContext } from 'react';

/** Shared destinations keep selected tools and recording previews out of the icon row. */
export const AiComposerSlots = createContext<{ embedded: boolean; selections: HTMLElement | null; transient: HTMLElement | null }>({ embedded: false, selections: null, transient: null });
