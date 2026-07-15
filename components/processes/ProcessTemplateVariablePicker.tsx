import React, { memo, useMemo, useState } from 'react';
import { Button, Modal, Tooltip } from 'antd';
import { CopyOutlined, SnippetsOutlined } from '@ant-design/icons';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { buildStandardSelectPopupRootStyle } from '../../utils/popupContainer';

export type ProcessTemplateVariableOption = {
  key: string;
  label: string;
  token: string;
};

type ProcessTemplateVariablePickerProps = {
  options: ProcessTemplateVariableOption[];
  targetLabel: string;
  onInsert: (token: string) => void;
  disabled?: boolean;
};

export const copyProcessTemplateToken = async (token: string) => {
  const text = String(token || '').trim();
  if (!text) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fallback below
  }
  if (typeof document === 'undefined') return;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

export const appendProcessTemplateToken = (value: string, token: string) => {
  const current = String(value || '');
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return current;
  if (!current) return normalizedToken;
  return `${current}${/\s$/.test(current) ? '' : ' '}${normalizedToken}`;
};

const ProcessTemplateVariablePicker: React.FC<ProcessTemplateVariablePickerProps> = ({
  options,
  targetLabel,
  onInsert,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>();
  const optionMap = useMemo(
    () => new Map(options.map((item) => [item.key, item] as const)),
    [options],
  );
  const selected = optionMap.get(String(selectedKey || ''));
  const triggerLabel = `نمایش متغیرهای قابل جایگذاری در ${targetLabel}`;

  return (
    <>
      <Tooltip title={triggerLabel}>
        <Button
          type="text"
          size="small"
          shape="circle"
          disabled={disabled || options.length === 0}
          icon={<CopyOutlined />}
          aria-label={triggerLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          className="!inline-flex !items-center !justify-center !text-slate-500 hover:!bg-slate-100 dark:!text-slate-300 dark:hover:!bg-white/10"
        />
      </Tooltip>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={560}
        centered
        destroyOnHidden={false}
        zIndex={32010}
        title={`انتخاب متغیر برای ${targetLabel}`}
        styles={{ body: { paddingTop: 12 } }}
      >
        <div className="space-y-3" dir="rtl">
          <AdaptiveSelectField
            allowClear
            showSearch
            value={selectedKey}
            options={options.map((item) => ({
              value: item.key,
              label: item.label,
              token: item.token,
              searchText: `${item.label} ${item.token} ${item.key}`,
            }))}
            placeholder="جستجو و انتخاب متغیر"
            pickerTitle="انتخاب متغیر"
            optionFilterProp="searchText"
            popupStyle={buildStandardSelectPopupRootStyle({ zIndex: 32020, maxWidth: 'calc(100vw - 1rem)' })}
            optionRender={(option) => {
              const data = option?.data ?? option;
              return (
                <div className="min-w-0 py-1 text-right">
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{String(data?.label || '')}</div>
                  <div className="mt-0.5 break-all text-[11px] text-gray-500 dark:text-gray-400" dir="ltr">
                    {String(data?.token || '')}
                  </div>
                </div>
              );
            }}
            onChange={(nextValue) => setSelectedKey(String(nextValue || '').trim() || undefined)}
            notFoundContent="متغیری در دسترس نیست."
          />
          <div className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400" dir="ltr">
            {selected?.token || '{{...}}'}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              size="middle"
              icon={<CopyOutlined />}
              disabled={!selected}
              onClick={() => selected && void copyProcessTemplateToken(selected.token)}
            >
              کپی
            </Button>
            <Button
              type="primary"
              size="middle"
              icon={<SnippetsOutlined />}
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onInsert(selected.token);
                setOpen(false);
                void copyProcessTemplateToken(selected.token);
              }}
            >
              درج در نام
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default memo(ProcessTemplateVariablePicker);
