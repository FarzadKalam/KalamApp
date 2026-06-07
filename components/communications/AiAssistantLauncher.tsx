import React, { useEffect, useRef } from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { OpenAIOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { AI_CONTEXT_EVENT, type AssistantContext } from '../../utils/aiAssistantEvents';

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
  const navigate = useNavigate();
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

  const openAssistant = () => {
    if (disabled || typeof window === 'undefined') return;
    const currentRoute = `${window.location.pathname}${window.location.search || ''}`;
    const nextContext = lastContextRef.current?.route === currentRoute
      ? lastContextRef.current
      : null;
    navigate('/messages?tab=assistant', {
      state: nextContext ? { assistantContext: nextContext } : undefined,
    });
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

  return tooltipTitle ? (
    <Tooltip title={tooltipTitle} placement="bottom">
      {button}
    </Tooltip>
  ) : button;
};

export default AiAssistantLauncher;
