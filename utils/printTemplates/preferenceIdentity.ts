export type PrintPreferenceIdentity = {
  orgId: string;
  userId: string | null;
};

type SessionSnapshotLike = {
  orgId?: string | null;
  user?: { id?: string | null } | null;
};

/**
 * Preferences are tenant-owned. When a modal opens before the session cache
 * settles, resolve its identity once more instead of silently discarding a
 * user's save action.
 */
export const resolvePrintPreferenceIdentity = async ({
  currentOrgId,
  currentUserId,
  loadSession,
}: {
  currentOrgId?: string | null;
  currentUserId?: string | null;
  loadSession: () => Promise<SessionSnapshotLike | null | undefined>;
}): Promise<PrintPreferenceIdentity | null> => {
  const knownOrgId = String(currentOrgId || '').trim();
  const knownUserId = String(currentUserId || '').trim() || null;
  if (knownOrgId) return { orgId: knownOrgId, userId: knownUserId };

  const snapshot = await loadSession().catch(() => null);
  const orgId = String(snapshot?.orgId || '').trim();
  if (!orgId) return null;
  return {
    orgId,
    userId: knownUserId || String(snapshot?.user?.id || '').trim() || null,
  };
};
