import {lazy,Suspense} from 'react';
import {Modal,Spin} from 'antd';
const AssistantPanel=lazy(()=>import('./AssistantPanel'));
export default function AiApprovalReviewModal({action,onClose}:{action:any;onClose:()=>void}){
  const threadId=action?.thread_id || action?.threadId;
  return <Modal open={Boolean(action)} title="بررسی کارت و تأیید اقدام" onCancel={onClose} footer={null} width="min(96vw, 1000px)" destroyOnHidden zIndex={31000}>
    <div className="h-[min(78dvh,800px)] min-h-0">
      {threadId ? <Suspense fallback={<Spin />}><AssistantPanel key={threadId} active initialThreadId={threadId} /></Suspense>
        : <div role="alert">گفتگوی متصل به این اقدام در دسترس نیست؛ امکان اجرای بدون بررسی کارت وجود ندارد.</div>}
    </div>
  </Modal>;
}
