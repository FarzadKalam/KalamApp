import React from 'react';
import { Button, Tooltip } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { getAiAgent, type AiAgentActivity } from '../../supabase/functions/_shared/ai-agents';
import { getAgentDefinition, type AgentKey } from '../../utils/aiAgentCatalog';
import { AiAgentCameoFigure } from './AiAgentIcon';
import './AiChatPresentation.css';

type Props = { agentId?: string; activities?: AiAgentActivity[]; onStop?: () => void };

const resolveAgentDisplay = (id: string) => {
  const catalogDef = getAgentDefinition(id as AgentKey);
  if (catalogDef) {
    return {
      label: catalogDef.titleFa,
      shortLabel: catalogDef.shortTitleFa,
      activity: catalogDef.roleFocusFa || 'در حال پردازش و ارزیابی داده‌ها',
      badgeColor: catalogDef.badgeColor,
      agentKey: catalogDef.key,
    };
  }
  const fallback = getAiAgent(id);
  const cleanLabel = fallback.label === 'ایجنت گفتگو' ? 'ایجنت هوشمند' : fallback.label;
  return {
    label: cleanLabel,
    shortLabel: cleanLabel,
    activity: fallback.activity || 'در حال آماده‌سازی پاسخ',
    badgeColor: '#6366f1',
    agentKey: null,
  };
};

export default function AiActivityStatus({ agentId = 'lead_orchestrator', activities = [], onStop }: Props) {
  const active = activities.length ? activities.map(item => item.agentId) : [agentId];
  return (
    <div className="ai-chat-theme ai-activity-status" role="status" aria-live="polite" aria-atomic="true">
      <div className="ai-activity-lines">
        {active.map(id => {
          const info = resolveAgentDisplay(id);
          return (
            <div className="ai-activity-line flex items-center gap-2" key={id}>
              {info.agentKey ? (
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-900 overflow-hidden"
                  style={{ borderColor: `${info.badgeColor}80` }}
                >
                  <AiAgentCameoFigure agentKey={info.agentKey} size={16} accentColor={info.badgeColor} />
                </div>
              ) : (
                <span className="ai-activity-dot" aria-hidden="true" />
              )}
              <span className="text-xs">
                <strong className="text-slate-800 dark:text-slate-100">{info.label}</strong>
                <span className="ai-activity-description text-slate-500 mr-1.5">{info.activity}…</span>
              </span>
            </div>
          );
        })}
      </div>
      {onStop && (
        <Tooltip title="توقف دریافت پاسخ">
          <Button type="text" className="ai-chat-icon" icon={<StopOutlined />} aria-label="توقف دریافت پاسخ" onClick={onStop} />
        </Tooltip>
      )}
    </div>
  );
}
