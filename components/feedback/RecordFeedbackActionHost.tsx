import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { RECORD_FEEDBACK_ACTION_EVENT, type RecordFeedbackActionRequest } from '../../utils/recordFeedback';
import { appFeedback, getFeedbackScope, subscribeFeedback } from '../../utils/appFeedback';
import { fetchCurrentUserRoleContext, resolveCommunicationsPermissions } from '../../utils/permissions';
import { hasCurrentOrgPlanModule } from '../../utils/saasPlanModules';
import { supabase } from '../../supabaseClient';
const ContactActions = lazy(() => import('../RecordMessageActions'));

const RecordFeedbackActionHost = () => {
  const navigate = useNavigate();
  const scope = useSyncExternalStore(subscribeFeedback, getFeedbackScope, getFeedbackScope);
  const [contact, setContact] = useState<RecordFeedbackActionRequest | null>(null);
  useEffect(() => {
    const handle = (event: Event) => {
      const request = (event as CustomEvent<RecordFeedbackActionRequest>).detail;
      if (!request?.record?.id || request.scope !== getFeedbackScope()) return;
      void (async () => {
        const context = await fetchCurrentUserRoleContext(supabase);
        if (request.scope !== getFeedbackScope() || JSON.stringify([context.orgId, context.userId]) !== request.scope) return;
        const comm = resolveCommunicationsPermissions(context.permissions);
        if (request.kind === 'message' || request.kind === 'call') {
          const allowed = request.kind === 'message' ? comm.canUseSms && context.permissions?.__communications?.edit !== false : comm.canUseVoip && context.permissions?.__voip?.view !== false;
          if (!allowed) { appFeedback.warning('دسترسی انجام این کار را ندارید.'); return; }
          setContact(request);
          return;
        }
        const target = request.kind === 'create_invoice' ? 'invoices' : 'tasks';
        if (context.permissions?.[target]?.edit === false || !await hasCurrentOrgPlanModule(target)) { appFeedback.warning('این کار برای حساب یا پلن سازمان شما در دسترس نیست.'); return; }
        if (getFeedbackScope() !== request.scope) return;
        const initialValues = target === 'invoices' ? { customer_id: request.record.id } : { related_to_module: request.moduleId, source_module_id: request.moduleId, source_record_id: request.record.id };
        navigate(`/${target}/create`, { state: { initialValues, fromFeedback: true } });
      })().catch(() => appFeedback.error('آماده‌کردن این کار ناموفق بود؛ دوباره تلاش کنید.'));
    };
    window.addEventListener(RECORD_FEEDBACK_ACTION_EVENT, handle);
    return () => window.removeEventListener(RECORD_FEEDBACK_ACTION_EVENT, handle);
  }, [navigate]);
  if (!contact || contact.scope !== scope) return null;
  return <Suspense fallback={null}><ContactActions key={`${contact.kind}:${contact.record.id}`} moduleId={contact.moduleId} record={contact.record} initialAction={contact.kind === 'call' ? 'call' : 'sms'} onActionComplete={() => setContact(null)} /></Suspense>;
};
export default RecordFeedbackActionHost;
