import React, { useState } from 'react';
import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { BrandButton, Reveal } from '../primitives';
import { renderIcon } from '../iconMap';
import { DEMO_URL, sitePath } from '../siteLinks';
import type { CtaConfig } from '../types';
import { DEFAULT_HOME_SECTIONS } from '../defaultLandingConfig';

interface ProductFlow {
  icon?: string;
  title: string;
  text?: string;
  previewTitle?: string;
  previewValue?: string;
  previewLabel?: string;
  previewItems?: string[];
  previewMedia?: string;
}

interface ProductHeroProps {
  eyebrow?: string;
  titleBefore?: string;
  highlight?: string;
  titleAfter?: string;
  subtitle?: string;
  media?: string;
  caption?: string;
  primaryCta?: CtaConfig;
  secondaryCta?: CtaConfig;
  nodes?: ProductFlow[];
}

const ProductHeroSection: React.FC<{ props: ProductHeroProps }> = ({ props }) => {
  const [selected, setSelected] = useState(0);
  const reduceMotion = useReducedMotion();
  const flows = props.nodes ?? [];
  const active = flows[selected] ?? flows[0];
  const defaultFlows: ProductFlow[] = DEFAULT_HOME_SECTIONS.find(section => section.type === 'hero_tree')?.props.nodes ?? [];
  const media = active?.previewMedia || props.media || defaultFlows.find(flow => flow.icon === active?.icon)?.previewMedia || '/assets/tutorials/customers-list.png';
  const primary = props.primaryCta ?? { label: 'شروع رایگان', href: DEMO_URL };
  const secondary = props.secondaryCta ?? { label: 'کشف امکانات', href: sitePath('/features') };

  return (
    <section className="product-hero" aria-label="معرفی تازه سیستم">
      <div className="product-hero__layout">
        <Reveal className="product-hero__copy" y={18}>
          <p className="site-eyebrow"><span aria-hidden="true" />{props.eyebrow || 'یک فضای مشترک برای تمام کسب‌وکار'}</p>
          <h1>{props.titleBefore || 'از اولین ارتباط تا آخرین پیگیری، '}
            <span className="product-hero__highlight">{props.highlight || 'همه‌چیز روشن است.'}</span>
            {props.titleAfter}
          </h1>
          <p className="product-hero__description">{props.subtitle || 'مشتری، فروش، تیم و حسابداری را در یک فضای فارسی به هم وصل کنید؛ با مسئول مشخص، سابقهٔ کامل و قدم بعدی روشن.'}</p>
          <div className="product-hero__actions">
            <BrandButton href={primary.href}>{primary.label}<ArrowLeftOutlined aria-hidden="true" /></BrandButton>
            <BrandButton href={secondary.href} variant="outline">{secondary.label}</BrandButton>
          </div>
          <ul className="product-hero__assurances" aria-label="ویژگی‌های فضای کاری">
            {['فارسی و تقویم شمسی', 'دسترسی بر اساس نقش', 'ابری و همراه تیم شما'].map(text => <li key={text}><CheckOutlined aria-hidden="true" />{text}</li>)}
          </ul>
        </Reveal>

        <Reveal className="product-hero__visual" delay={0.12} y={24}>
          <div className="product-preview">
            <div className="product-preview__bar">
              <span className="product-preview__identity"><img src="/tazesystem_logo.png" width="28" height="28" alt="" />فضای کار تازه سیستم</span>
              <span className="product-preview__sample">داده‌های نمونه</span>
            </div>
            {flows.length > 0 && <div className="product-preview__flows" aria-label="انتخاب نمای محصول">
              {flows.map((flow, index) => <button key={`${flow.title}-${index}`} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>
                {renderIcon(flow.icon)}<span>{flow.title}</span>
              </button>)}
            </div>}
            <div className="product-preview__screen">
              <img src={media} alt={`نمای نمونهٔ ${active?.title || 'مدیریت مشتریان'} در تازه سیستم`} width="1536" height="1024" fetchPriority="high" />
            </div>
            <motion.div key={`${selected}-${active?.title}`} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="product-preview__summary">
              <div><span className="product-preview__label">{active?.previewTitle || 'اطلاعات مشتری، همیشه در دسترس'}</span><strong>{active?.previewValue}<small>{active?.previewLabel || active?.text}</small></strong></div>
              <ul>{active?.previewItems?.slice(0, 2).map(item => <li key={item}><CheckOutlined aria-hidden="true" />{item}</li>)}</ul>
            </motion.div>
          </div>
          <p className="product-hero__caption">{props.caption || 'یک تصویر مشترک از کار؛ برای همهٔ اعضای تیم.'}</p>
        </Reveal>
      </div>
      <div className="product-hero__foundation"><span>همهٔ بخش‌ها، متصل به یکدیگر</span><p>مشتریان و فروش <i aria-hidden="true">/</i> پروژه و فرآیند <i aria-hidden="true">/</i> ارتباطات <i aria-hidden="true">/</i> حسابداری <i aria-hidden="true">/</i> هوش مصنوعی</p></div>
    </section>
  );
};

export default ProductHeroSection;
