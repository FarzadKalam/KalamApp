import { getAgentTitleFa, type AgentKey } from './ai-agent-catalog.ts';
import { canViewModulePermission, normalizeId, sharedRestSelect } from './ai-grounding.ts';

export type StaffRelayRequest = {
  supabaseUrl: string;
  serviceRoleKey: string;
  orgId: string;
  agentKey: AgentKey;
  recipientUserIds: string[];
  content: string;
  moduleId?: string | null;
  recordId?: string | null;
  requestedByUserId?: string | null;
  priority?: number;
  cooldownKey?: string | null;
  cooldownMinutes?: number;
  waitingApprovalId?: string | null;
  relayKind?: 'followup' | 'relay_question' | 'approval_request' | 'reminder' | 'background_insight';
  attachments?: Array<{ name: string; url: string; mimeType?: string }>;
  requiredModuleForRecipient?: string | null;
};

const serviceHeaders = (serviceRoleKey: string, prefer = 'return=representation') => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Prefer: prefer,
});

const restWrite = async (supabaseUrl: string, serviceRoleKey: string, path: string, method: string, body: any) => {
  const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${path}`, {
    method,
    headers: serviceHeaders(serviceRoleKey),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `REST ${method} ${path} failed (${res.status})`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

export const relayAgentMessageToStaff = async (req: StaffRelayRequest): Promise<{
  sent: boolean;
  skippedReason?: string;
  recipientIds: string[];
  noteId?: string | null;
}> => {
  const orgId = normalizeId(req.orgId);
  const content = String(req.content || '').trim();
  if (!orgId || !content) {
    return { sent: false, skippedReason: 'سازمان یا متن پیام مشخص نیست.', recipientIds: [] };
  }

  const candidateIds = Array.from(
    new Set((req.recipientUserIds || []).map((id) => normalizeId(id)).filter(Boolean)),
  );
  if (!candidateIds.length) {
    return { sent: false, skippedReason: 'هیچ همکار گیرنده‌ای مشخص نشده است.', recipientIds: [] };
  }

  // Cooldown guard so background/relay messages don't spam the same colleague
  if (req.cooldownKey) {
    const existingCooldown = await sharedRestSelect(req.supabaseUrl, req.serviceRoleKey, 'ai_background_cooldowns', {
      org_id: `eq.${orgId}`,
      agent_key: `eq.${req.agentKey}`,
      cooldown_key: `eq.${req.cooldownKey}`,
      select: 'id,next_eligible_at',
      limit: 1,
    });
    const nextMs = Date.parse(String(existingCooldown?.[0]?.next_eligible_at || ''));
    if (Number.isFinite(nextMs) && nextMs > Date.now()) {
      return { sent: false, skippedReason: 'در بازه توقف موقت (Cooldown) قرار دارد.', recipientIds: [] };
    }
  }

  // Verify every recipient strictly belongs to the same active organization and has module RBAC if requested
  const profileRows = await sharedRestSelect(req.supabaseUrl, req.serviceRoleKey, 'profiles', {
    org_id: `eq.${orgId}`,
    is_active: 'eq.true',
    id: `in.(${candidateIds.map(encodeURIComponent).join(',')})`,
    select: 'id,role_id,full_name',
  });

  if (!profileRows.length) {
    return { sent: false, skippedReason: 'همکار فعال در این سازمان پیدا نشد.', recipientIds: [] };
  }

  let rolePermissionsById = new Map<string, any>();
  if (req.requiredModuleForRecipient) {
    const roleIds = Array.from(new Set(profileRows.map((p: any) => normalizeId(p.role_id)).filter(Boolean)));
    if (roleIds.length) {
      const roleRows = await sharedRestSelect(req.supabaseUrl, req.serviceRoleKey, 'org_roles', {
        org_id: `eq.${orgId}`,
        id: `in.(${roleIds.map(encodeURIComponent).join(',')})`,
        select: 'id,permissions',
      });
      rolePermissionsById = new Map(roleRows.map((r: any) => [String(r.id), r.permissions || {}]));
    }
  }

  const permittedRecipientIds = profileRows
    .filter((p: any) => {
      if (!req.requiredModuleForRecipient) return true;
      const perms = rolePermissionsById.get(normalizeId(p.role_id));
      return Boolean(perms && (perms.__settings_tabs?.edit === true || canViewModulePermission(perms, req.requiredModuleForRecipient)));
    })
    .map((p: any) => String(p.id));

  if (!permittedRecipientIds.length) {
    return { sent: false, skippedReason: 'گیرنده‌ها دسترسی لازم به این بخش را ندارند.', recipientIds: [] };
  }

  const conversationKey = `agent:${req.agentKey}`;
  const notePayload = {
    org_id: orgId,
    module_id: req.moduleId || null,
    record_id: req.recordId || null,
    content,
    author_id: null,
    author_name: getAgentTitleFa(req.agentKey),
    source_type: 'ai',
    mention_user_ids: permittedRecipientIds,
    mention_role_ids: [],
    is_edited: false,
    metadata: {
      source_type: 'ai',
      agent_key: req.agentKey,
      conversation_key: conversationKey,
      priority: Number.isFinite(Number(req.priority)) ? Number(req.priority) : 10,
      relay_kind: req.relayKind || 'followup',
      requested_by_user_id: req.requestedByUserId || null,
      target_module_id: req.moduleId || null,
      target_record_id: req.recordId || null,
      waiting_approval_id: req.waitingApprovalId || null,
      attachments: Array.isArray(req.attachments) ? req.attachments : [],
    },
  };

  const inserted = await restWrite(req.supabaseUrl, req.serviceRoleKey, 'notes', 'POST', notePayload);
  const noteId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;

  if (req.cooldownKey) {
    const cooldownMins = Math.max(5, Number(req.cooldownMinutes ?? 120));
    const nowIso = new Date().toISOString();
    const nextIso = new Date(Date.now() + cooldownMins * 60 * 1000).toISOString();
    await restWrite(
      req.supabaseUrl,
      req.serviceRoleKey,
      'ai_background_cooldowns?on_conflict=org_id,agent_key,cooldown_key',
      'POST',
      {
        org_id: orgId,
        agent_key: req.agentKey,
        cooldown_key: req.cooldownKey,
        last_triggered_at: nowIso,
        next_eligible_at: nextIso,
        metadata: { last_note_id: noteId || null, recipient_count: permittedRecipientIds.length },
      },
    ).catch((err) => console.warn('cooldown upsert skipped', err));
  }

  return {
    sent: true,
    recipientIds: permittedRecipientIds,
    noteId: noteId || null,
  };
};
