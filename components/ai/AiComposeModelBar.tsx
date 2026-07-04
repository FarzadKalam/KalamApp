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
};

const resolveEffectiveCapability = (selected: Set<string>, fallbackCapability?: string | null) => {
  if (selected.has('document_generation')) return 'document_generation';
  if (selected.has('video_generation')) return 'video_generation';
  if (selected.has('image_generation')) return 'image_generation';
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

const CAPABILITY_FA: Record<string, string> = {
  document_generation: 'ساخت فایل',
  video_generation: 'ساخت ویدیو',
  image_generation: 'ساخت تصویر',
  voice_output: 'تولید صدا',
  process_operation: 'اقدام فرآیندی',
  dashboard_chat: 'گفتگوی آزاد',
  record_chat: 'گفتگو روی رکورد',
  legal_assistant: 'دستیار حقوقی',
  deep_reasoning: 'تفکر عمیق',
  web_search: 'جستجوی وب',
  document_analysis: 'تحلیل سند',
  voice_input: 'تحلیل صدا',
};

const AiComposeModelBar: React.FC<AiComposeModelBarProps> = ({
  selectedCapabilities,
  onModelOverrideChange,
  fallbackCapability,
  refreshKey,
  persistedOverrides,
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
    <div className="flex items-center gap-1 text-[9px] leading-4 text-gray-400 dark:text-gray-500" dir="rtl">
      <AiSparkleIcon className="h-2.5 w-2.5 text-[rgb(var(--brand-500-rgb))]" />
      <Tooltip title={`موتور تخصصی «${effectiveCapability ? CAPABILITY_FA[effectiveCapability] || effectiveCapability : 'هوش مصنوعی'}» برای همین ارسال قابل تغییر است`}>
        <span className="shrink-0">موتور:</span>
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
          onModelOverrideChange(model || null, effectiveCapability);
        }}
        disabled={info.available === false}
      />
    </div>
  );
};

export default AiComposeModelBar;
