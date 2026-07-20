import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import AdaptiveSelectField from './AdaptiveSelectField';
import IdentityAvatar from './common/IdentityAvatar';
import { supabase } from '../supabaseClient';
import {
  buildUnavailableIdentityOption,
  normalizeIdentityTokens,
  parseIdentityToken,
  searchIdentityOptions,
  type IdentityKind,
  type IdentityOption,
  type IdentityToken,
} from '../utils/identityDirectory';
import { toFaErrorMessage } from '../utils/errorMessageFa';

type AdaptiveIdentityPickerProps = {
  value?: string | string[] | null;
  onChange?: (value: string | string[] | undefined, options: IdentityOption[]) => void;
  scopes?: IdentityKind[];
  mode?: 'multiple';
  valueMode?: 'token' | 'raw';
  className?: string;
  disabled?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  pickerTitle?: string;
  excludeIds?: string[];
  additionalOptions?: IdentityOption[];
  onLoadError?: (message: string) => void;
  variant?: 'outlined' | 'borderless' | 'filled';
  adaptiveMode?: 'auto' | 'desktop' | 'mobile-sheet';
  overlayZIndexBase?: number;
  [key: string]: any;
};

const SCOPE_LABELS: Record<IdentityKind, string> = {
  user: 'افراد',
  role: 'نقش‌ها',
  chat_group: 'گروه‌های داخلی',
};

const PAGE_SIZE = 50;
const DEFAULT_SCOPES: IdentityKind[] = ['user', 'role'];
const EMPTY_IDENTITY_OPTIONS: IdentityOption[] = [];

const AdaptiveIdentityPicker: React.FC<AdaptiveIdentityPickerProps> = ({
  value,
  onChange,
  scopes = DEFAULT_SCOPES,
  mode,
  valueMode = 'token',
  className,
  disabled,
  allowClear = true,
  placeholder = 'انتخاب کاربر یا نقش',
  pickerTitle = 'انتخاب از فهرست سازمان',
  excludeIds = [],
  additionalOptions = EMPTY_IDENTITY_OPTIONS,
  onLoadError,
  ...restProps
}) => {
  // بسیاری از فرم‌ها scopes را به‌شکل literal می‌فرستند. وابستگی مستقیم به
  // آرایه، هنگام هر render یک واکشی تازه و لغو پاسخ قبلی ایجاد می‌کرد.
  const scopesKey = (Array.isArray(scopes) ? scopes : DEFAULT_SCOPES).join('|');
  const normalizedScopes = useMemo(
    () => Array.from(new Set((Array.isArray(scopes) ? scopes : DEFAULT_SCOPES))),
    [scopesKey],
  );
  const fallbackKind = normalizedScopes.length === 1 ? normalizedScopes[0] : null;
  const [legacyTokenByRaw, setLegacyTokenByRaw] = useState<Record<string, IdentityToken>>({});
  const rawInputValues = useMemo(
    () => (Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
    [value]
  );
  const selectedTokens = useMemo(
    () => Array.from(new Set(rawInputValues.map((item) => {
      const parsed = parseIdentityToken(item, valueMode === 'raw' ? fallbackKind : null);
      if (parsed.token) return parsed.token;
      return legacyTokenByRaw[item] || (fallbackKind ? `${fallbackKind}:${item}` : `user:${item}`);
    }))) as IdentityToken[],
    [fallbackKind, legacyTokenByRaw, rawInputValues, valueMode]
  );
  const [itemsByToken, setItemsByToken] = useState<Map<string, IdentityOption>>(new Map());
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [totalByKind, setTotalByKind] = useState<Partial<Record<IdentityKind, number>>>({});
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const mergeItems = useCallback((items: IdentityOption[], replaceSearchPage = false) => {
    setItemsByToken((current) => {
      const next = replaceSearchPage
        ? new Map(Array.from(current.entries()).filter(([token]) => selectedTokens.includes(token as IdentityToken)))
        : new Map(current);
      items.forEach((item) => next.set(item.token, item));
      selectedTokens.forEach((token) => {
        if (!next.has(token)) next.set(token, buildUnavailableIdentityOption(token));
      });
      return next;
    });
  }, [selectedTokens]);

  useEffect(() => {
    if (additionalOptions.length > 0) mergeItems(additionalOptions);
  }, [additionalOptions, mergeItems]);

  useEffect(() => {
    if (selectedTokens.length === 0 && rawInputValues.length === 0) return;
    let cancelled = false;
    const exactCandidates = Array.from(new Set([
      ...selectedTokens,
      ...rawInputValues.flatMap((item) => {
        const parsed = parseIdentityToken(item);
        if (parsed.token) return [parsed.token];
        return normalizedScopes.map((kind) => `${kind}:${item}` as IdentityToken);
      }),
    ]));
    void searchIdentityOptions(supabase, { scopes: normalizedScopes, exactTokens: exactCandidates })
      .then((result) => {
        if (cancelled) return;
        const hydrated = new Map(result.items.map((item) => [item.token, item]));
        const legacyResolution: Record<string, IdentityToken> = {};
        rawInputValues.forEach((item) => {
          if (parseIdentityToken(item).token) return;
          const resolved = normalizedScopes
            .map((kind) => `${kind}:${item}` as IdentityToken)
            .find((token) => hydrated.has(token));
          if (resolved) legacyResolution[item] = resolved;
        });
        if (Object.keys(legacyResolution).length > 0) {
          setLegacyTokenByRaw((current) => {
            const changed = Object.entries(legacyResolution).some(([raw, token]) => current[raw] !== token);
            return changed ? { ...current, ...legacyResolution } : current;
          });
        }
        const effectiveTokens = selectedTokens.map((token) => {
          const rawId = parseIdentityToken(token).id || '';
          return legacyResolution[rawId] || token;
        });
        mergeItems(effectiveTokens.map((token) => hydrated.get(token) || buildUnavailableIdentityOption(token)));
      })
      .catch((error) => {
        if (!cancelled) onLoadError?.(toFaErrorMessage(error, 'خواندن مقدار انتخاب‌شده ناموفق بود.'));
      });
    return () => { cancelled = true; };
  }, [mergeItems, normalizedScopes, onLoadError, rawInputValues, selectedTokens]);

  const loadPage = useCallback(async (nextOffset: number, append: boolean) => {
    const generation = ++requestGenerationRef.current;
    setLoading(true);
    try {
      const result = await searchIdentityOptions(supabase, {
        scopes: normalizedScopes,
        query: debouncedQuery,
        limitPerScope: PAGE_SIZE,
        offset: nextOffset,
      });
      if (generation !== requestGenerationRef.current) return;
      mergeItems(result.items, !append);
      setTotalByKind(result.totalByKind);
      setOffset(nextOffset);
    } catch (error) {
      if (generation === requestGenerationRef.current) {
        onLoadError?.(toFaErrorMessage(error as any, 'خواندن فهرست کاربران و نقش‌ها ناموفق بود.'));
      }
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  }, [debouncedQuery, mergeItems, normalizedScopes, onLoadError]);

  useEffect(() => {
    if (!open) return;
    void loadPage(0, false);
  }, [debouncedQuery, loadPage, open]);

  const excluded = useMemo(() => new Set(excludeIds.map(String)), [excludeIds]);
  const availableItems = useMemo(
    () => Array.from(new Map([
      ...Array.from(itemsByToken.entries()),
      ...additionalOptions.map((item) => [item.token, item] as const),
    ]).values()).filter((item) => !excluded.has(item.id)),
    [additionalOptions, excluded, itemsByToken]
  );
  const selectedOptionRows = useMemo(
    () => {
      const extras = new Map(additionalOptions.map((item) => [item.token, item]));
      return selectedTokens.map((token) => extras.get(token) || itemsByToken.get(token) || buildUnavailableIdentityOption(token));
    },
    [additionalOptions, itemsByToken, selectedTokens]
  );
  const groupOptions = useMemo(
    () => normalizedScopes.map((kind) => ({
      label: SCOPE_LABELS[kind],
      options: availableItems
        .filter((item) => item.kind === kind)
        .map((item) => ({
          label: item.label,
          value: item.token,
          disabled: item.disabled,
          searchText: item.searchText || `${item.label} ${item.subtitle || ''}`,
          identity: item,
        })),
    })).filter((group) => group.options.length > 0),
    [availableItems, normalizedScopes]
  );
  const loadedCountByKind = useMemo(() => {
    const counts: Partial<Record<IdentityKind, number>> = {};
    availableItems.forEach((item) => { if (!item.disabled) counts[item.kind] = (counts[item.kind] || 0) + 1; });
    return counts;
  }, [availableItems]);
  const hasMore = normalizedScopes.some((kind) => (loadedCountByKind[kind] || 0) < (totalByKind[kind] || 0));

  const emitChange = (nextValue: any) => {
    const tokens = normalizeIdentityTokens(nextValue, fallbackKind);
    const extras = new Map(additionalOptions.map((item) => [item.token, item]));
    const resolved = tokens.map((token) => extras.get(token) || itemsByToken.get(token) || buildUnavailableIdentityOption(token));
    if (valueMode === 'raw') {
      const raw = tokens.map((token) => parseIdentityToken(token).id).filter(Boolean) as string[];
      onChange?.(mode === 'multiple' ? raw : raw[0], resolved);
      return;
    }
    onChange?.(mode === 'multiple' ? tokens : tokens[0], resolved);
  };

  const renderIdentityOption = (rawOption: any) => {
    const item = rawOption?.data?.identity || rawOption?.identity;
    if (!item) return rawOption?.label || '';
    return (
      <div className="flex min-w-0 items-center gap-2 py-0.5" dir="rtl">
        <IdentityAvatar option={item} size={26} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{item.label}</div>
          {item.subtitle ? <div className="truncate text-[11px] text-gray-400">{item.subtitle}</div> : null}
        </div>
        {item.disabled ? <span className="text-[10px] text-orange-500">غیرفعال</span> : null}
      </div>
    );
  };

  const loadMoreButton = hasMore ? (
    <div className="border-t border-gray-100 p-2 text-center dark:border-gray-700">
      <Button size="small" type="link" loading={loading} onClick={() => void loadPage(offset + PAGE_SIZE, true)}>
        نمایش افراد بیشتر
      </Button>
    </div>
  ) : null;

  return (
    <AdaptiveSelectField
      {...restProps}
      value={mode === 'multiple' ? selectedTokens : selectedTokens[0]}
      onChange={emitChange}
      mode={mode}
      options={groupOptions}
      className={className}
      disabled={disabled}
      loading={loading && availableItems.length === 0}
      allowClear={allowClear}
      placeholder={placeholder}
      pickerTitle={pickerTitle}
      optionFilterProp="searchText"
      filterOption={false}
      onSearch={setQuery}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery('');
      }}
      optionRender={renderIdentityOption}
      renderMobileOption={(option: any) => renderIdentityOption(option)}
      optionDisplayFallback={(option: any) => option?.identity?.label || option?.label || ''}
      renderTriggerValue={() => (
        <div className="flex min-w-0 items-center gap-1.5">
          {selectedOptionRows.slice(0, 2).map((item) => <IdentityAvatar key={item.token} option={item} size={20} />)}
          <span className="truncate">{selectedOptionRows.map((item) => item.label).join('، ')}</span>
        </div>
      )}
      renderSelectedTag={(option: any) => option?.identity ? (
        <span className="inline-flex min-w-0 items-center gap-1">
          <IdentityAvatar option={option.identity} size={18} />
          <span className="truncate">{option.identity.label}</span>
        </span>
      ) : (option?.label || '')}
      popupRender={(menu: React.ReactNode) => <>{menu}{loadMoreButton}</>}
      sheetToolbar={loadMoreButton}
    />
  );
};

export default AdaptiveIdentityPicker;
