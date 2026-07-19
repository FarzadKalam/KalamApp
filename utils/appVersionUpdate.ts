export interface AppReleaseNotes {
  version: string;
  releasedAt?: string;
  changes: string[];
}

export interface AppVersionManifest extends AppReleaseNotes {
  releases: AppReleaseNotes[];
}

export type AppVersionBannerMode = 'available' | 'completed';

interface RefreshIntent {
  targetVersion: string;
  requestedAt: number;
  attempts: number;
}

export const CURRENT_APP_VERSION = String(import.meta.env.VITE_APP_VERSION || '0.0.0').trim();
export const APP_VERSION_MANIFEST_URL = '/version.json';

const REFRESH_INTENT_KEY = 'tazesystem:app-update-refresh-intent:v1';
const REFRESH_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REFRESH_ATTEMPTS_PER_VERSION = 3;
const MANIFEST_MEMORY_TTL_MS = 60_000;

let manifestRequestPromise: Promise<AppVersionManifest> | null = null;
let latestManifestSnapshot: { value: AppVersionManifest; fetchedAt: number } | null = null;

const normalizeVersion = (value?: string | null) => String(value || '').trim();

const parseSemverParts = (value: string) => {
  const normalized = normalizeVersion(value).replace(/^v/i, '').split(/[+-]/)[0];
  const parts = normalized.split('.');
  if (parts.length === 0 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.map((part) => Number(part));
};

export const compareAppVersions = (left: string, right: string) => {
  const leftParts = parseSemverParts(left);
  const rightParts = parseSemverParts(right);

  if (!leftParts || !rightParts) {
    const normalizedLeft = normalizeVersion(left);
    const normalizedRight = normalizeVersion(right);
    if (normalizedLeft === normalizedRight) return 0;
    return normalizedLeft > normalizedRight ? 1 : -1;
  }

  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
};

export const isNewerAppVersion = (remoteVersion: string, currentVersion = CURRENT_APP_VERSION) =>
  compareAppVersions(remoteVersion, currentVersion) > 0;

export const resolveAppVersionBannerMode = (
  remoteVersion: string,
  currentVersion: string,
  completedVersion?: string | null
): AppVersionBannerMode | null => {
  if (isNewerAppVersion(remoteVersion, currentVersion)) return 'available';
  if (
    completedVersion
    && compareAppVersions(currentVersion, completedVersion) >= 0
    && compareAppVersions(remoteVersion, completedVersion) >= 0
  ) {
    return 'completed';
  }
  return null;
};

const readRefreshIntent = (): RefreshIntent | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REFRESH_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RefreshIntent>;
    const targetVersion = normalizeVersion(parsed.targetVersion);
    if (!targetVersion) return null;
    return {
      targetVersion,
      requestedAt: Number(parsed.requestedAt || 0),
      attempts: Number(parsed.attempts || 0),
    };
  } catch {
    return null;
  }
};

const writeRefreshIntent = (intent: RefreshIntent) => {
  try {
    window.localStorage.setItem(REFRESH_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // localStorage may be unavailable in private or restricted contexts.
  }
};

const recordRefreshIntent = (targetVersion: string) => {
  const now = Date.now();
  const previous = readRefreshIntent();
  const sameRecentTarget = Boolean(
    previous
    && previous.targetVersion === targetVersion
    && now - previous.requestedAt < REFRESH_ATTEMPT_WINDOW_MS
  );

  writeRefreshIntent({
    targetVersion,
    requestedAt: now,
    attempts: sameRecentTarget ? previous!.attempts + 1 : 1,
  });
};

export const hasReachedRefreshAttemptLimit = (targetVersion: string) => {
  const previous = readRefreshIntent();
  if (!previous || previous.targetVersion !== targetVersion) return false;
  if (Date.now() - previous.requestedAt > REFRESH_ATTEMPT_WINDOW_MS) return false;
  return previous.attempts >= MAX_REFRESH_ATTEMPTS_PER_VERSION;
};

export const consumeCompletedAppRefreshIntent = (currentVersion = CURRENT_APP_VERSION) => {
  const previous = readRefreshIntent();
  if (!previous) return null;
  if (compareAppVersions(currentVersion, previous.targetVersion) < 0) return null;

  try {
    window.localStorage.removeItem(REFRESH_INTENT_KEY);
  } catch {
    // ignore storage cleanup failures
  }
  return previous.targetVersion;
};

const normalizeReleaseNotes = (value: unknown): AppReleaseNotes | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AppReleaseNotes>;
  const version = normalizeVersion(candidate.version);
  if (!version) return null;

  return {
    version,
    releasedAt: typeof candidate.releasedAt === 'string' ? candidate.releasedAt : undefined,
    changes: Array.isArray(candidate.changes)
      ? candidate.changes.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
};

export const validateAppVersionManifest = (value: unknown): AppVersionManifest | null => {
  const currentRelease = normalizeReleaseNotes(value);
  if (!currentRelease) return null;

  const candidate = value as Partial<AppVersionManifest>;
  const releases = Array.isArray(candidate.releases)
    ? candidate.releases.map(normalizeReleaseNotes).filter((release): release is AppReleaseNotes => Boolean(release))
    : [];
  const uniqueReleases = new Map<string, AppReleaseNotes>();
  [currentRelease, ...releases].forEach((release) => {
    if (!uniqueReleases.has(release.version)) uniqueReleases.set(release.version, release);
  });

  return {
    ...currentRelease,
    releases: Array.from(uniqueReleases.values()).sort(
      (left, right) => compareAppVersions(right.version, left.version)
    ),
  };
};

export const fetchAppVersionManifest = async (_signal?: AbortSignal) => {
  const now = Date.now();
  if (latestManifestSnapshot && now - latestManifestSnapshot.fetchedAt < MANIFEST_MEMORY_TTL_MS) {
    return latestManifestSnapshot.value;
  }
  if (manifestRequestPromise) return manifestRequestPromise;

  const url = `${APP_VERSION_MANIFEST_URL}?t=${Date.now()}`;
  manifestRequestPromise = (async () => {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Version manifest request failed with ${response.status}`);
    }

    const manifest = validateAppVersionManifest(await response.json());
    if (!manifest) {
      throw new Error('Version manifest is invalid');
    }
    latestManifestSnapshot = { value: manifest, fetchedAt: Date.now() };
    return manifest;
  })();

  try {
    return await manifestRequestPromise;
  } finally {
    manifestRequestPromise = null;
  }
};

const updateServiceWorkers = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(
    registrations.map(async (registration) => {
      await registration.update().catch(() => undefined);
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    })
  );
};

export const prepareAppRefresh = async (targetVersion: string, options?: { force?: boolean }) => {
  const version = normalizeVersion(targetVersion);
  if (!version) throw new Error('نسخه مقصد معتبر نیست.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('برای بروزرسانی، اتصال اینترنت لازم است.');
  }
  if (!options?.force && hasReachedRefreshAttemptLimit(version)) {
    throw new Error('بروزرسانی خودکار چند بار ناموفق بوده است. لطفا کمی بعد دوباره تلاش کنید.');
  }

  recordRefreshIntent(version);
  await updateServiceWorkers();
};
