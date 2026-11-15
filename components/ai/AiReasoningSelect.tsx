import React from 'react';
import { Select,Tooltip } from 'antd';
import { reasoningOptions } from '../../supabase/functions/_shared/ai-reasoning';

type Props={ model?: any;value?: string | null;onChange?: (value: string | null) => void;inheritLabel?: string;disabled?: boolean };
const AiReasoningSelect:React.FC<Props>=({ model,value,onChange,inheritLabel='پیش‌فرض مدل',disabled }) => {
  const options=reasoningOptions(model);
  if (!options.length) return null;
  const valid=options.some(option => option.value===value);
  return <Tooltip title="تفکر بیشتر می‌تواند زمان پاسخ و مصرف توکن را افزایش دهد.">
    <Select aria-label="میزان تفکر" className="w-full" disabled={disabled} value={valid ? value : ''}
      options={[{ value: '',label: inheritLabel },...options]}
      onChange={next => onChange?.(next || null)} />
  </Tooltip>;
};
export default AiReasoningSelect;
