import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_TONE_STYLES,
  AI_AGENT_CATALOG,
  buildAgentAccessMapFromOverviewAgents,
  extractAgentKeyFromRow,
  isAgentNoteRow,
  normalizeSelectedAgents,
  resolveClientAgentAccess,
} from '../aiAgentCatalog';
import AiCapabilityComposerActions, {
  normalizeAiComposerCapabilities,
} from '../../components/ai/AiCapabilityComposerActions';
import DashboardAgentDeskStrip from '../../components/dashboard/DashboardAgentDeskStrip';
import AiAgentMessagesCompactBox from '../../components/ai/AiAgentMessagesCompactBox';
import AiAgentIcon from '../../components/ai/AiAgentIcon';
import { canQuickReplyNotification } from '../notificationQuickReply';
import {
  getUiNotificationOverlayItemsSnapshot,
  setUiNotificationOverlayItems,
  setUiNotificationOverlayViewer,
} from '../uiNotificationOverlayStore';
import { DOMAIN_SKILL_MAP, resolveRunnableAgentsForActor } from '../../supabase/functions/_shared/ai-skill-registry.ts';
import { resolveModelSlot, tryResolveModelSlot } from '../../supabase/functions/_shared/ai-gateway.ts';
import { isWithinOrgWorkSchedule, resolveAgentStatesForActor } from '../../supabase/functions/_shared/ai-grounding.ts';
import { compileLayeredAgentPrompt } from '../../supabase/functions/_shared/ai-prompt-compiler.ts';
import {
  AUTO_COMPACTION_THRESHOLD_RATIO,
  mergeWorkingStateFromMessages,
  shouldAutoCompactContext,
} from '../../supabase/functions/_shared/ai-context-compressor.ts';
import {
  applyPriceAdjustment,
  computeAdjustedUnitPrice,
  recalculateBundleRowForPriceChange,
} from '../../supabase/functions/_shared/ai-skills/pricing-adjustment.ts';
import {
  buildInstagramShowcaseCardDraft,
  buildInstagramWorkflowRuleDraft,
} from '../../supabase/functions/_shared/ai-skills/instagrammer.ts';
import { extractTutorialBlocksSummary } from '../../supabase/functions/_shared/ai-skills/system-guide.ts';

vi.mock('../../supabaseClient', () => ({
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon-test-key',
  supabase: {
    functions: {
      invoke: vi.fn(async (fnName: string, options?: any) => {
        if (fnName === 'ai-assistant' && options?.body?.action === 'get_agents_workspace_overview') {
          return {
            data: {
              success: true,
              canManage: true,
              agents: AI_AGENT_CATALOG.map((def) => ({
                key: def.key,
                canUse: true,
                orgEnabled: true,
                planAllowed: true,
                rbacAllowed: true,
                isWorking: def.key === 'hr_manager',
                toneStyle: def.defaultToneStyle,
              })),
              pendingApprovals: [{ id: 'app-1', agent_key: 'sales_leads' }],
            },
            error: null,
          };
        }
        if (fnName === 'ai-assistant' && options?.body?.action === 'list_agent_messages') {
          return {
            data: {
              success: true,
              threads: [
                {
                  agentKey: 'hr_manager',
                  titleFa: 'ایجنت مدیر منابع انسانی',
                  conversationKey: 'agent:hr_manager',
                  lastMessageAt: '2026-11-11T09:00:00Z',
                  lastPreview: 'فایل پیگیری مرخصی آماده شد',
                  unreadCount: 1,
                  messages: [
                    {
                      id: 'note-agent-1',
                      content: 'فایل پیگیری مرخصی آماده شد',
                      created_at: '2026-11-11T09:00:00Z',
                      metadata: { agent_key: 'hr_manager', relay_kind: 'followup' },
                      attachments: [{ name: 'hr-plan.pdf', url: 'https://example.test/hr.pdf' }],
                    },
                  ],
                },
              ],
            },
            error: null,
          };
        }
        if (fnName === 'ai-assistant' && options?.body?.action === 'list_waiting_approvals') {
          return {
            data: {
              success: true,
              approvals: [
                {
                  id: 'appr-1',
                  agent_key: 'sales_leads',
                  proposed_payload: { summary_fa: 'تغییر قیمت ۲۰٪ بنرها آماده تایید است' },
                },
              ],
            },
            error: null,
          };
        }
        return { data: { success: true }, error: null };
      }),
    },
    from: vi.fn(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        like: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(async () => ({
          data: [
            {
              id: 'note-agent-1',
              content: 'فایل پیگیری مرخصی آماده شد',
              created_at: '2026-11-11T09:00:00Z',
              metadata: { agent_key: 'hr_manager', relay_kind: 'followup' },
              attachments: [{ name: 'hr-plan.pdf', url: 'https://example.test/hr.pdf' }],
            },
          ],
          error: null,
        })),
      };
      return chain;
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => ({})),
    })),
    removeChannel: vi.fn(async () => 'ok'),
  },
}));

describe('Modular AaaS Foundation', () => {
  afterEach(() => {
    cleanup();
  });

  it('defines all 9 specialized agents including HR, Instagrammer and System Guide cleanly in client & server catalogs', () => {
    const expectedKeys = [
      'lead_orchestrator',
      'sales_leads',
      'purchase_supply',
      'customer_response',
      'hr_manager',
      'reservation',
      'project_process',
      'instagrammer',
      'system_guide',
    ];

    expect(AI_AGENT_CATALOG.map((a) => a.key)).toEqual(expectedKeys);
    expectedKeys.forEach((key) => {
      expect(DOMAIN_SKILL_MAP[key as keyof typeof DOMAIN_SKILL_MAP]).toBeTruthy();
    });
    expect(AGENT_TONE_STYLES.map((t) => t.value)).toEqual([
      'friendly_warm',
      'formal',
      'concise',
      'coaching',
      'custom',
    ]);
    expect(isAgentNoteRow({ metadata: { conversation_key: 'agent:hr_manager' } })).toBe(true);
    expect(extractAgentKeyFromRow({ metadata: { conversation_key: 'agent:instagrammer' } })).toBe('instagrammer');
    expect(normalizeSelectedAgents(['hr_manager', 'invalid_key', 'hr_manager', 'system_guide'])).toEqual([
      'hr_manager',
      'system_guide',
    ]);
  });

  it('has ZERO hardcoded AI default models and ZERO safety-filter bypass features across backend and UI', () => {
    const repoRoot = process.cwd();
    const inspectedFiles = [
      'utils/aiAgentCatalog.ts',
      'components/ai/AiCapabilityComposerActions.tsx',
      'components/ai/AiAgentConfigPanel.tsx',
      'components/ai/AiAgentOnboardingWizard.tsx',
      'pages/AiAgentsWorkspacePage.tsx',
      'pages/Settings/AiSettingsTab.tsx',
      'pages/SaasAdmin/SaasAdminAiSettings.tsx',
      'supabase/functions/_shared/ai-agent-contract.ts',
      'supabase/functions/_shared/ai-context-compressor.ts',
      'supabase/functions/_shared/ai-gateway.ts',
      'supabase/functions/_shared/ai-prompt-compiler.ts',
    ];

    const forbiddenSafetyTerms = ['بدون فیلتر ایمنی', 'disable_safety', 'bypass_safety', 'safety_filter_disabled'];
    const hardcodedModelFallbackRegex = /(?:DEFAULT_[A-Z_]*MODEL\s*=|return\s+['"](?:deepseek-chat|gpt-4o|gpt-4o-mini|claude-3|gemini-2))/;

    for (const relPath of inspectedFiles) {
      const content = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
      for (const term of forbiddenSafetyTerms) {
        expect(content).not.toContain(term);
      }
      expect(hardcodedModelFallbackRegex.test(content)).toBe(false);
    }

    expect(() =>
      resolveModelSlot({
        slot: 'context_compression',
        catalogRows: [],
        orgAiSettings: null,
      }),
    ).toThrow();

    const emptyTry = tryResolveModelSlot({
      slot: 'context_compression',
      catalogRows: [],
      orgAiSettings: null,
    });
    expect(emptyTry).toBeNull();

    const chosenCompression = resolveModelSlot({
      slot: 'context_compression',
      catalogRows: [
        {
          id: 'org-selected-compact-model',
          provider: 'avalai',
          capability_tags: ['context_compression', 'dashboard_chat'],
          is_active: true,
          is_coming_soon: false,
        },
      ],
      orgAiSettings: {
        selected_models: { context_compression: 'org-selected-compact-model' },
      },
    });
    expect(chosenCompression.model).toBe('org-selected-compact-model');
    expect(chosenCompression.source).toBe('org_slot');

    const chosenPerAgentDefault = resolveModelSlot({
      slot: 'dashboard_chat',
      catalogRows: [
        {
          id: 'deepseek-v4.1-flash',
          provider: 'deepseek',
          capability_tags: ['dashboard_chat', 'record_chat', 'agent_fast'],
          is_active: true,
          is_coming_soon: false,
        },
        {
          id: 'qwen3.8-max',
          provider: 'qwen',
          capability_tags: ['dashboard_chat', 'record_chat'],
          is_active: true,
          is_coming_soon: false,
        },
      ],
      orgAiSettings: null,
      saasDefaultModels: {
        __primary_model: 'qwen3.8-max',
        'agent:system_guide': 'deepseek-v4.1-flash',
      },
      agentConfig: { agent_key: 'system_guide' },
    });
    expect(chosenPerAgentDefault.model).toBe('deepseek-v4.1-flash');
    expect(chosenPerAgentDefault.source).toBe('saas_agent_default');
  });

  it('enforces Hybrid Plan x RBAC x Member Override access and Tehran work schedules', () => {
    const clientAccess = resolveClientAgentAccess({
      planFeatures: { instagram_inbox: false, ai_staff_bot: true, reservations: true },
      enabledModules: { products: true, customers: true, invoices: true, marketing_leads: true, employees: true },
      permissions: {
        customers: { view: true },
        invoices: { view: true },
        employees: { view: false },
      },
      agentConfigs: [{ agent_key: 'purchase_supply', is_enabled: false }],
      memberPermissions: [
        { agent_key: 'sales_leads', subject_type: 'role', subject_id: 'role-sales', can_use: false, staff_bot_enabled: false },
        { agent_key: 'sales_leads', subject_type: 'user', subject_id: 'user-1', can_use: true, staff_bot_enabled: true },
      ],
      userId: 'user-1',
      roleId: 'role-sales',
      isOrgAdmin: false,
    });

    expect(clientAccess.instagrammer.planAllowed).toBe(false);
    expect(clientAccess.instagrammer.canUse).toBe(false);
    expect(clientAccess.purchase_supply.orgEnabled).toBe(false);
    expect(clientAccess.sales_leads.canUse).toBe(true);
    expect(clientAccess.sales_leads.staffBotEnabled).toBe(true);
    expect(clientAccess.hr_manager.rbacAllowed).toBe(false);

    const serverStates = resolveAgentStatesForActor({
      agentConfigs: [{ agent_key: 'system_guide', tone_style: 'coaching', is_enabled: true }],
      memberPermissions: [
        { agent_key: '__staff_bot', subject_type: 'role', subject_id: 'r1', staff_bot_enabled: true },
      ],
      planContext: {
        available: true,
        enabledModules: { customers: true, invoices: true, tasks: true, projects: true, instructions: true, org_knowledge: true },
        features: { ai_staff_bot: true, instagram_inbox: false },
      },
      permissions: { customers: { view: true }, invoices: { view: true }, tasks: { view: true } },
      userId: 'u1',
      roleId: 'r1',
      isOrgAdmin: false,
    });

    expect(serverStates.instagrammer.canUse).toBe(false);
    expect(serverStates.system_guide.canUse).toBe(true);
    expect(serverStates.system_guide.toneStyle).toBe('coaching');
    expect(serverStates.sales_leads.staffBotEnabled).toBe(true);

    const runnable = resolveRunnableAgentsForActor({
      requestedAgents: ['sales_leads', 'instagrammer'],
      grounding: {
        orgId: 'org-1',
        freeChatMode: false,
        company: null,
        reservationSettings: null,
        workSchedules: [],
        instructions: [],
        jobDescriptions: [],
        orgDirectory: { roles: [], members: [], actorRolePath: [], subordinateRoles: [] },
        agentConfigs: [],
        memberPermissions: [],
        agentStates: serverStates,
        planContext: { available: true },
        calendarContext: null,
      },
    });
    expect(runnable.permittedAgents).toEqual(['sales_leads']);
    expect(runnable.blockedAgents[0]?.agentKey).toBe('instagrammer');

    const holidayCheck = isWithinOrgWorkSchedule([], new Date(), { is_official_holiday: true });
    expect(holidayCheck.withinSchedule).toBe(false);
  });

  it('computes pricing adjustments across products, price lists, bundle discount modes, and proforma invoices only', () => {
    expect(computeAdjustedUnitPrice(100_000, { mode: 'percent_increase', value: 20 })).toBe(120_000);
    expect(computeAdjustedUnitPrice(103_450, { mode: 'percent_increase', value: 10, roundingStep: 1000 })).toBe(114_000);

    const keepRatio = recalculateBundleRowForPriceChange({
      row: { product_id: 'p1', quantity: 2, unit_price: 100_000, discount_type: 'amount', discount: 20_000 },
      nextUnitPrice: 150_000,
      discountMode: 'keep_ratio',
    });
    expect(keepRatio.discount).toBe(30_000);
    expect(keepRatio.total_price).toBe(270_000);

    const keepAmount = recalculateBundleRowForPriceChange({
      row: { product_id: 'p1', quantity: 2, unit_price: 100_000, discount_type: 'amount', discount: 20_000 },
      nextUnitPrice: 150_000,
      discountMode: 'keep_amount',
    });
    expect(keepAmount.discount).toBe(20_000);
    expect(keepAmount.total_price).toBe(280_000);

    const clearDiscount = recalculateBundleRowForPriceChange({
      row: { product_id: 'p1', quantity: 2, unit_price: 100_000, discount_type: 'percent', discount: 10 },
      nextUnitPrice: 120_000,
      discountMode: 'clear_discount',
    });
    expect(clearDiscount.discount).toBe(0);
    expect(clearDiscount.total_price).toBe(240_000);

    const planResult = applyPriceAdjustment({
      products: [{ id: 'p-banner', name: 'بنر تبلیغاتی', system_code: 'PRD-1', sell_price: 100_000, buy_price: 50_000 }],
      priceLists: [{ id: 'pl-1', name: 'لیست همکار', items: [{ product_id: 'p-banner', price: 100_000, buy_price: 50_000 }] }],
      productBundles: [
        {
          id: 'b-1',
          name: 'پکیج نمایشگاهی',
          products: [{ product_id: 'p-banner', quantity: 2, unit_price: 100_000, discount_type: 'amount', discount: 20_000, total_price: 180_000 }],
        },
      ],
      proformaInvoices: [
        {
          id: 'inv-proforma',
          name: 'پیش‌فاکتور بنر',
          status: 'proforma',
          total_invoice_amount: 100_000,
          total_received_amount: 0,
          invoiceItems: [{ product_id: 'p-banner', quantity: 1, unit_price: 100_000, total_price: 100_000 }],
        },
        {
          id: 'inv-final',
          name: 'فاکتور نهایی',
          status: 'confirmed',
          total_invoice_amount: 100_000,
          invoiceItems: [{ product_id: 'p-banner', quantity: 1, unit_price: 100_000, total_price: 100_000 }],
        },
      ],
      targets: [{ productId: 'p-banner', mode: 'percent_increase', value: 20 }],
      scopes: ['products', 'price_lists', 'product_bundles', 'proforma_invoices'],
      bundleDiscountMode: 'keep_ratio',
    });

    expect(planResult.productUpdates).toHaveLength(1);
    expect(planResult.productUpdates[0].newSellPrice).toBe(120_000);
    expect(planResult.priceListUpdates[0].patch.items[0].price).toBe(120_000);
    expect(planResult.priceListUpdates[0].patch.items[0].profit_percentage).toBe(140);
    expect(planResult.bundleUpdates[0].newTotal).toBe(216_000);
    expect(planResult.proformaUpdates.map((p) => p.id)).toEqual(['inv-proforma']);
    expect(planResult.proformaUpdates[0].newTotal).toBe(120_000);
  });

  it('enforces official BoxAPI rules for Instagrammer story expiry, permalinks, HTTPS cards and max 3 buttons', () => {
    const pastIso = new Date(Date.now() - 3600_000).toISOString();
    expect(() =>
      buildInstagramWorkflowRuleDraft({
        name: 'پاسخ استوری منقضی',
        triggerScope: 'direct_story',
        media: { permalink: 'https://instagram.com/stories/test/1', expires_at: pastIso },
        actionType: 'send_instagram_message',
        replyMessage: 'سلام',
      }),
    ).toThrow(/۲۴ ساعته/);

    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    const storyRule = buildInstagramWorkflowRuleDraft({
      name: 'پاسخ استوری فعال',
      triggerScope: 'direct_story',
      media: { permalink: 'https://instagram.com/stories/test/2', expires_at: futureIso },
      keywordContains: 'قیمت',
      actionType: 'send_instagram_message',
      replyMessage: 'لیست قیمت ارسال شد.',
    });
    expect(storyRule.module_id).toBe('instagram_interaction_events');
    expect(storyRule.conditions_all.some((c) => c.field === 'media_type' && c.value === 'story')).toBe(true);

    expect(() =>
      buildInstagramShowcaseCardDraft({
        name: 'کارت غیرمجاز',
        buttons: [
          { title: '۱', action_type: 'send_message' },
          { title: '۲', action_type: 'send_message' },
          { title: '۳', action_type: 'send_message' },
          { title: '۴', action_type: 'send_message' },
        ],
      }),
    ).toThrow(/حداکثر ۳ دکمه/);

    const cardWithImage = buildInstagramShowcaseCardDraft({
      name: 'ویترین ویژه',
      image_url: 'https://cdn.example.com/banner.jpg',
      buttons: [{ title: 'مشاهده کاتالوگ', action_type: 'open_url', payload: { url: 'https://tazesystem.ir/c/demo' } }],
    });
    expect(cardWithImage.boxapi_preview_mode).toBe('send_generic_template');

    const cardTextOnly = buildInstagramShowcaseCardDraft({
      name: 'کارت دکمه‌ای',
      buttons: [{ title: 'ثبت سفارش', action_type: 'request_human' }],
    });
    expect(cardTextOnly.boxapi_preview_mode).toBe('send_message_buttons');
  });

  it('produces byte-stable prompt cache prefixes, triggers auto-compaction cleanly, and extracts System Guide tutorials', async () => {
    const baseGrounding: any = {
      orgId: 'org-1',
      freeChatMode: false,
      company: { company_name: 'تازه‌سیستم نمونه', currency_label: 'تومان', currency_code: 'IRT' },
      reservationSettings: null,
      workSchedules: [],
      instructions: [{ title: 'دستورالعمل فروش' }],
      jobDescriptions: [],
      orgDirectory: { roles: [], members: [], actorRolePath: [], subordinateRoles: [] },
      agentConfigs: [],
      memberPermissions: [],
      agentStates: {},
      planContext: { available: true },
      calendarContext: { tehran_now_jalali: '1404/08/20', today: {}, explicit_user_dates: [], upcoming_dates: [] },
    };

    const turn1 = await compileLayeredAgentPrompt({
      userMessage: 'سلام گزارش امروز را بده',
      selectedAgents: ['sales_leads', 'hr_manager'],
      selectedCapabilities: ['record_creation', 'pricing_adjustment'],
      grounding: baseGrounding,
      contextPayload: { turn: 1 },
      historyMessages: [],
    });
    const turn2 = await compileLayeredAgentPrompt({
      userMessage: 'سلام حالا مرخصی‌ها را هم چک کن',
      selectedAgents: ['hr_manager', 'sales_leads'],
      selectedCapabilities: ['pricing_adjustment', 'record_creation'],
      grounding: {
        ...baseGrounding,
        calendarContext: { tehran_now_jalali: '1404/08/21', today: {}, explicit_user_dates: [], upcoming_dates: [] },
      },
      contextPayload: { turn: 2 },
      historyMessages: [],
    });
    const turnDifferentAgent = await compileLayeredAgentPrompt({
      userMessage: 'سلام',
      selectedAgents: ['system_guide'],
      selectedCapabilities: ['record_creation'],
      grounding: baseGrounding,
      contextPayload: { turn: 3 },
      historyMessages: [],
    });

    expect(turn1.cachedPrefixHash).toBe(turn2.cachedPrefixHash);
    expect(turn1.staticSystemPrefix).toBe(turn2.staticSystemPrefix);
    expect(turnDifferentAgent.cachedPrefixHash).not.toBe(turn1.cachedPrefixHash);

    const compactCheck = shouldAutoCompactContext({
      promptMessages: [{ role: 'user', content: 'الف'.repeat(160_000) }],
      rawMessageCount: 16,
      modelCatalog: { id: 'm1', metadata: { context_window: 64_000 } },
    });
    expect(AUTO_COMPACTION_THRESHOLD_RATIO).toBe(0.7);
    expect(compactCheck.shouldCompact).toBe(true);

    const nextState = mergeWorkingStateFromMessages(null, [
      { role: 'assistant', metadata: { selected_price_list_id: 'pl-1', selected_price_list_label: 'همکار' } },
      { role: 'user', content: 'موافقم انجام بده' },
    ]);
    expect(nextState.selected_price_list_id).toBe('pl-1');
    expect(nextState.user_decisions).toContain('موافقم انجام بده');

    const guideSummary = extractTutorialBlocksSummary([
      { type: 'heading', content: '<h2>آموزش ثبت فاکتور</h2>' },
      { type: 'video_file', title: 'ویدیوی کامل', url: 'https://cdn.example.com/inv.mp4' },
    ]);
    expect(guideSummary.textStepsSummary).toContain('آموزش ثبت فاکتور');
    expect(guideSummary.recordedVideos).toHaveLength(1);
  });

  it('supports multi-skill + multi-agent composition, agent notification priority & compact UI widgets', async () => {
    expect(
      normalizeAiComposerCapabilities(['pricing_adjustment', 'record_creation', 'pricing_adjustment']),
    ).toEqual(['pricing_adjustment', 'record_creation']);
    expect(normalizeAiComposerCapabilities(['pricing_adjustment', 'free_chat'])).toEqual(['free_chat']);

    expect(canQuickReplyNotification({ section: 'notes', category: 'agent', conversationKey: 'agent:hr_manager' })).toBe(true);
    expect(canQuickReplyNotification({ section: 'notes', category: 'system', conversationKey: 'system:alert' })).toBe(false);

    setUiNotificationOverlayViewer('org-test', 'user-test');
    setUiNotificationOverlayItems([
      {
        id: 'note-regular',
        kind: 'note',
        channel: 'internal',
        priority: 0,
        title: 'پیام داخلی عادی',
        body: 'متن عادی',
        createdAt: '2026-11-11T10:00:00Z',
        onOpen: vi.fn(),
      },
      {
        id: 'note-agent',
        kind: 'agent',
        channel: 'agent',
        priority: 10,
        title: 'ایجنت مدیر منابع انسانی',
        body: 'گزارش پیگیری آماده است',
        createdAt: '2026-11-11T08:00:00Z',
        onOpen: vi.fn(),
      },
    ], 'test-source');
    const orderedIds = getUiNotificationOverlayItemsSnapshot().map((i) => i.id);
    expect(orderedIds).toEqual(['note-agent', 'note-regular']);

    const onAgentsChange = vi.fn();
    render(
      React.createElement(
        App,
        null,
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(
            'div',
            null,
            React.createElement(AiCapabilityComposerActions, {
              selected: ['pricing_adjustment'],
              onChange: vi.fn(),
              selectedAgents: ['sales_leads', 'hr_manager'],
              onAgentsChange,
              onVoiceSend: vi.fn(),
              onFilePrepared: vi.fn(),
            }),
            React.createElement(DashboardAgentDeskStrip, {
              selectedAgents: ['hr_manager'],
              onToggleAgent: vi.fn(),
            }),
            React.createElement(AiAgentMessagesCompactBox, {
              onSelectAgent: vi.fn(),
            }),
          ),
        ),
      ),
    );

    expect(screen.getByText('تنظیم قیمت')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-agent-desk-strip')).toBeInTheDocument();
    for (const def of AI_AGENT_CATALOG) {
      expect(screen.getByLabelText(`میز ${def.shortTitleFa}`)).toBeInTheDocument();
    }
    await waitFor(() => expect(screen.getByTestId('ai-agent-messages-compact-box')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/فایل پیگیری مرخصی آماده شد/)).toBeInTheDocument());
    expect(screen.getByText(/تغییر قیمت ۲۰٪ بنرها آماده تایید است/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('انتخاب ایجنت‌های تخصصی'));
    const systemGuideLabel = await screen.findByText('ایجنت راهنمای تازه‌سیستم');
    const systemGuideCard = systemGuideLabel.closest('[role="button"]') as HTMLElement;
    expect(systemGuideCard).not.toBeNull();
    fireEvent.click(systemGuideCard);
    expect(onAgentsChange).toHaveBeenCalledWith(['sales_leads', 'hr_manager', 'system_guide']);

    cleanup();
    const { container } = render(
      React.createElement(
        'div',
        null,
        ...AI_AGENT_CATALOG.map((def) => React.createElement(AiAgentIcon, { key: def.key, agentKey: def.key })),
      ),
    );
    expect(container.querySelectorAll('svg').length).toBe(AI_AGENT_CATALOG.length);
  });

  it('strictly hides disallowed/disabled agents per Role matrix & Plan flags and opens live detail modal on desk click', async () => {
    const access = resolveClientAgentAccess({
      planFeatures: {
        'ai_agent:sales_leads': true,
        'ai_agent:hr_manager': true,
        'ai_agent:instagrammer': false,
        instagram_inbox: true,
        ai_staff_bot: true,
      },
      enabledModules: {
        customers: true,
        invoices: true,
        marketing_leads: true,
        employees: true,
        instagram_conversations: true,
      },
      permissions: {
        customers: { view: true },
        invoices: { view: true },
        employees: { view: true },
        instagram_conversations: { view: true },
        __ai_agents: {
          view: true,
          edit: false,
          fields: {
            'sales_leads.view': true,
            'sales_leads.chat': true,
            'sales_leads.toggle': true,
            'sales_leads.edit': false,
            'hr_manager.view': false,
            'hr_manager.chat': false,
          },
        },
      },
      agentConfigs: [
        { agent_key: 'sales_leads', is_enabled: false },
      ],
      userId: 'user-restricted',
      roleId: 'role-restricted',
      isOrgAdmin: false,
    });

    // Disabled agent stays visible ONLY to actors with toggle/edit permission, while chat stays blocked
    expect(access.sales_leads.canView).toBe(true);
    expect(access.sales_leads.canToggle).toBe(true);
    expect(access.sales_leads.canChat).toBe(false);
    // Explicitly hidden in RolesTab (__ai_agents.fields['hr_manager.view'] = false)
    expect(access.hr_manager.canView).toBe(false);
    expect(access.hr_manager.isHidden).toBe(true);
    // Excluded by explicit ai_agent:* plan feature flags
    expect(access.instagrammer.planAllowed).toBe(false);
    expect(access.instagrammer.canView).toBe(false);
    expect(access.reservation.canView).toBe(false);

    const serverMap = buildAgentAccessMapFromOverviewAgents([
      {
        key: 'sales_leads',
        canView: true,
        canChat: true,
        canToggle: true,
        canEdit: false,
        orgEnabled: true,
        planAllowed: true,
        rbacAllowed: true,
        memberCanUse: true,
      },
    ]);
    expect(serverMap.sales_leads.canView).toBe(true);
    expect(serverMap.sales_leads.canChat).toBe(true);
    expect(serverMap.hr_manager.canView).toBe(false);
    expect(serverMap.hr_manager.isHidden).toBe(true);

    // Compact box returns nothing when accessible agents have no matching messages
    const { container: hiddenCompact } = render(
      React.createElement(
        App,
        null,
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(AiAgentMessagesCompactBox, {
            agentAccessMap: buildAgentAccessMapFromOverviewAgents([]),
          }),
        ),
      ),
    );
    await waitFor(() => {
      expect(hiddenCompact.querySelector('[data-testid="ai-agent-messages-compact-box"]')).toBeNull();
    });

    cleanup();

    render(
      React.createElement(
        App,
        null,
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(DashboardAgentDeskStrip, {
            selectedAgents: [],
            agentAccessMap: serverMap,
            onToggleAgent: vi.fn(),
          }),
        ),
      ),
    );

    const salesDeskBtn = await screen.findByLabelText('میز فروش و لید');
    expect(salesDeskBtn).toBeInTheDocument();
    // All 9 agents render when mocked overview returns all 9, or check clicking opens the detail modal
    fireEvent.click(salesDeskBtn);
    expect(await screen.findByText('گزارش زندهٔ فعالیت')).toBeInTheDocument();
    expect(await screen.findByText('تنظیمات و زمان‌بندی خودکار')).toBeInTheDocument();
  });

  it('resolves empty agent approvals to lead_orchestrator and formats readable UUID-free summary', async () => {
    const { resolvePendingApprovalAgentKey, formatPendingApprovalSummary } = await import('../aiAgentCatalog');
    const item = {
      id: '33333333-3333-4333-8333-333333333333',
      action_type: 'create_record',
      module_id: 'customers',
      record_id: '44444444-4444-4444-8444-444444444444',
      agent_key: null,
      proposed_payload: {
        prompt: 'مشتری جدید آلفا با تلفن ۰۹۱۲۳۴۵۶۷۸۹ ثبت شود',
        record: {
          id: '55555555-5555-4555-8555-555555555555',
          full_name: 'شرکت آلفا',
          mobile_1: '09123456789',
        },
      },
    };
    expect(resolvePendingApprovalAgentKey(item)).toBe('lead_orchestrator');
    const summary = formatPendingApprovalSummary(item, (mod) => (mod === 'customers' ? 'مشتریان' : mod));
    expect(summary.titleFa).toContain('مشتریان');
    expect(summary.summaryFa).toContain('شرکت آلفا');
    expect(summary.summaryFa).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(summary.detailLines.join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('gives central SaaS per-agent and agent_fast defaults priority before org primary fallback', async () => {
    const catalog = [
      { id: 'qwen3.8-max', is_active: true, is_coming_soon: false, capability_tags: ['dashboard_chat', 'deep_reasoning'] },
      { id: 'gpt-6-luna', is_active: true, is_coming_soon: false, capability_tags: ['agent_fast', 'dashboard_chat'] },
      { id: 'claude-sonnet-5-5', is_active: true, is_coming_soon: false, capability_tags: ['dashboard_chat', 'deep_reasoning'] },
    ];
    const saasDefaults = {
      'agent:sales_leads': 'qwen3.8-max',
      agent_fast: 'gpt-6-luna',
      __primary_model: 'claude-sonnet-5-5',
    };
    const resolvedAgentDefault = tryResolveModelSlot({
      slot: 'dashboard_chat',
      catalogRows: catalog,
      saasDefaultModels: saasDefaults,
      orgAiSettings: { selected_models: { __primary_model: 'claude-sonnet-5-5' } },
      agentConfig: { agent_key: 'sales_leads' },
    });
    expect(resolvedAgentDefault?.model).toBe('qwen3.8-max');
    expect(resolvedAgentDefault?.source).toBe('saas_agent_default');

    const resolvedRelayDefault = tryResolveModelSlot({
      slot: 'agent_fast',
      catalogRows: catalog,
      saasDefaultModels: saasDefaults,
      orgAiSettings: { selected_models: { __primary_model: 'claude-sonnet-5-5' } },
      agentConfig: { agent_key: 'sales_leads' },
      preferFastAgentModel: true,
    });
    expect(resolvedRelayDefault?.model).toBe('gpt-6-luna');
    expect(resolvedRelayDefault?.source).toBe('saas_slot_default');
  });
});
