import type { CSSProperties, FC } from 'react';
import type { BrandingConfig } from '../../theme/brandTheme';
import {
  readCachedLoadingBrandIdentity,
  type LoadingBrandIdentity,
} from '../../utils/loadingBrand';

type BrandLoadingScreenProps = {
  branding?: BrandingConfig | null;
  identity?: LoadingBrandIdentity | null;
  message?: string;
  className?: string;
  style?: CSSProperties;
};

const normalizeText = (value: unknown) => String(value || '').trim();

/**
 * لودر تمام‌صفحه‌ی مشترک. بدون تصویر یا GIF خارجی تا مسیر نخستین نمایش
 * سبک بماند و با اطلاعات cache شده‌ی همان hostname برند شخصی‌سازی شود.
 */
const BrandLoadingScreen: FC<BrandLoadingScreenProps> = ({
  branding,
  identity,
  message = 'در حال آماده‌سازی…',
  className = '',
  style,
}) => {
  const cachedIdentity = readCachedLoadingBrandIdentity();
  const resolvedIdentity = identity || cachedIdentity || {};
  const primaryName = normalizeText(resolvedIdentity.primaryName || branding?.appTitle || branding?.brandName || 'سامانه در حال آماده‌سازی است');
  const englishName = normalizeText(resolvedIdentity.englishName);
  const slogan = normalizeText(resolvedIdentity.slogan);
  const primaryColor = normalizeText(branding?.palette?.primary) || '#2563EB';
  const secondaryColor = normalizeText(branding?.palette?.secondary) || '#0F172A';

  return (
    <main
      className={`relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10 text-center ${className}`.trim()}
      style={{ background: `linear-gradient(145deg, ${secondaryColor} 0%, ${primaryColor} 130%)`, ...style }}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 15% 20%, rgba(255,255,255,.28), transparent 32%), radial-gradient(circle at 85% 80%, rgba(255,255,255,.16), transparent 30%)' }} />
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/15 bg-slate-950/10 px-7 py-10 shadow-[0_28px_90px_rgba(2,6,23,.28)] backdrop-blur-sm sm:px-12">
        <div className="relative mx-auto mb-7 flex h-16 w-16 items-center justify-center" aria-hidden="true">
          <span className="absolute inset-0 rounded-[1.35rem] border-2 border-white/30 animate-ping motion-reduce:animate-none" />
          <span className="absolute inset-1 rounded-[1.05rem] border border-white/70 rotate-45 animate-spin motion-reduce:animate-none" style={{ animationDuration: '3.2s' }} />
          <span className="h-5 w-5 rounded-full bg-white shadow-[0_0_28px_rgba(255,255,255,.95)]" />
        </div>
        {englishName ? <div className="mb-2 text-[11px] font-semibold tracking-[0.22em] text-white/65" dir="ltr">{englishName}</div> : null}
        <h1 className="text-2xl font-black leading-10 text-white sm:text-3xl">{primaryName}</h1>
        {slogan ? <p className="mt-3 text-sm leading-7 text-white/75">{slogan}</p> : null}
        <div className="mx-auto mt-7 h-px w-16 bg-white/30" />
        <p className="mt-4 text-xs font-medium text-white/70">{message}</p>
      </section>
    </main>
  );
};

export default BrandLoadingScreen;
