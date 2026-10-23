import React from 'react';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { BrandButton, Reveal } from '../primitives';
import BrandSymbol from '../shared/BrandSymbol';
import { DEMO_URL, sitePath } from '../siteLinks';
import type { CtaConfig } from '../types';

interface ProductHeroProps {
  eyebrow?: string;
  titleBefore?: string;
  highlight?: string;
  titleAfter?: string;
  subtitle?: string;
  finale?: string;
  primaryCta?: CtaConfig;
  secondaryCta?: CtaConfig;
}

const ProductHeroSection: React.FC<{ props: ProductHeroProps }> = ({ props }) => {
  const primary = props.primaryCta ?? { label: 'شروع رایگان', href: DEMO_URL };
  const secondary = props.secondaryCta ?? { label: 'مشاهده امکانات', href: sitePath('/features') };
  return (
    <section className="product-hero symbol-hero" aria-label="معرفی تازه سیستم">
      <div className="product-hero__layout">
        <Reveal className="product-hero__copy" y={18}>
          <p className="site-eyebrow"><span aria-hidden="true" />{props.eyebrow || 'تازه سیستم'}</p>
          <h1>{props.titleBefore}<span className="product-hero__highlight">{props.highlight}</span>{props.titleAfter}</h1>
          <p className="product-hero__description">{props.subtitle}</p>
          <p className="symbol-hero__finale">{props.finale || 'همه چیز همین جاست!'}</p>
          <div className="product-hero__actions">
            <BrandButton href={primary.href}>{primary.label}<ArrowLeftOutlined aria-hidden="true" /></BrandButton>
            <BrandButton href={secondary.href} variant="outline">{secondary.label}</BrandButton>
          </div>
        </Reveal>
        <Reveal className="symbol-hero__visual" delay={.1} y={20}><BrandSymbol /></Reveal>
      </div>
    </section>
  );
};

export default ProductHeroSection;
