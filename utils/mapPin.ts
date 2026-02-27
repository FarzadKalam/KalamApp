type MapPinSize = 'sm' | 'md';

type CreateThemeMapPinOptions = {
  size?: MapPinSize;
  interactive?: boolean;
};

const SIZE_MAP: Record<MapPinSize, { width: number; height: number }> = {
  sm: { width: 22, height: 30 },
  md: { width: 26, height: 36 },
};

export const createThemeMapPinElement = (options?: CreateThemeMapPinOptions): HTMLButtonElement => {
  const size = options?.size || 'md';
  const interactive = options?.interactive !== false;
  const { width, height } = SIZE_MAP[size];

  const element = document.createElement('button');
  element.type = 'button';
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.padding = '0';
  element.style.margin = '0';
  element.style.border = '0';
  element.style.background = 'transparent';
  element.style.display = 'block';
  element.style.lineHeight = '0';
  element.style.cursor = interactive ? 'pointer' : 'default';
  element.style.pointerEvents = interactive ? 'auto' : 'none';
  element.style.transformOrigin = '50% 100%';
  element.style.transition = 'filter 140ms ease';
  element.style.filter = 'drop-shadow(0 6px 10px rgb(var(--brand-700-rgb) / 0.22))';

  element.innerHTML = `
    <svg viewBox="0 0 24 30" width="${width}" height="${height}" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      <path d="M12 1C6.48 1 2 5.48 2 11c0 7.57 8.95 17.78 9.33 18.21a.9.9 0 0 0 1.34 0C13.05 28.78 22 18.57 22 11c0-5.52-4.48-10-10-10z" fill="rgb(var(--brand-600-rgb))" stroke="rgb(var(--brand-700-rgb))" stroke-width="1.2" />
      <circle cx="12" cy="11" r="4.8" fill="#fff" />
      <circle cx="12" cy="11" r="2.1" fill="rgb(var(--brand-600-rgb))" />
    </svg>
  `;

  if (interactive) {
    element.onmouseenter = () => {
      element.style.filter = 'drop-shadow(0 8px 13px rgb(var(--brand-700-rgb) / 0.30))';
    };
    element.onmouseleave = () => {
      element.style.filter = 'drop-shadow(0 6px 10px rgb(var(--brand-700-rgb) / 0.22))';
    };
  }

  return element;
};
