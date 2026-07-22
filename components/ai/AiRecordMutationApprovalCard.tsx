import React, { useMemo, useRef, useState } from 'react';
import { Button, Carousel, Empty, Switch } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import type { ModuleField } from '../../types';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import SmartFieldRenderer from '../SmartFieldRenderer';

export type AiRecordMutationDraft = {
  record_id?: string | null;
  record_title?: string | null;
  /** هر پیش‌نویس در مودال افزودن سریع جداگانه انتخاب و تایید می‌شود. */
  selected?: boolean;
  fields: Record<string, any>;
};

type Props = {
  actionType: 'create_record_from_prompt' | 'update_record_from_prompt';
  moduleId: string;
  schema: any;
  records: AiRecordMutationDraft[];
  onChange: (records: AiRecordMutationDraft[]) => void;
};

const AiRecordMutationApprovalCard: React.FC<Props> = ({
  actionType,
  moduleId,
  schema,
  records,
  onChange,
}) => {
  const carouselRef = useRef<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showOtherFields, setShowOtherFields] = useState<Record<number, boolean>>({});
  const moduleConfig = MODULES[moduleId];

  const editableFields = useMemo(() => {
    const schemaKeys = new Set(
      (Array.isArray(schema?.fields) ? schema.fields : [])
        .map((item: any) => String(item?.key || '').trim())
        .filter(Boolean),
    );
    return (moduleConfig?.fields || [])
      .filter((field: ModuleField) => schemaKeys.has(String(field.key)))
      .map((field: ModuleField) => ({
        ...field,
        labels: {
          ...(field.labels || {}),
          fa: getFieldLabelFa(field, { moduleId }),
        },
      }));
  }, [moduleConfig, moduleId, schema]);

  const updateField = (recordIndex: number, fieldKey: string, value: any) => {
    onChange(records.map((record, index) => index === recordIndex
      ? { ...record, fields: { ...(record.fields || {}), [fieldKey]: value } }
      : record));
  };

  const updateSelection = (recordIndex: number, selected: boolean) => {
    onChange(records.map((record, index) => index === recordIndex
      ? { ...record, selected }
      : record));
  };

  if (!records.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="پیش‌نویس قابل ویرایشی وجود ندارد." />;
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-200/70 bg-white/72 p-2 dark:border-amber-300/15 dark:bg-white/[0.045]">
      {records.length > 1 ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <Button
            type="text"
            size="small"
            icon={<RightOutlined />}
            aria-label="رکورد قبلی"
            disabled={activeIndex === 0}
            onClick={() => carouselRef.current?.prev()}
          />
          <span className="font-semibold text-amber-900 dark:text-amber-100">
            رکورد {(activeIndex + 1).toLocaleString('fa-IR')} از {records.length.toLocaleString('fa-IR')}
          </span>
          <Button
            type="text"
            size="small"
            icon={<LeftOutlined />}
            aria-label="رکورد بعدی"
            disabled={activeIndex >= records.length - 1}
            onClick={() => carouselRef.current?.next()}
          />
        </div>
      ) : null}

      <Carousel ref={carouselRef} dots={records.length > 1} draggable afterChange={setActiveIndex} adaptiveHeight>
        {records.map((record, recordIndex) => {
          const proposedKeys = new Set(Object.keys(record.fields || {}));
          const primaryFields = editableFields.filter((field) => proposedKeys.has(String(field.key)));
          const otherFields = editableFields.filter((field) => !proposedKeys.has(String(field.key)));
          const visibleFields = showOtherFields[recordIndex]
            ? [...primaryFields, ...otherFields]
            : primaryFields;
          const recordTitle = actionType === 'update_record_from_prompt'
            ? String(record.record_title || '').trim() || `رکورد ${(recordIndex + 1).toLocaleString('fa-IR')}`
            : records.length > 1 ? `رکورد ${(recordIndex + 1).toLocaleString('fa-IR')}` : '';
          return (
            <div key={`${record.record_id || 'new'}-${recordIndex}`} className="px-1 pb-4">
              {recordTitle ? (
                <div className="mb-2 rounded-lg bg-amber-50/80 px-2 py-1.5 font-semibold text-amber-900 dark:bg-black/20 dark:text-amber-50">
                  {recordTitle}
                </div>
              ) : null}
              <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-amber-100/80 bg-amber-50/50 px-2 py-1.5 dark:border-white/10 dark:bg-black/15">
                <span className="font-semibold text-amber-900 dark:text-amber-100">
                  {actionType === 'update_record_from_prompt' ? 'این مورد ویرایش شود' : 'این مورد ثبت شود'}
                </span>
                <Switch
                  size="small"
                  checked={record.selected !== false}
                  onChange={(checked) => updateSelection(recordIndex, checked)}
                  aria-label={actionType === 'update_record_from_prompt' ? 'انتخاب برای ویرایش' : 'انتخاب برای ثبت'}
                />
              </div>
              <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
                {visibleFields.map((field) => (
                  <div key={field.key} className="min-w-0 [&_.ant-form-item]:mb-2 [&_.ant-form-item-label]:pb-0.5">
                    <SmartFieldRenderer
                      field={field}
                      value={record.fields?.[field.key]}
                      onChange={(value) => updateField(recordIndex, String(field.key), value)}
                      forceEditMode
                      compactMode
                      disableRequired
                      moduleId={moduleId}
                      allValues={record.fields || {}}
                      recordId={actionType === 'update_record_from_prompt' ? record.record_id || undefined : undefined}
                      overlayZIndexBase={32000}
                    />
                  </div>
                ))}
              </div>
              {otherFields.length > 0 ? (
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-amber-100/80 pt-2 dark:border-white/10">
                  <span className="font-semibold text-amber-900 dark:text-amber-100">مشاهده دیگر فیلدها</span>
                  <Switch
                    size="small"
                    checked={showOtherFields[recordIndex] === true}
                    onChange={(checked) => setShowOtherFields((prev) => ({ ...prev, [recordIndex]: checked }))}
                    aria-label="مشاهده دیگر فیلدها"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </Carousel>
    </div>
  );
};

export default AiRecordMutationApprovalCard;
