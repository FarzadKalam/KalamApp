import React from 'react';
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
  tooltipTitle = 'باز کردن هوش مصنوعی تازه سیستم',
}) => {
  const navigate = useNavigate();

  const openAssistant = () => {
    if (disabled) return;
    navigate('/ai');
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

  return tooltipTitle ? (
    <Tooltip title={tooltipTitle} placement="bottom">
      {button}
    </Tooltip>
  ) : button;
};

export default AiAssistantLauncher;
