import { Component, lazy, Suspense, useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import App from 'antd/es/app';
import message from 'antd/es/message';
import notification from 'antd/es/notification';
import { getFeedbackSnapshot, subscribeFeedback } from '../../utils/appFeedback';
import { installFeedbackBridge } from '../../utils/antdFeedbackBridge';
import FeedbackFallback from './FeedbackFallback';

const FeedbackViewport = lazy(() => import('./FeedbackViewport'));
class FeedbackBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export const FeedbackRenderer = () => {
  const items = useSyncExternalStore(subscribeFeedback, getFeedbackSnapshot, getFeedbackSnapshot);
  if (!items.length) return null;
  return <FeedbackBoundary fallback={<FeedbackFallback items={items} />}><Suspense fallback={null}><FeedbackViewport items={items} /></Suspense></FeedbackBoundary>;
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
