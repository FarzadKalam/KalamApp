import React, { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';
import AssistantPanel from '../ai/AssistantPanel';
import AiSparkleIcon from '../ai/AiSparkleIcon';

type AiAssistantLauncherProps = {
  buttonClassName?: string;
  buttonSize?: ButtonProps['size'];
  disabled?: boolean;
  tooltipTitle?: React.ReactNode;
};

const AiAssistantLauncher: React.FC<AiAssistantLauncherProps> = ({
  buttonClassName,
  buttonSize = 'middle',
  disabled = false,
  tooltipTitle = 'گفتگو با هوش مصنوعی درباره صفحه یا رکورد جاری',
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const lastContextRef = useRef<AssistantContext | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleContextUpdate = (event: Event) => {
      const detail = (event as CustomEvent<AssistantContext>).detail || null;
      lastContextRef.current = detail;
    };
    window.addEventListener(AI_CONTEXT_EVENT, handleContextUpdate as EventListener);
    return () => window.removeEventListener(AI_CONTEXT_EVENT, handleContextUpdate as EventListener);
  }, []);

  const openAssistant = () => {
    if (disabled || typeof window === 'undefined') return;
    const pathname = location.pathname || '/';
    if (pathname === '/' || pathname === '/dashboard' || pathname === '/ai') {
      navigate('/ai');
      return;
    }
    const currentRoute = `${window.location.pathname}${window.location.search || ''}`;
    const nextContext = lastContextRef.current?.route === currentRoute
      ? lastContextRef.current
      : null;
    if (nextContext) {
      window.dispatchEvent(new CustomEvent(AI_CONTEXT_EVENT, { detail: nextContext }));
    }
    setOpen(true);
  };

  const button = (
    <Button
      type="text"
      shape="circle"
      size={buttonSize}
      icon={<AiSparkleIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
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
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="left"
        width="min(92vw, 440px)"
        title={null}
        classNames={{ body: '!p-0' }}
        destroyOnHidden
        getContainer={typeof document === 'undefined' ? undefined : () => document.body}
      >
        <AssistantPanel active={open} />
      </Drawer>
    </>
  );
};

export default AiAssistantLauncher;
