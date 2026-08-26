import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasCurrentOrgPlanFeature } from '../../utils/saasPlanFeatures';
import { CAMPAIGN_TOOL_DEFINITIONS } from '../../utils/advertisingCampaigns';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { fetchSessionBootstrap } from '../../utils/sessionCache';
import { supabase } from '../../supabaseClient';
import {
  createAdvertisingCampaign,
  loadCampaignWorkspace,
  saveCampaignAudienceRules,
  saveCampaignRelations,
  saveCampaignTools,
  updateAdvertisingCampaign,
} from './campaignApi';
import { createCampaignToolDraft, createEmptyCampaign } from './campaignUtils';
import {
  buildCampaignDraftStorageKey,
  clearCampaignDraftSnapshot,
  readCampaignDraftSnapshot,
  writeCampaignDraftSnapshot,
} from './campaignDraftStorage';
import type {
  CampaignAudienceRule,
  CampaignRecord,
  CampaignToolRecord,
  CampaignToolType,
  CampaignWizardDraft,
} from './types';

const createEmptyDraft = (): CampaignWizardDraft => ({
  campaign: createEmptyCampaign(),
  tools: [],
  audienceRules: [],
});

export type CampaignWizardSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export const useCampaignPlanAvailability = () => {
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      const entries = await Promise.all(CAMPAIGN_TOOL_DEFINITIONS
        .filter((item) => item.planFeature)
        .map(async (item) => [
          item.value,
          await hasCurrentOrgPlanFeature(item.planFeature!, { defaultEnabled: false }),
        ] as const));
      if (active) {
        setAvailability(Object.fromEntries(entries));
        setLoading(false);
      }
    };
    void load().catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { loading, availability };
};

export const useCampaignWizard = (campaignId?: string | null) => {
  const normalizedId = String(campaignId || '').trim();
  const isCreateMode = !normalizedId || normalizedId === 'create' || normalizedId === 'new';
  const [draft, setDraft] = useState<CampaignWizardDraft>(() => createEmptyDraft());
  const [accessMode, setAccessMode] = useState<'full' | 'tool_limited'>('full');
  const [loading, setLoading] = useState(!isCreateMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<CampaignWizardSaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [draftStorageKey, setDraftStorageKey] = useState('');
  const [recoveredLocalDraft, setRecoveredLocalDraft] = useState(false);
  const dirtyRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const mountedRef = useRef(true);
  const saveStateRef = useRef<CampaignWizardSaveState>('idle');
  const pendingRuntimeToolsRef = useRef<Map<string, Partial<CampaignToolRecord>>>(new Map());
  const draftRef = useRef(draft);
  const draftStorageKeyRef = useRef('');
  const localDraftReadyRef = useRef(false);

  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { saveStateRef.current = saveState; }, [saveState]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { draftStorageKeyRef.current = draftStorageKey; }, [draftStorageKey]);

  const saveLocalDraft = useCallback((snapshot = draftRef.current) => {
    const key = draftStorageKeyRef.current;
    if (!key || !localDraftReadyRef.current) return;
    writeCampaignDraftSnapshot(key, {
      savedAt: Date.now(),
      routeCampaignId: normalizedId,
      hasUnsavedChanges: saveStateRef.current === 'dirty' || saveStateRef.current === 'error',
      draft: snapshot,
    });
  }, [normalizedId]);

  const mergeRuntimeTool = useCallback((toolId: string, row: Record<string, unknown>) => {
    const patch: Partial<CampaignToolRecord> = {
      status: row.status as CampaignToolRecord['status'],
      actual_cost: row.actual_cost as number | null | undefined,
      actual_start_at: row.actual_start_at as string | null | undefined,
      actual_end_at: row.actual_end_at as string | null | undefined,
      actual_leads: row.actual_leads as number | null | undefined,
      actual_customers: row.actual_customers as number | null | undefined,
      result_summary: row.result_summary as string | null | undefined,
      updated_by: row.updated_by as string | null | undefined,
      updated_at: row.updated_at as string | null | undefined,
    };
    Object.keys(patch).forEach((key) => {
      if ((patch as any)[key] === undefined) delete (patch as any)[key];
    });
    setDraft((current) => ({
      ...current,
      tools: current.tools.map((tool) => tool.id === toolId ? { ...tool, ...patch } : tool),
    }));
  }, []);

  const acceptRuntimeTool = useCallback((row: Record<string, unknown>) => {
    const toolId = String(row.id || '').trim();
    if (!toolId) return;
    const state = saveStateRef.current;
    if (state !== 'idle' && state !== 'saved') {
      pendingRuntimeToolsRef.current.set(toolId, row as Partial<CampaignToolRecord>);
      return;
    }
    mergeRuntimeTool(toolId, row);
  }, [mergeRuntimeTool]);

  useEffect(() => {
    if (saveState !== 'idle' && saveState !== 'saved') return;
    const pending = Array.from(pendingRuntimeToolsRef.current.entries());
    pendingRuntimeToolsRef.current.clear();
    pending.forEach(([toolId, row]) => mergeRuntimeTool(toolId, row as Record<string, unknown>));
  }, [mergeRuntimeTool, saveState]);

  const replaceDraft = useCallback((next: CampaignWizardDraft) => {
    setDraft(next);
    savedRevisionRef.current = dirtyRevisionRef.current;
    setSaveState('idle');
  }, []);

  const load = useCallback(async () => {
    localDraftReadyRef.current = false;
    setRecoveredLocalDraft(false);
    const bootstrap = await fetchSessionBootstrap(supabase).catch(() => null);
    const orgId = String(bootstrap?.orgId || '').trim();
    const userId = String(bootstrap?.user?.id || '').trim();
    const localKey = orgId && userId ? buildCampaignDraftStorageKey(orgId, userId, normalizedId || 'create') : '';
    const localSnapshot = readCampaignDraftSnapshot(localKey);
    if (mountedRef.current) setDraftStorageKey(localKey);
    if (isCreateMode) {
      const nextDraft = localSnapshot?.draft || createEmptyDraft();
      // همان پیش‌فرض فرم‌های مرکزی: مسئول رکورد جدید، کاربر واردشده است.
      // فقط برای پیش‌نویس تازه اعمال می‌شود تا انتخاب قبلی کاربر بازنویسی نشود.
      if (!localSnapshot && !nextDraft.campaign.assignee_id && !nextDraft.campaign.assignee_role_id && userId) {
        nextDraft.campaign = {
          ...nextDraft.campaign,
          assignee_id: userId,
          assignee_type: 'user',
        };
      }
      replaceDraft(nextDraft);
      if (localSnapshot && mountedRef.current) setRecoveredLocalDraft(true);
      setAccessMode('full');
      setLoading(false);
      localDraftReadyRef.current = true;
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const workspace = await loadCampaignWorkspace(normalizedId);
      if (!mountedRef.current) return;
      const serverDraft = {
        campaign: workspace.campaign,
        tools: workspace.tools,
        audienceRules: workspace.audienceRules,
      };
      const serverUpdatedAt = Date.parse(String(workspace.campaign.updated_at || '')) || 0;
      // یک snapshot صرفاً برای سرعت و بازیابی آفلاین است، نه منبع حقیقت رکورد.
      // snapshotهای قدیمی که این نشان را ندارند قبلاً می‌توانستند مقدار خالیِ
      // یک فیلد را روی مقدار ذخیره‌شدهٔ سرور بنشانند.
      const shouldRecover = Boolean(
        localSnapshot?.hasUnsavedChanges === true
        && localSnapshot.savedAt > serverUpdatedAt,
      );
      // پیش‌نویس محلی نباید یک مقدار خالیِ قدیمی را جای اطلاعات ذخیره‌شده
      // بگذارد؛ به‌ویژه نام کمپین باید همیشه از رکورد سرور قابل بازیابی باشد.
      const recoveredDraft = shouldRecover ? {
        ...serverDraft,
        ...localSnapshot!.draft,
        campaign: {
          ...serverDraft.campaign,
          ...localSnapshot!.draft.campaign,
          name: String(localSnapshot!.draft.campaign?.name || '').trim() || serverDraft.campaign.name,
        },
      } : serverDraft;
      replaceDraft(recoveredDraft);
      if (shouldRecover && mountedRef.current) setRecoveredLocalDraft(true);
      setAccessMode(workspace.accessMode);
    } catch (error) {
      if (localSnapshot) {
        replaceDraft(localSnapshot.draft);
        if (mountedRef.current) {
          setRecoveredLocalDraft(true);
          setAccessMode('full');
        }
      } else if (mountedRef.current) {
        setLoadError(toFaErrorMessage(error, 'خواندن کمپین ناموفق بود.'));
      }
    } finally {
      localDraftReadyRef.current = true;
      if (mountedRef.current) setLoading(false);
    }
  }, [isCreateMode, normalizedId, replaceDraft]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!draftStorageKey || !localDraftReadyRef.current) return;
    saveLocalDraft(draft);
  }, [draft, draftStorageKey, saveLocalDraft]);

  useEffect(() => {
    const flush = () => saveLocalDraft();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [saveLocalDraft]);

  useEffect(() => {
    if (isCreateMode || !normalizedId || accessMode !== 'full') return;
    const runtimeColumns = 'id,status,actual_cost,actual_start_at,actual_end_at,actual_leads,actual_customers,result_summary,updated_by,updated_at';
    const channel = supabase.channel(`advertising-campaign-runtime-${normalizedId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'advertising_campaign_tools', filter: `campaign_id=eq.${normalizedId}`,
      }, (payload: any) => {
        if (payload?.eventType !== 'DELETE' && payload?.new) acceptRuntimeTool(payload.new);
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'advertising_campaign_dispatches', filter: `campaign_id=eq.${normalizedId}`,
      }, (payload: any) => {
        const toolId = String(payload?.new?.tool_id || payload?.old?.tool_id || '').trim();
        if (!toolId) return;
        void supabase.from('advertising_campaign_tools').select(runtimeColumns)
          .eq('campaign_id', normalizedId).eq('id', toolId).maybeSingle()
          .then(({ data, error }) => { if (!error && data) acceptRuntimeTool(data as Record<string, unknown>); });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [acceptRuntimeTool, accessMode, isCreateMode, normalizedId]);

  const markDirty = useCallback(() => {
    dirtyRevisionRef.current += 1;
    setSaveState('dirty');
    setSaveError(null);
  }, []);

  const updateCampaign = useCallback((patch: Partial<CampaignRecord>) => {
    setDraft((current) => ({ ...current, campaign: { ...current.campaign, ...patch } }));
    markDirty();
  }, [markDirty]);

  const setToolTypes = useCallback((toolTypes: CampaignToolType[]) => {
    const normalized = Array.from(new Set((toolTypes || []).map(String).filter(Boolean)));
    setDraft((current) => {
      const currentByType = new Map(current.tools.map((tool) => [String(tool.tool_type), tool]));
      const nextTools = [...current.tools];
      normalized.forEach((toolType) => {
        const existing = currentByType.get(toolType);
        if (existing) {
          const index = nextTools.findIndex((tool) => tool.id === existing.id);
          nextTools[index] = { ...existing, enabled: true };
          return;
        }
        nextTools.push(createCampaignToolDraft(current.campaign.id, toolType));
      });
      nextTools.forEach((tool, index) => {
        if (!normalized.includes(String(tool.tool_type)) && tool.enabled) nextTools[index] = { ...tool, enabled: false };
      });
      return {
        ...current,
        campaign: { ...current.campaign, tool_types: normalized },
        tools: nextTools,
      };
    });
    markDirty();
  }, [markDirty]);

  const updateTool = useCallback((toolId: string, patch: Partial<CampaignToolRecord>) => {
    setDraft((current) => ({
      ...current,
      tools: current.tools.map((tool) => tool.id === toolId ? { ...tool, ...patch } : tool),
    }));
    markDirty();
  }, [markDirty]);

  const applyExternalToolPatch = useCallback((toolId: string, patch: Partial<CampaignToolRecord>) => {
    setDraft((current) => ({
      ...current,
      tools: current.tools.map((tool) => tool.id === toolId ? { ...tool, ...patch } : tool),
    }));
  }, []);

  const updateAudienceRule = useCallback((targetModuleId: CampaignAudienceRule['target_module_id'], patch: Partial<CampaignAudienceRule>) => {
    setDraft((current) => {
      const existing = current.audienceRules.find((rule) => rule.target_module_id === targetModuleId);
      const nextRule: CampaignAudienceRule = {
        id: existing?.id,
        campaign_id: current.campaign.id || undefined,
        target_module_id: targetModuleId,
        conditions_all: existing?.conditions_all || [],
        conditions_any: existing?.conditions_any || [],
        enabled: existing?.enabled !== false,
        ...patch,
      };
      return {
        ...current,
        audienceRules: existing
          ? current.audienceRules.map((rule) => rule.target_module_id === targetModuleId ? nextRule : rule)
          : [...current.audienceRules, nextRule],
      };
    });
    markDirty();
  }, [markDirty]);

  const validateBasics = useCallback(() => {
    if (!String(draft.campaign.name || '').trim()) throw new Error('نام کمپین الزامی است.');
    if (!Array.isArray(draft.campaign.tool_types) || draft.campaign.tool_types.length === 0) {
      throw new Error('حداقل یک ابزار تبلیغاتی انتخاب کنید.');
    }
    if (draft.campaign.start_at && draft.campaign.end_at) {
      const start = Date.parse(draft.campaign.start_at);
      const end = Date.parse(draft.campaign.end_at);
      if (Number.isFinite(start) && Number.isFinite(end) && start > end) {
        throw new Error('زمان پایان نمی‌تواند قبل از زمان شروع باشد.');
      }
    }
  }, [draft.campaign]);

  const persist = useCallback(async (options?: { createIfNeeded?: boolean }) => {
    const requestedRevision = dirtyRevisionRef.current;
    const snapshot = draft;
    const execute = async (): Promise<string | null> => {
      try {
        setSaveState('saving');
        setSaveError(null);
        let campaign = snapshot.campaign;
        if (!campaign.id) {
          if (!options?.createIfNeeded) return null;
          validateBasics();
          campaign = await createAdvertisingCampaign(campaign);
        } else {
          campaign = await updateAdvertisingCampaign(campaign);
        }
        await saveCampaignRelations({ ...campaign, ...snapshot.campaign, id: campaign.id });
        const tools = await saveCampaignTools(
          campaign.id,
          snapshot.tools.map((tool) => ({ ...tool, campaign_id: campaign.id })),
          snapshot.campaign.tool_types || [],
        );
        const audienceRules = await saveCampaignAudienceRules(campaign.id, snapshot.audienceRules);
        if (mountedRef.current) {
          setDraft((current) => ({
            campaign: { ...current.campaign, ...campaign, id: campaign.id },
            tools: tools.map((savedTool) => {
              const latest = current.tools.find((item) => item.tool_type === savedTool.tool_type);
              return latest ? { ...savedTool, ...latest, id: savedTool.id, campaign_id: campaign.id } : savedTool;
            }),
            audienceRules: audienceRules.map((savedRule) => {
              const latest = current.audienceRules.find((item) => item.target_module_id === savedRule.target_module_id);
              return latest ? { ...savedRule, ...latest, id: savedRule.id, campaign_id: campaign.id } : savedRule;
            }),
          }));
          savedRevisionRef.current = Math.max(savedRevisionRef.current, requestedRevision);
          setSaveState(dirtyRevisionRef.current > requestedRevision ? 'dirty' : 'saved');
          setLastSavedAt(new Date());
          if (dirtyRevisionRef.current <= requestedRevision) {
            clearCampaignDraftSnapshot(draftStorageKeyRef.current);
          } else {
            saveLocalDraft();
          }
        }
        return campaign.id;
      } catch (error) {
        if (mountedRef.current) {
          setSaveState('error');
          setSaveError(toFaErrorMessage(error, 'ذخیره کمپین ناموفق بود.'));
        }
        throw error;
      }
    };
    saveQueueRef.current = saveQueueRef.current.catch(() => null).then(execute);
    return saveQueueRef.current;
  }, [draft, saveLocalDraft, validateBasics]);

  useEffect(() => {
    if (!draft.campaign.id || accessMode !== 'full' || saveState !== 'dirty') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    // ذخیره محلی فوراً انجام می‌شود؛ ذخیرهٔ سرور را با فاصلهٔ بیشتری انجام
    // می‌دهیم تا تایپ در فرم‌های طولانی باعث موجی از به‌روزرسانی ابزارها نشود.
    const timer = window.setTimeout(() => { void persist().catch(() => undefined); }, 3500);
    return () => window.clearTimeout(timer);
  }, [accessMode, draft, persist, saveState]);

  useEffect(() => {
    const resume = () => {
      if (draftRef.current.campaign.id && saveStateRef.current === 'dirty') {
        void persist().catch(() => undefined);
      }
    };
    window.addEventListener('online', resume);
    return () => window.removeEventListener('online', resume);
  }, [persist]);

  const selectedTools = useMemo(() => {
    const selected = new Set((draft.campaign.tool_types || []).map(String));
    return draft.tools.filter((tool) => selected.has(String(tool.tool_type)));
  }, [draft.campaign.tool_types, draft.tools]);

  return {
    draft,
    selectedTools,
    accessMode,
    loading,
    loadError,
    saveState,
    saveError,
    lastSavedAt,
    recoveredLocalDraft,
    isCreateMode,
    updateCampaign,
    setToolTypes,
    updateTool,
    applyExternalToolPatch,
    updateAudienceRule,
    validateBasics,
    persist,
    reload: load,
  };
};
