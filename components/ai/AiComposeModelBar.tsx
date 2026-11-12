import { getAiAgentLabel } from '../../supabase/functions/_shared/ai-agents';
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
  onModelOverrideChange: (model: string | null, capability?: string | null) => void;
  fallbackCapability?: string | null;
  refreshKey?: number;
  persistedOverrides?: Record<string, string> | null;
  compact?: boolean;
};

const resolveEffectiveCapability = (selected: Set<string>, fallbackCapability?: string | null) => {
  if (selected.has('document_generation')) return 'document_generation';
  if (selected.has('video_generation')) return 'video_generation';
  if (selected.has('image_generation')) return 'image_generation';
  if (selected.has('voice_input') && selected.has('voice_output')) return 'voice_conversation';
  if (selected.has('voice_output')) return 'voice_output';
  if (selected.has('process_operation')) return 'process_operation';
  if (selected.has('record_creation')) return fallbackCapability || 'dashboard_chat';
  if (selected.has('legal_assistant')) return 'legal_assistant';
  if (selected.has('deep_reasoning')) return 'deep_reasoning';
  if (selected.has('web_search')) return 'web_search';
  if (selected.has('document_analysis')) return 'document_analysis';
  if (selected.has('voice_input')) return 'voice_input';
  return fallbackCapability || null;
};


const AiComposeModelBar: React.FC<AiComposeModelBarProps> = ({
  selectedCapabilities,
  onModelOverrideChange,
  fallbackCapability,
  refreshKey,
  persistedOverrides,
  compact = false,
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
    () => resolveEffectiveCapability(new Set(selectedCapabilities), fallbackCapability),
    [fallbackCapability, selectedCapabilities],
  );

  const info = effectiveCapability ? capabilities[effectiveCapability] : null;

  const options = useMemo(
    () => (info?.selectable?.length ? info.selectable : (info ? [{ value: info.model, label: info.modelLabel }] : [])),
    [info],
  );
  const optionValues = useMemo(() => new Set(options.map((item) => String(item.value || '').trim()).filter(Boolean)), [options]);

  useEffect(() => {
    if (!effectiveCapability || !info) return;
    const persisted = String(persistedOverrides?.[effectiveCapability] || '').trim();
    if (persisted && optionValues.has(persisted)) {
      setOverride(persisted);
      return;
    }
    setOverride((current) => (current && optionValues.has(current) ? current : null));
  }, [effectiveCapability, info, optionValues, persistedOverrides]);

  const persistedValue = effectiveCapability && optionValues.has(String(persistedOverrides?.[effectiveCapability] || '').trim())
    ? String(persistedOverrides?.[effectiveCapability] || '').trim()
    : '';
  const value = info ? (override && optionValues.has(override) ? override : persistedValue || info.model) : null;

  useEffect(() => {
    if (info) onModelOverrideChangeRef.current(value || null, effectiveCapability);
  }, [effectiveCapability, info, value]);

  if (!info) return null;

  return (
    <div
      className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-0.5 text-[11px] leading-4 text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400"
      dir="rtl"
    >
      {!compact && <AiSparkleIcon className="h-3 w-3 shrink-0 text-[rgb(var(--brand-500-rgb))]" />}
      <Tooltip title={`موتور تخصصی «${effectiveCapability ? getAiAgentLabel(effectiveCapability) : 'هوش مصنوعی'}» برای همین ارسال قابل تغییر است`}>
        <span className={compact ? 'sr-only' : 'shrink-0 text-[10.5px]'}>موتور:</span>
      </Tooltip>
      <Select
        size="small"
        aria-label="مدل هوش مصنوعی"
        variant="borderless"
        value={value || undefined}
        options={options}
        popupMatchSelectWidth={false}
        className="min-w-[106px] !text-[11px]"
        onChange={(next) => {
          const model = String(next || '');
          setOverride(model);
          onModelOverrideChange(model || null, effectiveCapability);
        }}
        disabled={info.available === false}
      />
    </div>
  );
};

export default AiComposeModelBar;
