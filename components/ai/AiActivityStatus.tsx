import { Button, Tooltip } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { getAiAgent, type AiAgentActivity } from '../../supabase/functions/_shared/ai-agents';
import './AiChatPresentation.css';

type Props = { agentId?: string; activities?: AiAgentActivity[]; onStop?: () => void };
export default function AiActivityStatus({ agentId = 'auto_decision', activities = [], onStop }: Props) {
  const active = activities.length ? activities.map(item => item.agentId) : [agentId];
  return <div className="ai-chat-theme ai-activity-status" role="status" aria-live="polite" aria-atomic="true">
    <div className="ai-activity-lines">{active.map(id => {
      const agent = getAiAgent(id);
      return <div className="ai-activity-line" key={id}><span className="ai-activity-dot" aria-hidden="true" /><span><strong>{agent.label}</strong><span className="ai-activity-description">{agent.activity}…</span></span></div>;
    })}</div>
    {onStop && <Tooltip title="توقف دریافت پاسخ"><Button type="text" className="ai-chat-icon" icon={<StopOutlined />} aria-label="توقف دریافت پاسخ" onClick={onStop} /></Tooltip>}
  </div>;
}
