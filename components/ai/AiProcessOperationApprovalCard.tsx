import React from 'react';
import { Checkbox, Empty } from 'antd';

type Props = {
  operations: any[];
  selectedIndexes: number[];
  onChange: (indexes: number[]) => void;
};

const getOperationTitle = (operation: any, index: number) => {
  const type = String(operation?.type || '').trim();
  const name = String(operation?.process_name || operation?.name || operation?.stage?.name || '').trim();
  if (type === 'materialize_template_to_tasks') return `ساخت فعالیت‌ها از الگو${name ? `: ${name}` : ''}`;
  if (type === 'create_raw_process_with_tasks') return `ساخت برنامهٔ محتوا${name ? `: ${name}` : ''}`;
  if (type === 'add_stage_task') return `افزودن فعالیت${name ? `: ${name}` : ''}`;
  if (type === 'update_stage_task') return `ویرایش فعالیت${name ? `: ${name}` : ''}`;
  if (type === 'cancel_stage_task') return `لغو فعالیت${name ? `: ${name}` : ''}`;
  if (type === 'create_content_project') return `ساخت پروژهٔ تقویمی${name ? `: ${name}` : ''}`;
  return `اقدام ${index + 1}`;
};

const getOperationDetails = (operation: any) => {
  const stages = Array.isArray(operation?.stages) ? operation.stages : [];
  const stageNames = stages
    .map((stage: any) => String(stage?.name || stage?.stage_name || '').trim())
    .filter(Boolean);
  if (stageNames.length) return `${stageNames.length.toLocaleString('fa-IR')} فعالیت: ${stageNames.slice(0, 4).join('، ')}${stageNames.length > 4 ? ' و موارد دیگر' : ''}`;
  const templateName = String(operation?.template_name || '').trim();
  return templateName ? `الگو: ${templateName}` : 'قبل از اجرا، این مورد را بررسی و انتخاب کنید.';
};

const AiProcessOperationApprovalCard: React.FC<Props> = ({ operations, selectedIndexes, onChange }) => {
  const selected = new Set(selectedIndexes);
  if (!operations.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="اقدام قابل تأییدی وجود ندارد." />;

  return (
    <div className="mt-2 space-y-2">
      {operations.map((operation, index) => (
        <label key={`${String(operation?.type || 'operation')}-${index}`} className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-100/80 bg-white/70 p-2.5 dark:border-white/10 dark:bg-white/[0.045]">
          <Checkbox
            checked={selected.has(index)}
            onChange={(event) => {
              const next = event.target.checked
                ? Array.from(new Set([...selectedIndexes, index])).sort((left, right) => left - right)
                : selectedIndexes.filter((item) => item !== index);
              onChange(next);
            }}
            aria-label={`انتخاب ${getOperationTitle(operation, index)}`}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-amber-900 dark:text-amber-100">{getOperationTitle(operation, index)}</span>
            <span className="mt-0.5 block text-[11px] leading-5 text-amber-800 dark:text-amber-200/85">{getOperationDetails(operation)}</span>
          </span>
        </label>
      ))}
    </div>
  );
};

export default AiProcessOperationApprovalCard;
