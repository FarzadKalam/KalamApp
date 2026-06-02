import React, { useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { OpenAIOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';

const NotificationsPopover = React.lazy(() => import('../NotificationsPopover'));

type AiAssistantLauncherProps = {
  isMobile: boolean;
  buttonClassName?: string;
  buttonSize?: ButtonProps['size'];
  disabled?: boolean;
  tooltipTitle?: React.ReactNode;
};

const AiAssistantLauncher: React.FC<AiAssistantLauncherProps> = ({
  isMobile,
  buttonClassName,
  buttonSize = 'middle',
  disabled = false,
  tooltipTitle = 'گفتگو با هوش مصنوعی درباره صفحه یا رکورد جاری',
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [panelMounted, setPanelMounted] = useState(false);
  const [pendingContext, setPendingContext] = useState<AssistantContext | null>(null);
  const lastContextRef = useRef<AssistantContext | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleContextUpdate = (event: Event) => {
      const detail = (event as CustomEvent<AssistantContext>).detail || null;
      lastContextRef.current = detail;
    };
    window.addEventListener(AI_CONTEXT_EVENT, handleContextUpdate as EventListener);
    return () => window.removeEventListener(AI_CONTEXT_EVENT, handleContextUpdate as EventListener);
  }, []);

  useEffect(() => {
    if (!panelMounted || !pendingContext || typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, { detail: pendingContext }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [panelMounted, pendingContext]);

  const openAssistant = () => {
    if (disabled || typeof window === 'undefined') return;
    if (location.pathname === '/messages') {
      navigate('/messages?tab=assistant');
      return;
    }
    const currentRoute = `${window.location.pathname}${window.location.search || ''}`;
    const nextContext = lastContextRef.current?.route === currentRoute
      ? lastContextRef.current
      : null;
    setPendingContext(nextContext);
    setPanelMounted(true);
  };

  const button = (
    <Button
      type="text"
      shape="circle"
      size={buttonSize}
      icon={<OpenAIOutlined className="text-gray-500 dark:text-gray-400" />}
      onClick={openAssistant}
      aria-label="چت هوش مصنوعی"
      className={buttonClassName}
      disabled={disabled}
    />
  );

  return (
    <>
      {tooltipTitle ? (
        <Tooltip title={tooltipTitle} placement="bottom">
          {button}
        </Tooltip>
      ) : button}
      {panelMounted ? (
        <React.Suspense fallback={null}>
          <NotificationsPopover
            isMobile={isMobile}
            variant="chat"
            requestedTab="assistant"
            initialOpen
            triggerless
            onClosed={() => {
              setPanelMounted(false);
              setPendingContext(null);
            }}
          />
        </React.Suspense>
      ) : null}
    </>
  );
};

export default AiAssistantLauncher;
