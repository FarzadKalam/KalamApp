import { useEffect } from 'react';
import theme from 'antd/es/theme';
import { closeFeedback, feedbackShown, pauseFeedback, runFeedbackAction, type FeedbackItem } from '../../utils/appFeedback';
import { FEEDBACK_POLICY } from '../../utils/feedbackPolicy';

// Keep the application and its messages usable if the optional visual chunk fails.
const FeedbackFallback = ({ items }: { items: FeedbackItem[] }) => {
  const { token } = theme.useToken();
  useEffect(() => { items.forEach(item => feedbackShown(item.id)); }, [items]);
  return <section dir="rtl" aria-live="polite" aria-label="پیام‌های سامانه" style={{ position: 'fixed', top: `calc(${FEEDBACK_POLICY.offsets.desktop + 8}px + env(safe-area-inset-top, 0px))`, left: '50%', transform: 'translateX(-50%)', width: `min(${FEEDBACK_POLICY.width}px, calc(100vw - ${FEEDBACK_POLICY.viewportGutter}px))`, zIndex: 2147483200, display: 'grid', gap: 10, pointerEvents: 'none' }}>
    {items.map(item => <div key={item.id} onMouseEnter={() => pauseFeedback(item.id, true)} onMouseLeave={event => { if (!event.currentTarget.contains(event.currentTarget.ownerDocument.activeElement)) pauseFeedback(item.id, false); }} onFocus={() => pauseFeedback(item.id, true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(':hover')) pauseFeedback(item.id, false); }} style={{ pointerEvents: 'auto', padding: 14, borderRadius: 16, background: token.colorTextHeading, color: token.colorBgContainer, boxShadow: '0 8px 24px rgb(0 0 0 / .22)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><strong>{item.title}</strong><button type="button" aria-label="بستن پیام" onClick={() => closeFeedback(item.id)} style={{ color: 'inherit', background: 'transparent', border: 0, minHeight: 44, minWidth: 44 }}>×</button></div>
      {item.description && <div style={{ maxHeight: 120, overflowY: 'auto', lineHeight: 1.9 }}>{item.description}</div>}
      {!!item.actions?.length && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{item.actions.slice(0, FEEDBACK_POLICY.maxActions).map(action => <button key={action.key} type="button" aria-label={action.label} onClick={() => { void runFeedbackAction(item.id, action.key); }} style={{ minHeight: 44, minWidth: 44, padding: 8, color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: 10 }}>{action.iconOnly ? action.icon : action.label}</button>)}</div>}
    </div>)}
  </section>;
};
export default FeedbackFallback;
