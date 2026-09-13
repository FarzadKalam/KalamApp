import React, { useEffect } from 'react';
import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { useNavigate } from 'react-router-dom';
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
  tooltipTitle = 'باز کردن دستیار هوشمند سازمان',
}) => {
  const navigate = useNavigate();

  const openAssistant = () => {
    if (disabled) return;
    navigate('/ai');
  };

  useEffect(() => {
    if (disabled || typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const onShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.shiftKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== 'a') return;
      event.preventDefault();
      navigate('/ai');
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [disabled, navigate]);

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

  return tooltipTitle ? (
    <Tooltip title={<span>{tooltipTitle} <kbd className="keyboard-shortcut-hint mr-1 text-[9px] opacity-70">Alt+A</kbd></span>} placement="bottom">
      {button}
    </Tooltip>
  ) : button;
};

export default AiAssistantLauncher;
