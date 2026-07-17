import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Tag } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import AdaptivePickerSurface from './AdaptivePickerSurface';
import {
  AdaptivePickerMode,
  buildStandardSelectPopupRootStyle,
  KALAM_SELECT_FIELD_CLASSNAME,
  mergeClassNames,
  resolveAdaptivePickerMode,
  resolveSelectPopupContainer,
} from '../utils/popupContainer';

type OptionLike = {
  label?: React.ReactNode;
  value?: string | number | null;
  disabled?: boolean;
  options?: OptionLike[];
  [key: string]: any;
};

interface AdaptiveSelectFieldProps {
  value?: any;
  onChange?: (value: any) => void;
  options?: OptionLike[];
  mode?: 'multiple' | 'tags';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  tokenSeparators?: string[];
  showSearch?: boolean;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
  modalContainer?: (trigger?: HTMLElement | null) => HTMLElement;
  popupStyle?: React.CSSProperties;
  overlayZIndexBase?: number;
  adaptiveMode?: AdaptivePickerMode;
  pickerTitle?: string;
  sheetSubtitle?: string;
  notFoundContent?: React.ReactNode;
  optionFilterProp?: string;
  optionLabelProp?: string;
  filterOption?: ((input: string, option?: any) => boolean) | boolean;
  onSearch?: (value: string) => void;
  searchValue?: string;
  onOpenChange?: (open: boolean) => void;
  listHeight?: number;
  placement?: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
  popupMatchSelectWidth?: boolean;
  optionRender?: (option: any) => React.ReactNode;
  popupRender?: (menu: React.ReactNode) => React.ReactNode;
  sheetToolbar?: React.ReactNode;
  renderMobileOption?: (option: OptionLike, selected: boolean) => React.ReactNode;
  mobileSearchPlaceholder?: string;
  optionDisplayFallback?: (option: OptionLike) => string;
  renderTriggerValue?: (options: OptionLike[]) => React.ReactNode;
  renderSelectedTag?: (option: OptionLike) => React.ReactNode;
  closeMobileOnToolbarClick?: boolean;
  styles?: any;
  preferLocalPopupContainer?: boolean;
  [key: string]: any;
}

const normalizeScalar = (value: any) => String(value ?? '').trim();

const normalizeArray = (value: any) =>
  Array.isArray(value) ? value.map((item) => normalizeScalar(item)).filter(Boolean) : [];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitFreeformValues = (value: string, separators: string[]) => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return [];
  const effectiveSeparators = (Array.isArray(separators) ? separators : [])
    .map((item) => String(item || ''))
    .filter(Boolean);
  if (effectiveSeparators.length === 0) return [normalizedValue];
  const pattern = new RegExp(`[${effectiveSeparators.map(escapeRegExp).join('')}]`, 'g');
  return normalizedValue
    .split(pattern)
    .map((item) => item.trim())
    .filter(Boolean);
};

const defaultOptionLabel = (option: OptionLike) => {
  const raw = option?.label ?? option?.value ?? '';
  return typeof raw === 'string' ? raw : String(raw ?? '');
};

const AdaptiveSelectField: React.FC<AdaptiveSelectFieldProps> = ({
  value,
  onChange,
  options = [],
  mode,
  className,
  disabled = false,
  loading = false,
  placeholder = 'انتخاب کنید',
  allowClear = true,
  tokenSeparators,
  showSearch = true,
  getPopupContainer = resolveSelectPopupContainer,
  modalContainer,
  popupStyle,
  overlayZIndexBase = 1400,
  adaptiveMode = 'auto',
  pickerTitle,
  sheetSubtitle,
  notFoundContent = 'موردی یافت نشد',
  optionFilterProp = 'label',
  optionLabelProp = 'label',
  filterOption,
  onSearch,
  searchValue,
  onOpenChange,
  listHeight = 320,
  placement = 'bottomRight',
  popupMatchSelectWidth = false,
  optionRender,
  popupRender,
  sheetToolbar,
  renderMobileOption,
  mobileSearchPlaceholder = 'جستجو...',
  optionDisplayFallback = defaultOptionLabel,
  renderTriggerValue,
  renderSelectedTag,
  closeMobileOnToolbarClick = false,
  styles,
  preferLocalPopupContainer = false,
  ...restProps
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState('');
  const [draftValue, setDraftValue] = useState<any>(mode === 'multiple' || mode === 'tags' ? [] : undefined);
  const [displayValue, setDisplayValue] = useState<any>(value);
  const resolvedMode = resolveAdaptivePickerMode(adaptiveMode);
  const mobileSheetMode = resolvedMode === 'mobile-sheet';

  const normalizedOptions = useMemo(() => Array.isArray(options) ? options : [], [options]);
  const flatOptions = useMemo(
    () => normalizedOptions.flatMap((option) =>
      Array.isArray(option?.options)
        ? option.options.map((child) => ({ ...child, __groupLabel: option.label }))
        : [option]
    ),
    [normalizedOptions]
  );
  const optionMap = useMemo(() => {
    const map = new Map<string, OptionLike>();
    flatOptions.forEach((option) => {
      const key = normalizeScalar(option?.value);
      if (!key) return;
      map.set(key, option);
    });
    return map;
  }, [flatOptions]);

  const currentSearch = searchValue ?? internalSearch;
  const isMulti = mode === 'multiple' || mode === 'tags';
  const selectedValues = useMemo(
    () => (isMulti ? normalizeArray(displayValue) : [normalizeScalar(displayValue)].filter(Boolean)),
    [displayValue, isMulti]
  );

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  useEffect(() => {
    if (!mobileOpen) return;
    setDraftValue(isMulti ? normalizeArray(displayValue) : (displayValue ?? undefined));
    setInternalSearch(searchValue ?? '');
  }, [displayValue, isMulti, mobileOpen, searchValue]);

  const filteredOptions = useMemo(() => {
    if (!mobileSheetMode) return flatOptions;
    const term = String(currentSearch || '').trim().toLowerCase();
    if (!term) return flatOptions;
    if (typeof filterOption === 'function') {
      return flatOptions.filter((option) => filterOption(term, { ...option, label: option?.label, value: option?.value }));
    }
    if (filterOption === false) return flatOptions;
    return flatOptions.filter((option) => {
      const haystack = [
        option?.[optionFilterProp],
        option?.label,
        option?.value,
        option?.searchText,
      ]
        .map((item) => String(item ?? '').toLowerCase())
        .join(' ');
      return haystack.includes(term);
    });
  }, [currentSearch, filterOption, flatOptions, mobileSheetMode, optionFilterProp]);

  const displayText = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    const labels = selectedValues
      .map((item) => {
        const option = optionMap.get(item);
        return option ? optionDisplayFallback(option) : item;
      })
      .filter(Boolean);
    return labels.join('، ');
  }, [optionDisplayFallback, optionMap, placeholder, selectedValues]);
  const selectedOptionRows = useMemo(
    () => selectedValues.map((item) => optionMap.get(item)).filter(Boolean) as OptionLike[],
    [optionMap, selectedValues]
  );
  const comfortableMobileTrigger = mobileSheetMode
    && selectedValues.length > 0
    && (selectedValues.length > 1 || String(displayText || '').trim().length >= 18);

  const commitValue = () => {
    setDisplayValue(draftValue);
    onChange?.(draftValue);
    setMobileOpen(false);
    onOpenChange?.(false);
  };

  const handleDesktopChange = (nextValue: any) => {
    setDisplayValue(nextValue);
    onChange?.(nextValue);
  };

  const clearValue = () => {
    const nextValue = isMulti ? [] : undefined;
    setDraftValue(nextValue);
    setDisplayValue(nextValue);
    onChange?.(nextValue);
    setMobileOpen(false);
    onOpenChange?.(false);
  };

  const appendDraftTagValues = (inputValue: string) => {
    if (mode !== 'tags') return;
    const nextTokens = splitFreeformValues(inputValue, tokenSeparators || []);
    if (nextTokens.length === 0) return;
    const nextValue = Array.from(new Set([
      ...normalizeArray(draftValue),
      ...nextTokens,
    ]));
    setDraftValue(nextValue);
    if (searchValue === undefined) {
      setInternalSearch('');
    }
    onSearch?.('');
  };

  const toggleDraftValue = (option: OptionLike) => {
    if (option?.disabled) return;
    const optionValue = normalizeScalar(option?.value);
    if (!optionValue) return;
    if (isMulti) {
      const currentValues = normalizeArray(draftValue);
      const nextValues = currentValues.includes(optionValue)
        ? currentValues.filter((item) => item !== optionValue)
        : [...currentValues, optionValue];
      setDraftValue(nextValues);
      return;
    }
    setDraftValue(option.value);
    setDisplayValue(option.value);
    onChange?.(option.value);
    setMobileOpen(false);
    onOpenChange?.(false);
  };

  if (!mobileSheetMode) {
    const resolvePopupHost = (trigger: HTMLElement) => {
      if (preferLocalPopupContainer) {
        const resolved = getPopupContainer(trigger);
        if (resolved && resolved !== document.body) {
          return resolved;
        }
      }
      return resolveSelectPopupContainer(trigger);
    };
    return (
      <Select
        value={displayValue}
        onChange={handleDesktopChange}
        options={normalizedOptions as any}
        mode={mode}
        tokenSeparators={tokenSeparators}
        className={mergeClassNames(KALAM_SELECT_FIELD_CLASSNAME, className)}
        disabled={disabled}
        loading={loading}
        placeholder={placeholder}
        allowClear={allowClear}
        showSearch={showSearch}
        getPopupContainer={resolvePopupHost}
        optionFilterProp={optionFilterProp}
        optionLabelProp={optionLabelProp}
        filterOption={filterOption}
        onSearch={onSearch}
        searchValue={searchValue}
        onOpenChange={onOpenChange}
        listHeight={listHeight}
        placement={placement}
        popupMatchSelectWidth={popupMatchSelectWidth}
        optionRender={optionRender}
        popupRender={popupRender as any}
        labelRender={renderTriggerValue ? (() => renderTriggerValue(selectedOptionRows)) : undefined}
        tagRender={renderSelectedTag ? ((tagProps: any) => {
          const option = optionMap.get(normalizeScalar(tagProps?.value));
          return (
            <Tag
              closable={tagProps?.closable}
              onClose={tagProps?.onClose}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              className="inline-flex max-w-full items-center"
            >
              {option ? renderSelectedTag(option) : tagProps?.label}
            </Tag>
          );
        }) : undefined}
        styles={{
          popup: {
            root: {
              ...buildStandardSelectPopupRootStyle({ zIndex: overlayZIndexBase, minWidth: 220 }),
              ...popupStyle,
              ...(styles?.popup?.root || {}),
            },
          },
        }}
        {...restProps}
      />
    );
  }

  const draftSelectedValues = isMulti ? normalizeArray(draftValue) : [normalizeScalar(draftValue)].filter(Boolean);

  return (
    <>
      <button
        type="button"
        className={mergeClassNames(
          'kalam-adaptive-picker__trigger',
          comfortableMobileTrigger && 'kalam-adaptive-picker__trigger--comfortable',
          className
        )}
        disabled={disabled}
        aria-label={pickerTitle || placeholder}
        onClick={() => {
          if (disabled) return;
          setMobileOpen(true);
          onOpenChange?.(true);
        }}
      >
        <span
          className={mergeClassNames(
            'kalam-adaptive-picker__trigger-text',
            selectedValues.length > 0 && 'is-filled',
            comfortableMobileTrigger && 'is-comfortable'
          )}
        >
          {selectedOptionRows.length > 0 && renderTriggerValue
            ? renderTriggerValue(selectedOptionRows)
            : displayText}
        </span>
        <span className="kalam-adaptive-picker__trigger-icon">
          <DownOutlined />
        </span>
      </button>

      <AdaptivePickerSurface
        open={mobileOpen}
        title={pickerTitle || placeholder}
        subtitle={sheetSubtitle}
        zIndex={overlayZIndexBase + 40}
        modalContainer={modalContainer || ((trigger) => {
          if (trigger) {
            const resolved = getPopupContainer(trigger);
            if (resolved && resolved !== document.body) {
              return resolved;
            }
          }
          return resolveSelectPopupContainer(trigger || undefined);
        })}
        onClose={() => {
          setMobileOpen(false);
          onOpenChange?.(false);
        }}
        onConfirm={isMulti ? commitValue : undefined}
        onClear={allowClear ? clearValue : undefined}
        confirmLabel={isMulti ? 'ثبت انتخاب‌ها' : 'تایید'}
      >
        {showSearch ? (
          <div className="flex items-center gap-2">
            <Input
              value={currentSearch}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (searchValue === undefined) {
                  setInternalSearch(nextValue);
                }
                onSearch?.(nextValue);
              }}
              onPressEnter={(event) => {
                if (mode !== 'tags') return;
                event.preventDefault();
                appendDraftTagValues(currentSearch);
              }}
              placeholder={mobileSearchPlaceholder}
              className="kalam-adaptive-picker__search"
              allowClear
            />
            {mode === 'tags' ? (
              <Button
                type="default"
                disabled={!String(currentSearch || '').trim()}
                onClick={() => appendDraftTagValues(currentSearch)}
              >
                افزودن
              </Button>
            ) : null}
          </div>
        ) : null}
        {sheetToolbar ? (
          <div
            className="kalam-adaptive-picker__toolbar"
            onClick={() => {
              if (!closeMobileOnToolbarClick) return;
              setMobileOpen(false);
              onOpenChange?.(false);
            }}
          >
            {sheetToolbar}
          </div>
        ) : null}
        {isMulti && draftSelectedValues.length > 0 ? (
          <div className="kalam-adaptive-picker__selected-tags">
            {draftSelectedValues.map((item) => (
              <Tag key={item} className="kalam-adaptive-picker__tag">
                {renderSelectedTag
                  ? renderSelectedTag(optionMap.get(item) || { value: item })
                  : optionDisplayFallback(optionMap.get(item) || { value: item })}
              </Tag>
            ))}
          </div>
        ) : null}
        <div className="kalam-adaptive-picker__options">
          {loading ? (
            <div className="kalam-adaptive-picker__empty">در حال بارگذاری...</div>
          ) : filteredOptions.length === 0 ? (
            <div className="kalam-adaptive-picker__empty">{notFoundContent}</div>
          ) : (
            filteredOptions.map((option, optionIndex) => {
              const optionValue = normalizeScalar(option?.value);
              const selected = draftSelectedValues.includes(optionValue);
              const groupLabel = option?.__groupLabel;
              const previousGroupLabel = optionIndex > 0 ? filteredOptions[optionIndex - 1]?.__groupLabel : undefined;
              return (
                <React.Fragment key={optionValue || optionDisplayFallback(option)}>
                  {groupLabel && groupLabel !== previousGroupLabel ? (
                    <div className="px-2 pb-1 pt-3 text-xs font-bold text-gray-500 dark:text-gray-400">
                      {groupLabel}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className={`kalam-adaptive-picker__option ${selected ? 'is-selected' : ''}`}
                    disabled={option?.disabled}
                    onClick={() => toggleDraftValue(option)}
                  >
                    <span className="kalam-adaptive-picker__option-main">
                      {renderMobileOption ? renderMobileOption(option, selected) : optionDisplayFallback(option)}
                    </span>
                    {selected ? <span className="kalam-adaptive-picker__option-check">انتخاب شد</span> : null}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </AdaptivePickerSurface>
    </>
  );
};

export default AdaptiveSelectField;
