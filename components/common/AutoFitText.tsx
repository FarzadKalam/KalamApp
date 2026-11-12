import { useLayoutEffect, useRef } from 'react';
import './AutoFitText.css';

/** Shrinks a single complete value to its container, without truncating digits. */
export default function AutoFitText({ children }: { children: string }) {
  const outer = useRef<HTMLSpanElement>(null), inner = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = outer.current, text = inner.current;
    if (!container || !text) return;
    const fit = () => {
      text.style.fontSize = '';
      const available = container.clientWidth;
      if (!available) return;
      const base = Number.parseFloat(getComputedStyle(text).fontSize);
      const natural = text.scrollWidth;
      if (natural > available) text.style.fontSize = `${base * available / natural}px`;
    };
    fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    observer?.observe(container);
    let active = true;
    void document.fonts?.ready.then(() => { if (active) fit(); });
    return () => { active = false;observer?.disconnect(); };
  }, [children]);
  return <span ref={outer} className="auto-fit-text"><span ref={inner}>{children}</span></span>;
}
