import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Select, Tooltip } from 'antd';
import { supabase } from '../../supabaseClient';
import AiSparkleIcon from './AiSparkleIcon';

type CapabilityModelInfo = {
  model: string;
  modelLabel: string;
  selectable: Array<{ value: string; label: string }>;
  available: boolean;
};

type AiComposeModelBarProps = {
  selectedCapabilities: string[];
  contextMode?: string | null;
  onModelOverrideChange: (model: string | null) => void;
  refreshKey?: number;
};

// Mirror of the backend capability resolution in handleChat: which model a
// message will actually use, given the selected composer capabilities.
const resolveEffectiveCapability = (selected: Set<string>, contextMode?: string | null) => {
  if (selected.has('document_generation')) return 'document_generation';
  if (selected.has('video_generation')) return 'video_generation';
  if (selected.has('image_generation')) return 'image_generation';
  if (selected.has('voice_output')) return 'voice_output';
  if (selected.has('legal_assistant')) return 'legal_assistant';
  if (selected.has('deep_reasoning')) return 'deep_reasoning';
  if (selected.has('document_analysis')) return 'document_analysis';
  return contextMode === 'record' ? 'record_chat' : 'dashboard_chat';
};

const CAPABILITY_FA: Record<string, string> = {
  document_generation: 'ساخت فایل',
  video_generation: 'ساخت ویدیو',
  image_generation: 'ساخت تصویر',
  voice_output: 'تولید صدا',
  legal_assistant: 'دستیار حقوقی',
  deep_reasoning: 'تفکر عمیق',
  document_analysis: 'تحلیل اسناد',
  record_chat: 'گفتگوی رکورد',
  dashboard_chat: 'گفتگوی عادی',
};

const AiComposeModelBar: React.FC<AiComposeModelBarProps> = ({
  selectedCapabilities,
  contextMode,
  onModelOverrideChange,
  refreshKey,
}) => {
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityModelInfo>>({});
  const [override, setOverride] = useState<string | null>(null);
  const onModelOverrideChangeRef = useRef(onModelOverrideChange);

  useEffect(() => {
    onModelOverrideChangeRef.current = onModelOverrideChange;
  }, [onModelOverrideChange]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ai-assistant', { body: { action: 'get_compose_models' } });
        if (error) throw error;
        if (mounted && data?.success) setCapabilities(data.capabilities || {});
      } catch {
        // Silent — the bar simply won't render model details.
      }
    })();
    return () => { mounted = false; };
  }, [refreshKey]);

  const effectiveCapability = useMemo(
    () => resolveEffectiveCapability(new Set(selectedCapabilities), contextMode),
    [selectedCapabilities, contextMode],
  );

  const info = capabilities[effectiveCapability];

  // Reset the per-message override whenever the effective capability changes.
  useEffect(() => {
    setOverride(null);
    onModelOverrideChangeRef.current(null);
  }, [effectiveCapability]);

  const value = info ? (override || info.model) : null;

  useEffect(() => {
    if (info) onModelOverrideChangeRef.current(value || null);
  }, [info, value]);

  if (!info) return null;

  const options = info.selectable?.length ? info.selectable : [{ value: info.model, label: info.modelLabel }];

  return (
    <div className="flex items-center gap-1 text-[9px] leading-4 text-gray-400 dark:text-gray-500" dir="rtl">
      <AiSparkleIcon className="h-2.5 w-2.5 text-[rgb(var(--brand-500-rgb))]" />
      <Tooltip title={`مدل فعال برای «${CAPABILITY_FA[effectiveCapability] || effectiveCapability}» — برای این پیام قابل تغییر است`}>
        <span className="shrink-0">مدل:</span>
      </Tooltip>
      <Select
        size="small"
        variant="borderless"
        value={value || undefined}
        options={options}
        popupMatchSelectWidth={false}
        className="min-w-[104px] !text-[9px]"
        onChange={(next) => {
          const model = String(next || '');
          setOverride(model);
          onModelOverrideChange(model || null);
        }}
        disabled={info.available === false}
      />
    </div>
  );
};

export default AiComposeModelBar;
