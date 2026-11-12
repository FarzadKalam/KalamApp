import React, { useEffect, useState } from 'react';
import { Badge, Button, Card } from 'antd';
import { InstagramOutlined, MailOutlined, MessageOutlined, PhoneOutlined, RobotOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { resolveCommunicationsPermissions, type PermissionMap } from '../../utils/permissions';
import { hasCurrentOrgPlanFeature } from '../../utils/saasPlanFeatures';
import { useNotificationRuntime } from '../notifications/NotificationRuntimeProvider';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import DashboardWidgetFrame from './DashboardWidgetFrame';
import { supabase } from '../../supabaseClient';

function CommunicationsWidget({ orgId, permissions }: { orgId: string; permissions: PermissionMap }) {
  const navigate = useNavigate(), runtime = useNotificationRuntime();
  const access = resolveCommunicationsPermissions(permissions);
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  useEffect(() => {
    let active = true;setInstagramEnabled(false);setEmailEnabled(false);
    void Promise.all([hasCurrentOrgPlanFeature('instagram_inbox', { defaultEnabled: false }), supabase.rpc('email_can_access', { p_action: 'view' })])
      .then(([instagram, email]) => { if (active) { setInstagramEnabled(instagram);setEmailEnabled(!email.error && email.data === true); } }).catch(() => { /* Optional channels fail closed. */ });
    return () => { active = false; };
  }, [orgId]);
  const instagramAllowed = instagramEnabled && (permissions.instagram_conversations?.view === true || permissions.__saas_admin?.view === true || permissions.__saas_admin?.edit === true);
  if (!access.canUseWorkspace) return null;
  const destinations = [
    { key: 'notes', label: 'پیام‌های داخلی', icon: <MessageOutlined />, visible: true, count: runtime.summary.notes },
    { key: 'bot_direct_messages', label: 'بات‌ها', icon: <RobotOutlined />, visible: access.canUseBotChannels, count: runtime.summary.bot_direct_messages },
    { key: 'bot_messages', label: 'گروه‌های بات', icon: <TeamOutlined />, visible: access.canUseBotChannels, count: runtime.summary.bot_group_messages },
    { key: 'sms_messages', label: 'پیامک‌ها', icon: <MessageOutlined />, visible: access.canUseSms, count: runtime.summary.sms_messages },
    { key: 'voip_calls', label: 'تماس‌ها', icon: <PhoneOutlined />, visible: access.canUseVoip, count: runtime.summary.voip_calls },
    { key: 'email_messages', label: 'ایمیل‌ها', icon: <MailOutlined />, visible: access.canUseEmail && emailEnabled },
    { key: 'instagram', label: 'اینستاگرام', icon: <InstagramOutlined />, visible: instagramAllowed },
  ].filter(item => item.visible);
  return <DashboardWidgetFrame widgetId="communications" title="ارتباطات" defaultOrder={5} onRefresh={() => { void runtime.refreshSummary(); }}>
    <Card title="ارتباطات" className="dashboard-content-card"><div className="dashboard-communication-links">
      {destinations.map(item => <Button key={item.key} className="dashboard-channel-button" onClick={() => navigate(`/messages?tab=${item.key}`)}>
        <Badge count={item.count ? toPersianNumber(item.count) : 0} size="small">{item.icon}</Badge><span>{item.label}</span>
      </Button>)}
    </div></Card>
  </DashboardWidgetFrame>;
}
export default React.memo(CommunicationsWidget);
