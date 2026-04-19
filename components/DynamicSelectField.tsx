import React, { useMemo, useRef, useState } from 'react';
import { Select, Input, Button, Divider, App, Modal } from 'antd';
import { useEffect } from 'react';
import { PlusOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { replaceDynamicOptionValueAcrossModules } from '../utils/dynamicOptionReplacement';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import {
  buildStandardSelectPopupRootStyle,
  KALAM_SELECT_FIELD_CLASSNAME,
  mergeClassNames,
  resolveSelectPopupContainer,
} from '../utils/popupContainer';

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
  popupStyle?: React.CSSProperties;
  protectedValues?: string[];
  modalZIndex?: number;
}

const normalizeDynamicCompareValue = (value: string) =>
  String(value || '')
    .replace(/\u200c/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const sanitizeDynamicStoredValue = (value: string) =>
  String(value || '')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const mergeDynamicOptions = (...groups: Array<Array<{ label: string; value: string }>>) => {
  const map = new Map<string, { label: string; value: string }>();
  groups.forEach((group) => {
    (group || []).forEach((item) => {
      const value = sanitizeDynamicStoredValue(String(item?.value || ''));
      const label = sanitizeDynamicStoredValue(String(item?.label || value));
      const key = normalizeDynamicCompareValue(value || label);
      if (!key || map.has(key)) return;
      map.set(key, { label: label || value, value: value || label });
    });
  });
  return Array.from(map.values());
};

const loadXlsxModule = () => import('xlsx');

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
  placeholder = 'Select',
  className = 'w-full',
  showSearch = true,
  allowClear = true,
  disabled = false,
  mode = undefined,
  onOptionsUpdate,
  getPopupContainer = () => document.body,
  dropdownStyle,
  popupStyle,
  protectedValues = [],
  modalZIndex = 1110,
}) => {
  const { message: msg } = App.useApp();
  const [newOptionValue, setNewOptionValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingOption, setDeletingOption] = useState<{ label: string; value: string } | null>(null);
  const [replaceWithValue, setReplaceWithValue] = useState('');
  const [localOptions, setLocalOptions] = useState<Array<{ label: string; value: string }>>([]);
  const excelFileInputRef = useRef<HTMLInputElement | null>(null);

  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  const protectedValueSet = useMemo(
    () => new Set((protectedValues || []).map((item) => String(item || '').trim()).filter(Boolean)),
    [protectedValues]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateViewport = () => setIsMobileViewport(window.innerWidth <= 768);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const mergedDropdownStyle: React.CSSProperties = {
    ...buildStandardSelectPopupRootStyle({
      zIndex: 13080,
      minWidth: isMobileViewport ? 180 : 280,
      maxWidth: isMobileViewport ? 'calc(100vw - 24px)' : 520,
    }),
    width: isMobileViewport ? 'min(92vw, 420px)' : undefined,
    overscrollBehavior: 'contain',
    ...dropdownStyle,
    ...popupStyle,
  };

  const resolvedPopupContainer = useMemo(
    () => (trigger: HTMLElement) => {
      const container = getPopupContainer(trigger) || document.body;
      return resolveSelectPopupContainer(container === document.body ? trigger : container);
    },
    [getPopupContainer]
  );

  React.useEffect(() => {
    setLocalOptions([]);
  }, [category]);

  const mergedOptions = useMemo(
    () => mergeDynamicOptions(options || [], localOptions),
    [options, localOptions]
  );

  const normalizedOptions = useMemo(() => {
    const next = Array.isArray(mergedOptions) ? [...mergedOptions] : [];
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
  }, [mergedOptions, value, mode]);

  const replacementCandidates = useMemo(() => {
    const deletingValue = String(deletingOption?.value || '').trim();
    if (!deletingValue) return [];

    return normalizedOptions
      .filter((item) => String(item?.value || '').trim() !== deletingValue)
      .map((item) => ({ label: String(item?.label || item?.value || ''), value: String(item?.value || '') }))
      .filter((item) => item.value);
  }, [deletingOption?.value, normalizedOptions]);

  const handleSelectChange = (nextValue: string | string[] | undefined) => {
    const normalized = normalizeDynamicValueToLabel(nextValue, normalizedOptions, mode);
    onChange?.(normalized as any);
  };

  const appendLocalOption = (option: { label: string; value: string }) => {
    setLocalOptions((prev) => mergeDynamicOptions(prev, [option]));
  };

  const keepDropdownOpenOnMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const interactive = target.closest('input, textarea, button, .ant-input, .ant-btn, .ant-select, .ant-select-selector');
    if (interactive) return;
    event.preventDefault();
  };

  const loadCategoryRows = async () => {
    const { data, error } = await supabase
      .from('dynamic_options')
      .select('id, label, value, is_active')
      .eq('category', category);
    if (error) throw error;
    return (data || []) as Array<{ id: string; label: string | null; value: string | null; is_active: boolean | null }>;
  };

  const applyOptionSelection = (selectedValue: string) => {
    if (!selectedValue) return;
    if (mode === 'multiple') {
      const currentValues = Array.isArray(value) ? value : (value ? [value] : []);
      handleSelectChange([...currentValues, selectedValue]);
      return;
    }
    handleSelectChange(selectedValue);
  };

  const handleAddOption = async () => {
    const trimmedValue = sanitizeDynamicStoredValue(newOptionValue);
    if (!trimmedValue) {
      msg.warning('مقدار گزینه را وارد کنید.');
      return;
    }

    const compareKey = normalizeDynamicCompareValue(trimmedValue);
    const existingLocal = normalizedOptions.find((opt) =>
      normalizeDynamicCompareValue(String(opt?.value || opt?.label || '')) === compareKey
    );
    if (existingLocal) {
      msg.warning('این گزینه قبلا ثبت شده است.');
      applyOptionSelection(String(existingLocal.value || existingLocal.label || trimmedValue));
      return;
    }

    setLoading(true);
    try {
      const existingRows = await loadCategoryRows();
      const existingRow = existingRows.find((row) =>
        normalizeDynamicCompareValue(String(row?.value || row?.label || '')) === compareKey
      );

      if (existingRow) {
        if (!existingRow.is_active) {
          const { error: reactivateError } = await supabase
            .from('dynamic_options')
            .update({
              is_active: true,
              label: sanitizeDynamicStoredValue(String(existingRow.label || trimmedValue)),
            })
            .eq('id', existingRow.id);
          if (reactivateError) throw reactivateError;
        }
        const reusedOption = {
          label: sanitizeDynamicStoredValue(String(existingRow.label || existingRow.value || trimmedValue)),
          value: sanitizeDynamicStoredValue(String(existingRow.value || existingRow.label || trimmedValue)),
        };
        appendLocalOption(reusedOption);
        msg.success(`گزینه «${reusedOption.label}» اضافه شد.`);
        applyOptionSelection(reusedOption.value);
        setNewOptionValue('');
        onOptionsUpdate?.();
        return;
      }

      const { error } = await supabase.from('dynamic_options').insert([
        {
          category,
          label: trimmedValue,
          value: trimmedValue,
          is_active: true,
        },
      ]);

      if (error) throw error;

      appendLocalOption({ label: trimmedValue, value: trimmedValue });
      msg.success(`گزینه «${trimmedValue}» اضافه شد.`);
      applyOptionSelection(trimmedValue);

      setNewOptionValue('');
      onOptionsUpdate?.();
    } catch (error: any) {
      console.error('Error adding option:', error);
      const duplicateError =
        String(error?.code || '') === '23505' ||
        String(error?.message || '').includes('idx_dynamic_options_org_category_value');
      if (duplicateError) {
        try {
          const existingRows = await loadCategoryRows();
          const duplicateRow = existingRows.find((row) =>
            normalizeDynamicCompareValue(String(row?.value || row?.label || '')) === compareKey
          );
          if (duplicateRow) {
            if (!duplicateRow.is_active) {
              await supabase.from('dynamic_options').update({ is_active: true }).eq('id', duplicateRow.id);
            }
            const reusedOption = {
              label: sanitizeDynamicStoredValue(String(duplicateRow.label || duplicateRow.value || trimmedValue)),
              value: sanitizeDynamicStoredValue(String(duplicateRow.value || duplicateRow.label || trimmedValue)),
            };
            appendLocalOption(reusedOption);
            applyOptionSelection(reusedOption.value);
            setNewOptionValue('');
            onOptionsUpdate?.();
            msg.success(`گزینه «${reusedOption.label}» از قبل وجود داشت و اکنون در لیست در دسترس است.`);
            return;
          }
        } catch (lookupError) {
          console.error('Error resolving duplicate dynamic option:', lookupError);
        }
      }
      msg.error(toFaErrorMessage(error, 'افزودن گزینه ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  const openDeleteModal = (option: { label: string; value: string }) => {
    const targetValue = String(option?.value || '').trim();
    if (!targetValue) return;

    if (protectedValueSet.has(targetValue)) {
      msg.warning('این گزینه پیش‌فرض سیستمی است و قابل حذف نیست.');
      return;
    }

    const candidates = normalizedOptions
      .filter((item) => String(item?.value || '').trim() !== targetValue)
      .map((item) => String(item?.value || '').trim())
      .filter(Boolean);

    if (!candidates.length) {
      msg.warning('برای حذف، باید حداقل یک گزینه جایگزین باقی بماند.');
      return;
    }

    setDeletingOption({
      label: String(option.label || targetValue),
      value: targetValue,
    });
    setReplaceWithValue(candidates[0]);
    setDeleteModalOpen(true);
  };

  const replaceCurrentSelection = (fromValue: string, toValue: string) => {
    if (!fromValue || !toValue || fromValue === toValue) return;

    if (mode === 'multiple' || mode === 'tags') {
      const currentValues = Array.isArray(value) ? value.map((item) => String(item || '')) : [];
      if (!currentValues.length) return;

      let touched = false;
      const nextValues = currentValues.map((item) => {
        if (item === fromValue) {
          touched = true;
          return toValue;
        }
        return item;
      });

      if (!touched) return;
      const uniqueNext = Array.from(new Set(nextValues.filter(Boolean)));
      handleSelectChange(uniqueNext);
      return;
    }

    const single = String(value ?? '').trim();
    if (single && single === fromValue) {
      handleSelectChange(toValue);
    }
  };

  const handleDeleteOption = async () => {
    const optionValue = String(deletingOption?.value || '').trim();
    const optionLabel = String(deletingOption?.label || optionValue).trim();
    const replacementValue = String(replaceWithValue || '').trim();

    if (!optionValue || !replacementValue) {
      msg.warning('یک گزینه جایگزین انتخاب کنید.');
      return;
    }

    if (optionValue === replacementValue) {
      msg.warning('گزینه جایگزین باید متفاوت باشد.');
      return;
    }

    setLoading(true);
    try {
      const { updatedRows } = await replaceDynamicOptionValueAcrossModules({
        supabase: supabase as any,
        category,
        oldValue: optionValue,
        newValue: replacementValue,
      });

      const { error } = await supabase
        .from('dynamic_options')
        .delete()
        .eq('category', category)
        .eq('value', optionValue);

      if (error) throw error;

      replaceCurrentSelection(optionValue, replacementValue);
      msg.success(`گزینه «${optionLabel}» حذف شد. ${updatedRows} رکورد بروزرسانی شد.`);

      setDeleteModalOpen(false);
      setDeletingOption(null);
      setReplaceWithValue('');
      onOptionsUpdate?.();
    } catch (error: any) {
      console.error('Error deleting option:', error);
      msg.error(toFaErrorMessage(error, 'حذف گزینه ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  const openExcelPicker = () => {
    if (loading) return;
    excelFileInputRef.current?.click();
  };

  const handleExcelImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await loadXlsxModule();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        msg.warning('فایل اکسل معتبر نیست.');
        return;
      }

      const firstSheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(firstSheet, {
        header: 1,
        blankrows: false,
        defval: '',
      });

      const existingRows = await loadCategoryRows();
      const existingMap = new Map(
        existingRows.map((item) => [
          normalizeDynamicCompareValue(String(item?.value || item?.label || '')),
          item,
        ])
      );
      const importSet = new Set<string>();
      const valuesToInsert: string[] = [];
      const valuesToReactivate: Array<{ id: string; label: string; value: string }> = [];

      let duplicateCount = 0;

      rows.forEach((row) => {
        const rawValue = Array.isArray(row) ? row[0] : '';
        const trimmedValue = String(rawValue ?? '').trim();
        if (!trimmedValue) return;

        const storedValue = sanitizeDynamicStoredValue(trimmedValue);
        const key = normalizeDynamicCompareValue(storedValue);
        if (importSet.has(key)) {
          duplicateCount += 1;
          return;
        }

        const existingRow = existingMap.get(key);
        if (existingRow) {
          if (existingRow.is_active) {
            duplicateCount += 1;
          } else if (existingRow.id) {
            valuesToReactivate.push({
              id: existingRow.id,
              label: sanitizeDynamicStoredValue(String(existingRow.label || existingRow.value || storedValue)),
              value: sanitizeDynamicStoredValue(String(existingRow.value || existingRow.label || storedValue)),
            });
          }
          importSet.add(key);
          return;
        }

        importSet.add(key);
        valuesToInsert.push(storedValue);
      });

      if (!valuesToInsert.length && !valuesToReactivate.length) {
        msg.warning('در ستون اول فایل، مقدار جدیدی برای افزودن پیدا نشد.');
        return;
      }

      const payload = valuesToInsert.map((item) => ({
        category,
        label: item,
        value: item,
        is_active: true,
      }));

      if (valuesToReactivate.length > 0) {
        const { error: reactivateError } = await supabase
          .from('dynamic_options')
          .update({ is_active: true })
          .in('id', valuesToReactivate.map((item) => item.id));
        if (reactivateError) throw reactivateError;
      }

      if (payload.length > 0) {
        const { error } = await supabase.from('dynamic_options').insert(payload);
        if (error) throw error;
      }

      setLocalOptions((prev) =>
        mergeDynamicOptions(
          prev,
          valuesToReactivate,
          valuesToInsert.map((item) => ({ label: item, value: item }))
        )
      );

      onOptionsUpdate?.();

      const extraNotes: string[] = [];
      if (duplicateCount > 0) extraNotes.push(`${duplicateCount} مقدار تکراری نادیده گرفته شد`);
      const extraText = extraNotes.length ? ' (' + extraNotes.join(', ') + ')' : '';
      msg.success(`${valuesToInsert.length + valuesToReactivate.length} مقدار از فایل اکسل وارد شد${extraText}.`);
    } catch (error: any) {
      console.error('Error importing options from excel:', error);
      msg.error(toFaErrorMessage(error, 'ورود از اکسل ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input
        ref={excelFileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleExcelImport}
        style={{ display: 'none' }}
      />

      <Select
        mode={mode}
        value={mode === 'multiple' ? (Array.isArray(value) ? value : (value ? [value] : [])) : value}
        onChange={handleSelectChange as any}
        placeholder={placeholder}
        className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, className)}
        showSearch={showSearch}
        allowClear={allowClear}
        disabled={disabled || loading}
        loading={loading}
        optionFilterProp="label"
        optionLabelProp="label"
        getPopupContainer={resolvedPopupContainer}
        options={normalizedOptions}
        placement={isMobileViewport ? 'bottomLeft' : 'bottomRight'}
        popupMatchSelectWidth={false}
        listHeight={isMobileViewport ? 192 : 320}
        notFoundContent={loading ? 'در حال بارگزاری...' : 'موردی وجود ندارد'}
        styles={{ popup: { root: mergedDropdownStyle } }}
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
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              disabled={protectedValueSet.has(String(option.value || '').trim())}
              onClick={(e) => {
                e.stopPropagation();
                openDeleteModal({
                  label: String(option.label || option.value || ''),
                  value: String(option.value || ''),
                });
              }}
              style={{
                padding: '0 4px',
                marginRight: '8px',
              }}
            />
          </div>
        )}
        popupRender={(menu) => (
          <>
            {menu}
            <Divider style={{ margin: '8px 0' }} />
            <div
              onMouseDown={keepDropdownOpenOnMouseDown}
              style={{
                padding: isMobileViewport ? '8px' : '8px 10px 10px',
                position: 'sticky',
                bottom: 0,
                background: 'inherit',
                zIndex: 1,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input
                  placeholder="افزودن گزینه جدید..."
                  value={newOptionValue}
                  onChange={(e) => setNewOptionValue(e.target.value)}
                  onPressEnter={handleAddOption}
                  disabled={loading}
                  className="w-full"
                  size={isMobileViewport ? 'middle' : undefined}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      width: isMobileViewport ? '100%' : undefined,
                      flexDirection: isMobileViewport ? 'column' : 'row',
                    }}
                  >
                    <Button
                      icon={<UploadOutlined />}
                      onClick={openExcelPicker}
                      disabled={loading}
                      block={isMobileViewport}
                    >
                      افزودن از اکسل
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={handleAddOption}
                      loading={loading}
                      block={isMobileViewport}
                    >
                      افزودن
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      />

      <Modal
        title="حذف گزینه داینامیک"
        open={deleteModalOpen}
        onCancel={() => {
          if (loading) return;
          setDeleteModalOpen(false);
          setDeletingOption(null);
          setReplaceWithValue('');
        }}
        onOk={handleDeleteOption}
        okText="حذف و جایگزینی"
        cancelText="انصراف"
        confirmLoading={loading}
        destroyOnHidden
        zIndex={modalZIndex}
      >
        <div className="space-y-3">
          <div className="text-sm">
            مقدار <span className="font-bold">"{deletingOption?.label || '-'}"</span> در رکوردهای فعلی با این گزینه جایگزین شود:
          </div>
          <Select
            className="w-full"
            value={replaceWithValue || undefined}
            options={replacementCandidates}
            onChange={(val) => setReplaceWithValue(String(val || ''))}
            showSearch
            optionFilterProp="label"
            optionLabelProp="label"
            placeholder="گزینه جایگزین را انتخاب کنید"
            getPopupContainer={() => document.body}
            placement="bottomRight"
            styles={{ popup: { root: { zIndex: modalZIndex + 20 } } }}
          />
        </div>
      </Modal>
    </>
  );
};

export default DynamicSelectField;
