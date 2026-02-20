import React, { useMemo, useState } from 'react';
import { Select, Input, Button, Popconfirm, Divider, App } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';

interface DynamicSelectFieldProps {
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  options: Array<{ label: string; value: string }>;
  category: string;
  placeholder?: string;
  className?: string;
  showSearch?: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  mode?: 'multiple' | 'tags';
  onOptionsUpdate?: () => void;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
  dropdownStyle?: React.CSSProperties;
}

const containsLatinChars = (value: string) => /[A-Za-z]/.test(value);

const normalizeDynamicValueToLabel = (
  input: string | string[] | undefined,
  options: Array<{ label: string; value: string }>,
  mode?: 'multiple' | 'tags'
): string | string[] | undefined => {
  if (input === undefined) return undefined;

  const map = new Map<string, string>();
  (options || []).forEach((opt) => {
    const key = String(opt?.value ?? '');
    const label = String(opt?.label ?? key);
    if (!key) return;
    map.set(key, label);
  });

  if (mode === 'multiple' || mode === 'tags') {
    const arr = Array.isArray(input) ? input : [input];
    return arr.map((val) => {
      const normalized = String(val ?? '');
      return map.get(normalized) || normalized;
    });
  }

  const normalized = String(input ?? '');
  return map.get(normalized) || normalized;
};

const DynamicSelectField: React.FC<DynamicSelectFieldProps> = ({
  value,
  onChange,
  options,
  category,
  placeholder = 'انتخاب کنید',
  className = 'w-full',
  showSearch = true,
  allowClear = true,
  disabled = false,
  mode = undefined,
  onOptionsUpdate,
  getPopupContainer = () => document.body,
  dropdownStyle,
}) => {
  const { message: msg } = App.useApp();
  const [newOptionValue, setNewOptionValue] = useState('');
  const [loading, setLoading] = useState(false);
  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
  const mergedDropdownStyle: React.CSSProperties = {
    minWidth: isMobileViewport ? 220 : 280,
    maxWidth: isMobileViewport ? '92vw' : 520,
    width: isMobileViewport ? '92vw' : undefined,
    ...dropdownStyle,
  };

  const normalizedOptions = useMemo(() => {
    const next = Array.isArray(options) ? [...options] : [];
    const currentValues = mode === 'multiple'
      ? (Array.isArray(value) ? value : [])
      : (value ? [value] : []);

    currentValues.forEach((val) => {
      if (val === undefined || val === null || val === '') return;
      const exists = next.some((opt) => String(opt.value) === String(val));
      if (!exists) {
        next.unshift({ label: String(val), value: String(val) });
      }
    });
    return next;
  }, [options, value, mode]);

  const handleSelectChange = (nextValue: string | string[] | undefined) => {
    const normalized = normalizeDynamicValueToLabel(nextValue, normalizedOptions, mode);
    onChange?.(normalized as any);
  };

  const handleAddOption = async () => {
    const trimmedValue = newOptionValue.trim();
    if (!trimmedValue) {
      msg.warning('لطفاً مقدار گزینه را وارد کنید');
      return;
    }
    if (containsLatinChars(trimmedValue)) {
      msg.warning('مقدار گزینه باید فارسی باشد.');
      return;
    }

    if (normalizedOptions.find(opt => String(opt.value).trim().toLowerCase() === trimmedValue.toLowerCase())) {
      msg.warning('این گزینه قبلاً وجود دارد');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('dynamic_options').insert([{
        category,
        label: trimmedValue,
        value: trimmedValue,
        is_active: true,
      }]);

      if (error) throw error;

      msg.success(`گزینه "${trimmedValue}" اضافه شد`);

      if (mode === 'multiple') {
        const currentValues = Array.isArray(value) ? value : (value ? [value] : []);
        handleSelectChange([...currentValues, trimmedValue]);
      } else {
        handleSelectChange(trimmedValue);
      }

      setNewOptionValue('');
      onOptionsUpdate?.();
    } catch (error: any) {
      console.error('Error adding option:', error);
      msg.error('خطا در افزودن گزینه: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOption = async (optionValue: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('dynamic_options')
        .delete()
        .eq('category', category)
        .eq('value', optionValue);

      if (error) throw error;

      msg.success('گزینه حذف شد');

      if (value === optionValue) {
        handleSelectChange(undefined as any);
      }

      onOptionsUpdate?.();
    } catch (error: any) {
      console.error('Error deleting option:', error);
      msg.error('خطا در حذف گزینه: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select
      mode={mode}
      value={mode === 'multiple' ? (Array.isArray(value) ? value : (value ? [value] : [])) : value}
      onChange={handleSelectChange as any}
      placeholder={placeholder}
      className={className}
      showSearch={showSearch}
      allowClear={allowClear}
      disabled={disabled || loading}
      loading={loading}
      optionFilterProp="label"
      getPopupContainer={getPopupContainer}
      options={normalizedOptions}
      popupMatchSelectWidth={isMobileViewport}
      notFoundContent={loading ? 'در حال بارگذاری...' : 'موردی یافت نشد'}
      dropdownStyle={mergedDropdownStyle}
      optionRender={(option) => (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <span>{option.label}</span>
          <Popconfirm
            title="حذف گزینه"
            description={`آیا از حذف "${option.label}" مطمئن هستید؟`}
            onConfirm={(e) => {
              e?.stopPropagation();
              handleDeleteOption(option.value as string);
            }}
            onCancel={(e) => e?.stopPropagation()}
            okText="بله، حذف شود"
            cancelText="خیر"
            placement="left"
            zIndex={9999}
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              onClick={(e) => {
                e.stopPropagation();
              }}
              style={{
                padding: '0 4px',
                marginRight: '8px',
              }}
            />
          </Popconfirm>
        </div>
      )}
      dropdownRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ padding: '8px 10px 10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input
                placeholder="افزودن گزینه جدید..."
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                onPressEnter={handleAddOption}
                disabled={loading}
                className="w-full"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddOption}
                  loading={loading}
                >
                  افزودن
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    />
  );
};

export default DynamicSelectField;
