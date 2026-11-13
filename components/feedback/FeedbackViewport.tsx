import { useEffect, useState } from 'react';
import theme from 'antd/es/theme';
import { closeFeedback, feedbackShown, pauseFeedback, runFeedbackAction, type FeedbackItem } from '../../utils/appFeedback';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';
import { Sileo } from './sileo/sileo';
import './feedback.css';
import { FEEDBACK_POLICY } from '../../utils/feedbackPolicy';

const FeedbackViewport = ({ items }: { items: FeedbackItem[] }) => {
  const { token } = theme.useToken();
  const reducedMotion = usePrefersReducedMotion();
  const [width, setWidth] = useState(() => Math.min(FEEDBACK_POLICY.width, window.innerWidth - FEEDBACK_POLICY.viewportGutter));
  useEffect(() => {
    const resize = () => setWidth(Math.min(FEEDBACK_POLICY.width, window.innerWidth - FEEDBACK_POLICY.viewportGutter));
    window.addEventListener('resize', resize, { passive: true });
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => { items.forEach(item => feedbackShown(item.id)); }, [items]);
  const isDark = token.colorBgContainer !== '#ffffff' && token.colorBgContainer !== '#fff';
  return (
    <section className="app-feedback-viewport" data-sileo-viewport data-position="top-center" dir="rtl" aria-label="پیام‌های سامانه" aria-live="polite" aria-relevant="additions text" style={{
      fontFamily: token.fontFamily,
      '--feedback-width': `${width}px`, '--feedback-ink': isDark ? '#171717' : '#fafafa',
      '--feedback-muted': isDark ? '#525252' : '#d4d4d4', '--feedback-line': isDark ? 'rgb(0 0 0 / .06)' : 'rgb(255 255 255 / .08)',
    } as React.CSSProperties}>
      {items.map(item => <div className="app-feedback-item" key={item.id}
        onMouseEnter={() => pauseFeedback(item.id, true)} onMouseLeave={() => pauseFeedback(item.id, false)}
        onFocus={() => pauseFeedback(item.id, true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) pauseFeedback(item.id, false); }}>
        <Sileo id={item.id} refreshKey={String(item.revision)} title={item.title} state={item.kind} width={width} reducedMotion={reducedMotion}
          fill={isDark ? '#ffffff' : '#171717'} position="center" icon={item.icon}
          description={item.description || item.actions?.length ? <>
            {item.description && <div className="app-feedback-description">{item.description}</div>}
            {!!item.actions?.length && <div className="app-feedback-actions" role="group" aria-label="اقدام‌های پیشنهادی">
              {item.actions.slice(0, FEEDBACK_POLICY.maxActions).map(action => <button key={action.key} type="button" data-sileo-button data-state={item.kind} aria-label={action.label} title={action.label} className={action.iconOnly ? 'app-feedback-icon-action' : 'app-feedback-primary-action'} onClick={() => { void runFeedbackAction(item.id, action.key); }}>
                {action.icon && <span aria-hidden="true">{action.icon}</span>}{!action.iconOnly && action.label}
              </button>)}
            </div>}
          </> : undefined}
          autoExpandDelayMs={item.description || item.actions?.length ? FEEDBACK_POLICY.expandDelayMs : undefined}
          onDismiss={() => closeFeedback(item.id)} />
      </div>)}
    </section>
  );
};
export default FeedbackViewport;
