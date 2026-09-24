import { useCallback, useEffect, useState } from 'react';
import { Button } from 'antd';
import { supabase } from '../../supabaseClient';
import { signOutLocalSession } from '../../utils/authSession';
import { clearRuntimeBrandingCache } from '../../utils/brandingRuntime';
import { clearCurrentUserRoleContextCache } from '../../utils/permissions';
import { clearReferenceDataCache } from '../../utils/referenceData';
import { clearSessionBootstrapCache } from '../../utils/sessionCache';
import { validateTenantHostSessionAccess } from '../../utils/tenantHostSessionAccess';

type AccessState = 'checking' | 'allowed' | 'unverified' | 'denied';

const clearTenantScopedClientState = () => {
  clearSessionBootstrapCache();
  clearCurrentUserRoleContextCache();
  clearReferenceDataCache();
  clearRuntimeBrandingCache();
};

/**
 * محتوای خصوصی tenant تا زمان تطبیق نشست با host رندر نمی‌شود.
 * این گارد نشست‌های قدیمی، بازگشت از حالت آفلاین و refresh را نیز پوشش می‌دهد.
 */
const TenantHostSessionBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [retryToken, setRetryToken] = useState(0);

  const validateAccess = useCallback(async () => {
    setAccessState('checking');
    const result = await validateTenantHostSessionAccess(supabase);
    if (result.status !== 'denied') {
      setAccessState(result.status);
      return;
    }

    clearTenantScopedClientState();
    await signOutLocalSession();
    setAccessState('denied');
  }, []);

  useEffect(() => {
    void validateAccess();
  }, [retryToken, validateAccess]);

  useEffect(() => {
    if (accessState !== 'denied') return;
    const timeoutId = window.setTimeout(() => {
      window.location.replace('/login?tenant_access=denied');
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [accessState]);

  if (accessState === 'allowed') return <>{children}</>;

  const isDenied = accessState === 'denied';
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      dir="rtl"
    >
      <div className="text-lg font-semibold">
        {isDenied ? 'این حساب به سازمان این آدرس دسترسی ندارد' : 'در حال بررسی دسترسی سازمان'}
      </div>
      <div className="max-w-md text-sm text-gray-500">
        {isDenied
          ? 'برای ورود به این سازمان، با حسابی وارد شوید که به همین سازمان دسترسی دارد.'
          : 'تا تأیید اتصال امن به سازمان، اطلاعات نمایش داده نمی‌شود.'}
      </div>
      {!isDenied ? (
        <Button type="primary" onClick={() => setRetryToken((value) => value + 1)}>
          تلاش مجدد
        </Button>
      ) : null}
    </div>
  );
};

export default TenantHostSessionBoundary;
