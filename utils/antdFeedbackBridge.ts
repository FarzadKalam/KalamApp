import { isValidElement, type ReactNode } from 'react';
import type { ArgsProps as MessageArgs, JointContent, MessageInstance, TypeOpen } from 'antd/es/message/interface';
import type { ArgsProps as NotificationArgs, NotificationInstance } from 'antd/es/notification/interface';
import { clearFeedback, publishFeedback, type FeedbackKind } from './appFeedback';
import { toFaErrorMessage } from './errorMessageFa';

const messageArgs = (content: JointContent): MessageArgs => typeof content === 'object' && content !== null && !isValidElement(content) && 'content' in content ? content as MessageArgs : { content: content as ReactNode };
const messageOpen = (args: MessageArgs) => publishFeedback({
  title: typeof args.content === 'string' ? (args.type === 'error' ? toFaErrorMessage(args.content, 'انجام این کار ناموفق بود؛ دوباره تلاش کنید.') : args.content) : 'پیام سامانه',
  description: typeof args.content === 'string' ? undefined : args.content,
  kind: args.type ?? 'info', key: args.key, icon: args.icon, onClose: args.onClose,
  durationMs: args.duration === undefined ? undefined : args.duration * 1000,
});
const typedMessage = (kind: FeedbackKind): TypeOpen => (content, duration, onClose) => {
  const args = messageArgs(content);
  return messageOpen({ ...args, type: kind, duration: typeof duration === 'number' ? duration : args.duration, onClose: typeof duration === 'function' ? duration : onClose ?? args.onClose });
};
export const feedbackMessage: MessageInstance = {
  success: typedMessage('success'), error: typedMessage('error'), warning: typedMessage('warning'), info: typedMessage('info'), loading: typedMessage('loading'), open: messageOpen,
  destroy: key => clearFeedback(key === undefined ? undefined : String(key)),
};
const notificationOpen = (args: NotificationArgs, kind: FeedbackKind = 'info') => {
  publishFeedback({ title: typeof args.message === 'string' ? (kind === 'error' ? toFaErrorMessage(args.message) : args.message) : 'اعلان سامانه', description: args.description ?? (typeof args.message === 'string' ? undefined : args.message), kind, key: args.key === undefined ? undefined : String(args.key), icon: args.icon, onClose: args.onClose, durationMs: args.duration === null || args.duration === 0 ? null : args.duration === undefined ? undefined : args.duration * 1000 });
};
export const feedbackNotification: NotificationInstance = {
  open: args => notificationOpen(args, args.type),
  success: args => notificationOpen(args, 'success'), error: args => notificationOpen(args, 'error'), warning: args => notificationOpen(args, 'warning'), info: args => notificationOpen(args),
  destroy: key => clearFeedback(key === undefined ? undefined : String(key)),
};

// Adapt the public Ant Design instances in one place. Consumers retain their
// existing App.useApp()/static API, callbacks, keys and thenable close handles.
// Unsupported rich notification options keep their original Ant Design path.
export const installFeedbackBridge = (message: MessageInstance, notification: NotificationInstance) => {
  const originalMessage = { ...message };
  const originalNotification = { ...notification };
  const adaptedMessage: MessageInstance = { ...feedbackMessage, open: args => args.style || args.className || args.onClick ? originalMessage.open(args) : feedbackMessage.open(args) };
  for (const type of ['success', 'error', 'warning', 'info', 'loading'] as const) {
    adaptedMessage[type] = (content, duration, onClose) => {
      const args = messageArgs(content);
      return args.style || args.className || args.onClick ? originalMessage[type](content, duration, onClose) : feedbackMessage[type](content, duration, onClose);
    };
  }
  adaptedMessage.destroy = key => { feedbackMessage.destroy(key); originalMessage.destroy(key); };
  Object.assign(message, adaptedMessage);
  const adaptedNotification = { ...feedbackNotification };
  for (const type of ['open', 'success', 'error', 'warning', 'info'] as const) {
    adaptedNotification[type] = args => {
      if (args.actions || args.btn || args.onClick || args.props || args.style || args.className || args.closable === false || args.role === 'alert') originalNotification[type](args);
      else feedbackNotification[type](args);
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
