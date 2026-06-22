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
  onModelOverrideChange: (model: string | null) => void;
  refreshKey?: number;
};

const resolveEffectiveCapability = (selected: Set<string>) => {
  if (selected.has('document_generation')) return 'document_generation';
  if (selected.has('video_generation')) return 'video_generation';
  if (selected.has('image_generation')) return 'image_generation';
  if (selected.has('voice_output')) return 'voice_output';
  return null;
};

const CAPABILITY_FA: Record<string, string> = {
  document_generation: 'ساخت فایل',
  video_generation: 'ساخت ویدیو',
  image_generation: 'ساخت تصویر',
  voice_output: 'تولید صدا',
};

const AiComposeModelBar: React.FC<AiComposeModelBarProps> = ({
  selectedCapabilities,
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
    () => resolveEffectiveCapability(new Set(selectedCapabilities)),
    [selectedCapabilities],
  );

  const info = effectiveCapability ? capabilities[effectiveCapability] : null;

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
          onModelOverrideChange(model || null);
        }}
        disabled={info.available === false}
      />
    </div>
  );
};

export default AiComposeModelBar;
