import React, { useEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

// Pointer values stay outside React state so pointer movement never rerenders
// the page. Coarse pointers and reduced-motion retain the neutral composition.
const BrandSymbol: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 100, damping: 24 });
  const smoothY = useSpring(pointerY, { stiffness: 100, damping: 24 });
  const rotateY = useTransform(smoothX, [-1, 1], [-16, 16]);
  const rotateX = useTransform(smoothY, [-1, 1], [14, -14]);
  const x = useTransform(smoothX, [-1, 1], [-12, 12]);
  const y = useTransform(smoothY, [-1, 1], [-9, 9]);
  const lightX = useTransform(smoothX, [-1, 1], ['-85%', '-15%']);
  const lightY = useTransform(smoothY, [-1, 1], ['-85%', '-15%']);

  useEffect(() => {
    const hero = root.current?.closest('section');
    if (!hero || reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const reset = () => { pointerX.set(0); pointerY.set(0); };
    const track = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const bounds = hero.getBoundingClientRect();
      pointerX.set(Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)));
      pointerY.set(Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)));
    };
    hero.addEventListener('pointermove', track, { passive: true });
    hero.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    return () => {
      hero.removeEventListener('pointermove', track);
      hero.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [reduceMotion, pointerX, pointerY]);

  return (
    <div ref={root} className="brand-symbol" aria-label="نشان تعاملی تازه سیستم">
      <div className="brand-symbol__shadow" aria-hidden="true" />
      <motion.div className="brand-symbol__object" style={{ rotateX: reduceMotion ? 0 : rotateX, rotateY: reduceMotion ? 0 : rotateY, x: reduceMotion ? 0 : x, y: reduceMotion ? 0 : y }}>
        <div className="brand-symbol__orbit brand-symbol__orbit--outer" aria-hidden="true" />
        <div className="brand-symbol__orbit brand-symbol__orbit--inner" aria-hidden="true" />
        <div className="brand-symbol__layer brand-symbol__layer--back" aria-hidden="true" />
        <div className="brand-symbol__layer brand-symbol__layer--middle" aria-hidden="true" />
        <div className="brand-symbol__core">
          <img src="/tazesystem_logo.png" width="210" height="210" alt="تازه سیستم" draggable={false} />
          <motion.div className="brand-symbol__light" style={{ x: reduceMotion ? '-50%' : lightX, y: reduceMotion ? '-50%' : lightY }} aria-hidden="true" />
        </div>
        <span className="brand-symbol__word brand-symbol__word--one">مشتریان</span>
        <span className="brand-symbol__word brand-symbol__word--two">پروژه‌ها</span>
        <span className="brand-symbol__word brand-symbol__word--three">حسابداری</span>
        <span className="brand-symbol__word brand-symbol__word--four">ارتباطات</span>
        <span className="brand-symbol__word brand-symbol__word--five">هوش مصنوعی</span>
      </motion.div>
      <p className="brand-symbol__signature">ابزارهای کمتر. هماهنگی بیشتر.</p>
    </div>
  );
};

export default BrandSymbol;
