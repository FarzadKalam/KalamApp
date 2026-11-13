import { lazy, Suspense, useLayoutEffect, useSyncExternalStore } from 'react';
import App from 'antd/es/app';
import message from 'antd/es/message';
import notification from 'antd/es/notification';
import { getFeedbackSnapshot, subscribeFeedback } from '../../utils/appFeedback';
import { installFeedbackBridge } from '../../utils/antdFeedbackBridge';

const FeedbackViewport = lazy(() => import('./FeedbackViewport'));

export const FeedbackRenderer = () => {
  const items = useSyncExternalStore(subscribeFeedback, getFeedbackSnapshot, getFeedbackSnapshot);
  if (!items.length) return null;
  return <Suspense fallback={null}><FeedbackViewport items={items} /></Suspense>;
};

const AppFeedbackHost = () => {
  const app = App.useApp();
  useLayoutEffect(() => {
    const restoreContext = installFeedbackBridge(app.message, app.notification);
    const restoreStatic = installFeedbackBridge(message, notification);
    return () => { restoreStatic(); restoreContext(); };
  }, [app.message, app.notification]);
  return <FeedbackRenderer />;
};
export default AppFeedbackHost;
