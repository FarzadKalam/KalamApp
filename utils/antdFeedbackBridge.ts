import { isValidElement, type ReactNode } from 'react';
import type { ArgsProps as MessageArgs, JointContent, MessageInstance, TypeOpen } from 'antd/es/message/interface';
import type { ArgsProps as NotificationArgs, NotificationInstance } from 'antd/es/notification/interface';
import { clearFeedback, publishFeedback, publishNativeFeedback, type FeedbackKind, type FeedbackOptions } from './appFeedback';
import { toFaErrorMessage } from './errorMessageFa';
import { FEEDBACK_POLICY } from './feedbackPolicy';

const messageArgs = (content: JointContent): MessageArgs => typeof content === 'object' && content !== null && !isValidElement(content) && 'content' in content ? content as MessageArgs : { content: content as ReactNode };
const messageOptions = (args: MessageArgs): FeedbackOptions => ({
  title: typeof args.content === 'string' ? (args.type === 'error' ? toFaErrorMessage(args.content, FEEDBACK_POLICY.labels.failure) : args.content) : FEEDBACK_POLICY.labels.message,
  description: typeof args.content === 'string' ? undefined : args.content,
  kind: args.type ?? 'info', key: args.key, icon: args.icon, onClose: args.onClose,
  durationMs: args.duration === undefined ? undefined : args.duration * 1000,
});
const messageOpen = (args: MessageArgs) => publishFeedback(messageOptions(args));
const typedMessage = (kind: FeedbackKind): TypeOpen => (content, duration, onClose) => {
  const args = messageArgs(content);
  return messageOpen({ ...args, type: kind, duration: typeof duration === 'number' ? duration : args.duration, onClose: typeof duration === 'function' ? duration : onClose ?? args.onClose });
};
export const feedbackMessage: MessageInstance = {
  success: typedMessage('success'), error: typedMessage('error'), warning: typedMessage('warning'), info: typedMessage('info'), loading: typedMessage('loading'), open: messageOpen,
  destroy: key => clearFeedback(key === undefined ? undefined : String(key)),
};
const notificationOptions = (args: NotificationArgs, kind: FeedbackKind = 'info'): FeedbackOptions => ({ title: typeof args.message === 'string' ? (kind === 'error' ? toFaErrorMessage(args.message) : args.message) : FEEDBACK_POLICY.labels.notification, description: args.description ?? (typeof args.message === 'string' ? undefined : args.message), kind, key: args.key === undefined ? undefined : String(args.key), icon: args.icon, onClose: args.onClose, durationMs: args.duration === null || args.duration === 0 ? null : args.duration === undefined ? undefined : args.duration * 1000 });
const notificationOpen = (args: NotificationArgs, kind: FeedbackKind = 'info') => { publishFeedback(notificationOptions(args, kind)); };
export const feedbackNotification: NotificationInstance = {
  open: args => notificationOpen(args, args.type),
  success: args => notificationOpen(args, 'success'), error: args => notificationOpen(args, 'error'), warning: args => notificationOpen(args, 'warning'), info: args => notificationOpen(args),
  destroy: key => clearFeedback(key === undefined ? undefined : String(key)),
};

// Adapt the public Ant Design instances in one place. Consumers retain their
// existing App.useApp()/static API, callbacks, keys and thenable close handles.
// Rich notices retain their native presentation, but use the SAME lifecycle.
export const installFeedbackBridge = (message: MessageInstance, notification: NotificationInstance) => {
  const originalMessage = { ...message };
  const originalNotification = { ...notification };
  const deliverMessage = (args: MessageArgs) => {
    const options = messageOptions(args);
    if (!args.style && !args.className && !args.onClick) return publishFeedback(options);
    return publishNativeFeedback(options, {
      show: (key, onClose) => { originalMessage.open({ ...args, key, onClose, duration: args.duration ?? ((FEEDBACK_POLICY.durations[options.kind || 'info'] ?? 0) / 1000), content: typeof args.content === 'string' ? options.title : args.content }); },
      close: key => originalMessage.destroy(key),
    });
  };
  const adaptedMessage: MessageInstance = { ...feedbackMessage, open: deliverMessage };
  for (const type of ['success', 'error', 'warning', 'info', 'loading'] as const) {
    adaptedMessage[type] = (content, duration, onClose) => {
      const args = messageArgs(content);
      return deliverMessage({ ...args, type, duration: typeof duration === 'number' ? duration : args.duration, onClose: typeof duration === 'function' ? duration : onClose ?? args.onClose });
    };
  }
  adaptedMessage.destroy = key => { feedbackMessage.destroy(key); originalMessage.destroy(key); };
  Object.assign(message, adaptedMessage);
  const adaptedNotification = { ...feedbackNotification };
  for (const type of ['open', 'success', 'error', 'warning', 'info'] as const) {
    adaptedNotification[type] = args => {
      const kind = type === 'open' ? args.type || 'info' : type;
      const options = notificationOptions(args, kind);
      if (args.actions || args.btn || args.onClick || args.props || args.style || args.className || args.closable !== undefined || args.closeIcon !== undefined || args.role === 'alert' || args.placement || args.showProgress || args.pauseOnHover === false) {
        publishNativeFeedback(options, {
          show: (key, onClose) => originalNotification[type]({ ...args, key, onClose, duration: args.duration === null ? 0 : args.duration ?? ((FEEDBACK_POLICY.durations[kind] ?? 0) / 1000), message: typeof args.message === 'string' ? options.title : args.message }),
          close: key => originalNotification.destroy(key),
        });
      } else publishFeedback(options);
    };
  }
  adaptedNotification.destroy = key => { feedbackNotification.destroy(key); originalNotification.destroy(key); };
  Object.assign(notification, adaptedNotification);
  return () => {
    for (const key of Object.keys(feedbackMessage) as (keyof MessageInstance)[]) {
      if (message[key] === adaptedMessage[key]) Object.assign(message, { [key]: originalMessage[key] });
    }
    for (const key of Object.keys(adaptedNotification) as (keyof NotificationInstance)[]) {
      if (notification[key] === adaptedNotification[key]) Object.assign(notification, { [key]: originalNotification[key] });
    }
  };
};
