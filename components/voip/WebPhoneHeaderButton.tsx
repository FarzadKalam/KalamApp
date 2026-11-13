import React from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { setVoipPanelOpen, useVoipState } from '../../utils/voipStore';

type WebPhoneHeaderButtonProps = {
  visible: boolean;
  isMobile?: boolean;
  className?: string;
};

const PhoneIconSvg: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const WebPhoneHeaderButton: React.FC<WebPhoneHeaderButtonProps> = ({
  visible,
  isMobile,
  className,
}) => {
  const voip = useVoipState();
  if (!visible) return null;

  const badgeStatus = voip.activeCall
    ? 'processing'
    : voip.status === 'registered'
      ? 'success'
      : voip.status === 'error'
        ? 'error'
        : 'default';

  const tooltip = voip.activeCall
    ? 'مکالمه زنده در جریان'
    : voip.status === 'registered'
      ? `تلفن زنده متصل (${voip.extension || 'داخلی'})`
      : 'تلفن اینترنتی VoIP';

  return (
    <Tooltip title={tooltip} placement="bottom">
      <Badge dot status={badgeStatus} offset={[-4, 4]}>
        <Button
          type={voip.panelOpen || voip.activeCall ? 'primary' : 'text'}
          size={isMobile ? 'small' : 'middle'}
          shape="circle"
          icon={<PhoneIconSvg />}
          onClick={() => setVoipPanelOpen(!voip.panelOpen)}
          aria-label="تلفن اینترنتی VoIP"
          className={className}
        />
      </Badge>
    </Tooltip>
  );
};

export default WebPhoneHeaderButton;
