import { getAiAgent, getAiExecutionSteps, type AiAgentActivity } from '../../supabase/functions/_shared/ai-agents';
import './AiChatPresentation.css';

export default function AiExecutionTimeline({ events, running = false }: { events: AiAgentActivity[]; running?: boolean }) {
  const steps = getAiExecutionSteps(events);
  if (!steps.length) return null;
  return <details className="ai-execution-timeline" open={running || undefined}>
    <summary>مراحل انجام درخواست <span>({steps.length.toLocaleString('fa-IR')})</span></summary>
    <ol>{steps.map((step, index) => <li key={`${step.agentId}-${step.startedAt}-${index}`} data-state={step.failed ? 'failed' : step.endedAt !== undefined ? 'completed' : running ? 'running' : 'interrupted'}>
      <span className="ai-execution-marker" aria-hidden="true" />
      <div><strong>{getAiAgent(step.agentId).label}</strong><span className="ai-execution-description">{step.failed ? 'این مرحله با خطا پایان یافت' : step.endedAt !== undefined ? 'پایان مرحله' : running ? getAiAgent(step.agentId).activity : 'مرحله ناتمام است'}{step.parallel ? ' · اجرای هم‌زمان' : ''}</span></div>
    </li>)}</ol>
  </details>;
}
