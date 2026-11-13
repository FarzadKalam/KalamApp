import type { NotificationProvider } from '@refinedev/core';
import { appFeedback, getFeedbackScope } from './appFeedback';
import { FEEDBACK_POLICY } from './feedbackPolicy';
import { toFaErrorMessage } from './errorMessageFa';

/** Refine owns mutation execution/countdowns; this provider owns presentation only. */
export const refineFeedbackProvider: NotificationProvider = {
  open: ({ key, message, description, type, cancelMutation, undoableTimeout }) => {
    const scope = getFeedbackScope();
    const title = /[\u0600-\u06ff]/.test(message)
      ? message
      : type === 'error' ? toFaErrorMessage(message, FEEDBACK_POLICY.labels.failure)
        : type === 'progress' ? FEEDBACK_POLICY.labels.pending : FEEDBACK_POLICY.labels.success;
    if (type === 'progress') {
      let cancelled = false;
      appFeedback.show({ kind: 'info', key, title, description, durationMs: null, actions: cancelMutation && undoableTimeout !== 0 ? [{
        key: 'cancel-mutation', label: FEEDBACK_POLICY.labels.undo, onClick: () => {
          if (cancelled || scope !== getFeedbackScope()) return;
          cancelled = true;
          try { cancelMutation(); } finally { if (key !== undefined) appFeedback.clear(key); }
        },
      }] : undefined });
      return;
    }
    appFeedback.show({ key, title, description: type === 'error' && description ? toFaErrorMessage(description) : description, kind: type });
  },
  close: key => appFeedback.clear(key),
};
