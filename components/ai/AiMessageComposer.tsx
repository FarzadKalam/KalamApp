import React, { useMemo, useState } from 'react';
import { Button, Input, Tooltip } from 'antd';
import { Suggestion, type SuggestionProps } from '@ant-design/x';
import { ArrowUpOutlined } from '@ant-design/icons';
import { AiComposerSlots } from './AiComposerSlots';
import { shouldSubmitComposerOnEnter } from '../../utils/composeKeyboard';
import './AiMessageComposer.css';

export type AiComposerSuggestionItem = NonNullable<SuggestionProps<string>['items']> extends (infer U) | ((...args: any[]) => any)
  ? U extends Array<infer Item>
    ? Item
    : never
  : never;

type Props = React.PropsWithChildren<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  tools: React.ReactNode;
  model: React.ReactNode;
  reserveMenuSpace?: boolean;
  canSubmit?: boolean;
  busy?: boolean;
  disabled?: boolean;
  sendLabel?: string;
  placeholder?: string;
  maxRows?: number;
  suggestions?: Array<{
    label: React.ReactNode;
    value: string;
    icon?: React.ReactNode;
    extra?: React.ReactNode;
    trigger?: '/' | '@';
    keywords?: string;
  }>;
  onSelectSuggestion?: (value: string, rawTriggerMatch: string) => void;
}>;

const extractSuggestionTrigger = (text: string): { trigger: '/' | '@'; query: string; rawMatch: string } | null => {
  const match = String(text || '').match(/(?:^|\s)([/@])([^\s\n]*)$/);
  if (!match) return null;
  const trigger = match[1] as '/' | '@';
  const query = match[2] || '';
  return { trigger, query, rawMatch: `${trigger}${query}` };
};

const filterComposerSuggestions = <T extends { value: string; trigger?: '/' | '@'; keywords?: string }>(
  items: T[],
  rawTrigger: string,
) => {
  const trigger = rawTrigger.startsWith('@') ? '@' : rawTrigger.startsWith('/') ? '/' : null;
  const query = trigger ? rawTrigger.slice(1).trim().toLowerCase() : rawTrigger.trim().toLowerCase();
  return items.filter((item) => {
    if (trigger && item.trigger && item.trigger !== trigger) return false;
    if (!query) return true;
    const haystack = `${item.value} ${item.keywords || ''}`.toLowerCase();
    return haystack.includes(query);
  });
};

/** One accessible composition surface for dashboard, workspace and contextual AI. */
export default function AiMessageComposer({
  value,
  onChange,
  onSubmit,
  tools,
  model,
  reserveMenuSpace = false,
  canSubmit = Boolean(value.trim()),
  busy = false,
  disabled = false,
  sendLabel = 'ارسال پیام',
  placeholder = 'پیامتان را بنویسید… (برای دستورات / یا @ بزنید)',
  maxRows = 8,
  suggestions = [],
  onSelectSuggestion,
  children,
}: Props) {
  const [selections, setSelections] = useState<HTMLDivElement | null>(null);
  const [transient, setTransient] = useState<HTMLDivElement | null>(null);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [lastTriggerMatch, setLastTriggerMatch] = useState('');
  const slots = useMemo(() => ({ embedded: true, selections, transient }), [selections, transient]);
  const submit = () => {
    if (canSubmit && !busy && !disabled) onSubmit();
  };

  const renderTextarea = (triggerProps?: {
    onTrigger?: (info?: string | false) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
  }) => (
    <Input.TextArea
      variant="borderless"
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const nextValue = event.target.value;
        onChange(nextValue);
        if (triggerProps?.onTrigger && suggestions.length > 0) {
          const hit = extractSuggestionTrigger(nextValue);
          if (hit && filterComposerSuggestions(suggestions, hit.rawMatch).length > 0) {
            setLastTriggerMatch(hit.rawMatch);
            triggerProps.onTrigger(hit.rawMatch);
          } else {
            setLastTriggerMatch('');
            triggerProps.onTrigger(false);
          }
        }
      }}
      placeholder={placeholder}
      aria-label="پیام به دستیار هوشمند"
      autoSize={{ minRows: 1, maxRows }}
      onKeyDown={(event) => {
        if (suggestionOpen && triggerProps?.onKeyDown && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
          triggerProps.onKeyDown(event);
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault();
          }
          return;
        }
        if (!shouldSubmitComposerOnEnter(event) || busy || disabled || !canSubmit) return;
        event.preventDefault();
        submit();
      }}
      onPressEnter={(event) => {
        if (suggestionOpen) {
          event.preventDefault();
        }
      }}
    />
  );

  return (
    <AiComposerSlots.Provider value={slots}>
      <div className={`ai-message-composer${reserveMenuSpace ? ' ai-message-composer-with-menu' : ''}`} dir="rtl" aria-busy={busy}>
        {children}
        <div ref={setSelections} className="ai-composer-selections" aria-label="عملکردهای انتخاب‌شده" />
        <div ref={setTransient} className="ai-composer-transient" />
        {suggestions.length > 0 ? (
          <Suggestion<string>
            open={suggestionOpen}
            onOpenChange={setSuggestionOpen}
            block
            items={(info) => {
              const filtered = filterComposerSuggestions(suggestions, String(info || ''));
              return filtered.map(({ label, value: itemValue, icon, extra }) => ({
                label,
                value: itemValue,
                icon,
                extra,
              }));
            }}
            onSelect={(selectedValue) => {
              setSuggestionOpen(false);
              onSelectSuggestion?.(selectedValue, lastTriggerMatch);
              setLastTriggerMatch('');
            }}
          >
            {({ onTrigger, onKeyDown }) => renderTextarea({ onTrigger, onKeyDown })}
          </Suggestion>
        ) : (
          renderTextarea()
        )}
        <div className="ai-composer-footer">
          <div className="ai-composer-tools">{tools}</div>
          <div className="ai-composer-model">{model}</div>
          <Tooltip title={sendLabel}>
            <Button
              type="primary"
              shape="circle"
              className="ai-composer-send"
              icon={<ArrowUpOutlined />}
              aria-label={sendLabel}
              disabled={!canSubmit || disabled}
              loading={busy}
              onClick={submit}
            >
              <span className="sr-only">{sendLabel}</span>
            </Button>
          </Tooltip>
        </div>
      </div>
    </AiComposerSlots.Provider>
  );
}
