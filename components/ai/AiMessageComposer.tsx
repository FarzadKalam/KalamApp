import React, { useMemo, useState } from 'react';
import { Button, Input, Tooltip } from 'antd';
import { ArrowUpOutlined } from '@ant-design/icons';
import { AiComposerSlots } from './AiComposerSlots';
import { shouldSubmitComposerOnEnter } from '../../utils/composeKeyboard';
import './AiMessageComposer.css';

type Props = React.PropsWithChildren<{
  value: string; onChange: (value: string) => void; onSubmit: () => void;
  tools: React.ReactNode; model: React.ReactNode;
  canSubmit?: boolean; busy?: boolean; disabled?: boolean; sendLabel?: string;
  placeholder?: string; maxRows?: number;
}>;

/** One accessible composition surface for dashboard, workspace and contextual AI. */
export default function AiMessageComposer({ value, onChange, onSubmit, tools, model, canSubmit = Boolean(value.trim()), busy = false, disabled = false, sendLabel = 'ارسال پیام', placeholder = 'پیامتان را بنویسید…', maxRows = 8, children }: Props) {
  const [selections, setSelections] = useState<HTMLDivElement | null>(null);
  const [transient, setTransient] = useState<HTMLDivElement | null>(null);
  const slots = useMemo(() => ({ embedded: true, selections, transient }), [selections, transient]);
  const submit = () => { if (canSubmit && !busy && !disabled) onSubmit(); };
  return <AiComposerSlots.Provider value={slots}><div className="ai-message-composer" dir="rtl" aria-busy={busy}>
    {children}
    <div ref={setSelections} className="ai-composer-selections" aria-label="عملکردهای انتخاب‌شده" />
    <div ref={setTransient} className="ai-composer-transient" />
    <Input.TextArea variant="borderless" value={value} disabled={disabled} onChange={event => onChange(event.target.value)}
      placeholder={placeholder} aria-label="پیام به دستیار هوشمند" autoSize={{ minRows: 1, maxRows }}
      onPressEnter={event => { if (!shouldSubmitComposerOnEnter(event) || busy || disabled || !canSubmit) return;event.preventDefault();submit(); }} />
    <div className="ai-composer-footer">
      <div className="ai-composer-tools">{tools}</div>
      <div className="ai-composer-model">{model}</div>
      <Tooltip title={sendLabel}><Button type="primary" shape="circle" className="ai-composer-send" icon={<ArrowUpOutlined />} aria-label={sendLabel}
        disabled={!canSubmit || disabled} loading={busy} onClick={submit}><span className="sr-only">{sendLabel}</span></Button></Tooltip>
    </div>
  </div></AiComposerSlots.Provider>;
}
