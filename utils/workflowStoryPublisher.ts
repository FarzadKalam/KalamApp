import { normalizePublicAssetUrl } from './assetUrl';

export const SYSTEM_STORY_PUBLISHER_TOKEN = 'system';

export type WorkflowStoryPublisherKind = 'system' | 'user';

export type WorkflowStoryPublisherOption = {
  label: string;
  value: string;
};

export type WorkflowStoryPublisherProfile = {
  id?: string | null;
  full_name?: string | null;
  email?: string | null;
  mobile_1?: string | null;
  avatar_url?: string | null;
};

export type ParsedWorkflowStoryPublisher = {
  kind: WorkflowStoryPublisherKind;
  userId: string | null;
};

export const buildWorkflowStoryPublisherUserToken = (userId: string) => `user:${String(userId || '').trim()}`;

export const parseWorkflowStoryPublisherToken = (value: unknown): ParsedWorkflowStoryPublisher => {
  const raw = String(value || '').trim();
  if (!raw || raw === SYSTEM_STORY_PUBLISHER_TOKEN) {
    return { kind: 'system', userId: null };
  }

  const match = raw.match(/^user:(.+)$/i);
  const userId = String(match?.[1] || '').trim();
  if (!userId) {
    return { kind: 'system', userId: null };
  }

  return {
    kind: 'user',
    userId,
  };
};

export const normalizeWorkflowStoryPublisherToken = (value: unknown) => {
  const parsed = parseWorkflowStoryPublisherToken(value);
  return parsed.kind === 'user' && parsed.userId
    ? buildWorkflowStoryPublisherUserToken(parsed.userId)
    : SYSTEM_STORY_PUBLISHER_TOKEN;
};

const getWorkflowStoryPublisherProfileLabel = (profile?: WorkflowStoryPublisherProfile | null) =>
  String(profile?.full_name || '').trim()
  || String(profile?.email || '').trim()
  || String(profile?.mobile_1 || '').trim()
  || 'کاربر بدون نام';

export const buildWorkflowStoryPublisherOptions = (
  profiles: WorkflowStoryPublisherProfile[]
): WorkflowStoryPublisherOption[] => {
  const optionsByValue = new Map<string, WorkflowStoryPublisherOption>();
  optionsByValue.set(SYSTEM_STORY_PUBLISHER_TOKEN, {
    label: 'سیستم',
    value: SYSTEM_STORY_PUBLISHER_TOKEN,
  });

  (Array.isArray(profiles) ? profiles : []).forEach((profile) => {
    const userId = String(profile?.id || '').trim();
    if (!userId) return;
    const token = buildWorkflowStoryPublisherUserToken(userId);
    if (optionsByValue.has(token)) return;
    optionsByValue.set(token, {
      label: getWorkflowStoryPublisherProfileLabel(profile),
      value: token,
    });
  });

  return Array.from(optionsByValue.values());
};

export type ResolvedWorkflowStoryPublisher = {
  kind: WorkflowStoryPublisherKind;
  creatorId: string | null;
  creatorName: string;
  creatorAvatar: string | null;
};

export const resolveSystemWorkflowStoryPublisher = (logoUrl?: string | null): ResolvedWorkflowStoryPublisher => ({
  kind: 'system',
  creatorId: null,
  creatorName: 'سیستم',
  creatorAvatar: normalizePublicAssetUrl(logoUrl) || null,
});

export const resolveUserWorkflowStoryPublisher = (
  profile: WorkflowStoryPublisherProfile | null | undefined
): ResolvedWorkflowStoryPublisher | null => {
  const userId = String(profile?.id || '').trim();
  if (!userId) return null;
  return {
    kind: 'user',
    creatorId: userId,
    creatorName: getWorkflowStoryPublisherProfileLabel(profile),
    creatorAvatar: normalizePublicAssetUrl(profile?.avatar_url) || null,
  };
};
