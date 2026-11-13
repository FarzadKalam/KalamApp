import React, { useId, useRef, useState } from 'react';
import { PauseOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useInView, useReducedMotion } from 'framer-motion';
import { ECOSYSTEM_STATUS_LABELS, PUBLIC_ECOSYSTEM_GROUPS, type EcosystemItem } from '../../../shared/publicEcosystem.mjs';
import { TAZE_SYSTEM_BRAND_ASSETS } from '../../../utils/tazeSystemBrandAssets';
import { renderIcon } from '../iconMap';
import { SectionHeading, SectionShell } from '../primitives';
import './ecosystemOrbit.css';

const IntegrationMark = ({ item }: { item: EcosystemItem }) => {
  const [failed, setFailed] = useState(false);
  return item.logo && !failed
    ? <img src={item.logo} alt="" width={30} height={30} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span aria-hidden="true">{item.icon ? renderIcon(item.icon) : item.name.slice(0, 1)}</span>;
};

type OrbitProps = { eyebrow?: string; title?: string; text?: string };

// Uses the existing integrations section key, including already-published CMS pages.
// The product catalog is public metadata, never a list of a visitor's org connections.
const EcosystemOrbitSection: React.FC<{ props: OrbitProps }> = ({ props }) => {
  const sectionId = useId();
  const canvas = useRef<HTMLDivElement>(null);
  const inView = useInView(canvas, { amount: 0.15 });
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [groupId, setGroupId] = useState('communications');
  const [selected, setSelected] = useState<EcosystemItem | null>(null);
  const [hovered, setHovered] = useState<EcosystemItem | null>(null);
  const group = PUBLIC_ECOSYSTEM_GROUPS.find((item) => item.id === groupId) ?? PUBLIC_ECOSYSTEM_GROUPS[0];
  const current = hovered ?? selected;
  const detailId = `${sectionId}-detail`;

  const selectGroup = (id: string) => {
    setGroupId(id);
    setSelected(null);
    setHovered(null);
  };

  return (
    <SectionShell tone="soft" className="ecosystem-section" id="ecosystem">
      <SectionHeading
        eyebrow={props.eyebrow ?? 'زیست‌بوم تازه سیستم'}
        title={props.title ?? 'ابزارهای شما، در مدار یک سیستم'}
        text={props.text ?? 'از هوش مصنوعی و ارتباط با مشتری تا فروشگاه و حسابداری؛ همه در کنار یک فضای کار مشترک.'}
      />
      <div className="ecosystem-layout">
        <div className="ecosystem-content">
          <p className="ecosystem-intro">یک مرکز برای کارهای شما؛ چهار مدار برای ابزارهایی که به آن قدرت می‌دهند.</p>
          <div className="ecosystem-groups" role="group" aria-label="دسته‌بندی زیست‌بوم">
            {PUBLIC_ECOSYSTEM_GROUPS.map((item, index) => (
              <button key={item.id} type="button" aria-pressed={groupId === item.id} onClick={() => selectGroup(item.id)}>
                <span className="ecosystem-group-number" aria-hidden="true">{(index + 1).toLocaleString('fa-IR')}</span>
                <span><strong>{item.title}</strong><small>{item.caption}</small></span>
                <span className="ecosystem-group-count">{item.items.length.toLocaleString('fa-IR')}</span>
              </button>
            ))}
          </div>
          <div className="ecosystem-detail" id={detailId} aria-live="polite" aria-atomic="true">
            {current ? <>
              <div className="ecosystem-detail-title"><IntegrationMark key={current.id} item={current} /><h3>{current.name}</h3><span data-status={current.status}>{ECOSYSTEM_STATUS_LABELS[current.status]}</span></div>
              <p>{current.description}</p>
            </> : <>
              <h3>{group.title}</h3>
              <p>{group.description}</p>
              <small>برای آشنایی با هر نماد، روی آن بروید یا آن را لمس کنید.</small>
            </>}
          </div>
          <p className="ecosystem-disclaimer">«پشتیبانی می‌شود» به معنی وجود قابلیت در محصول است؛ استفاده به پلن، تنظیمات و حساب سرویس سازمان شما بستگی دارد. موارد «در حال توسعه» هنوز قابل استفاده نیستند.</p>
        </div>
        <div className="ecosystem-visual">
          <div ref={canvas} className="ecosystem-canvas" data-paused={paused || !inView || !!reducedMotion} data-selected-group={groupId}>
            <div className="ecosystem-center">
              <img src={TAZE_SYSTEM_BRAND_ASSETS.logo} alt="تازه سیستم، مرکز زیست‌بوم" width={64} height={64} loading="lazy" />
            </div>
            {PUBLIC_ECOSYSTEM_GROUPS.map((ring, ringIndex) => (
              <ul key={ring.id} className="ecosystem-ring" aria-label={ring.title} data-group={ring.id} data-highlighted={ring.id === groupId} style={{
                '--radius': `${ring.radius}px`, '--lap': `${ring.duration}s`, '--direction': ring.reverse ? 'reverse' : 'normal', '--counter-direction': ring.reverse ? 'normal' : 'reverse',
              } as React.CSSProperties}>
                {ring.items.map((item, index) => {
                  const angle = (index / ring.items.length) * Math.PI * 2 + ringIndex * 0.43;
                  return <li key={item.id} className="ecosystem-node" style={{ '--x': Math.cos(angle), '--y': Math.sin(angle) } as React.CSSProperties}>
                    <button type="button" className="ecosystem-orb" data-status={item.status} aria-label={`${item.name}؛ ${ECOSYSTEM_STATUS_LABELS[item.status]}`} aria-pressed={selected?.id === item.id} aria-controls={detailId}
                      onMouseEnter={() => setHovered(item)} onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(item)} onBlur={() => setHovered(null)}
                      onClick={() => { setGroupId(ring.id); setSelected(item); setHovered(null); }}
                      onKeyDown={(event) => { if (event.key === 'Escape') { setSelected(null); setHovered(null); } }}>
                      <IntegrationMark item={item} />
                      {item.status === 'development' && <span className="ecosystem-development-dot" aria-hidden="true" />}
                      <span className="ecosystem-orb-label" aria-hidden="true">{item.name}{item.status === 'development' && <small>در حال توسعه</small>}</span>
                    </button>
                  </li>;
                })}
              </ul>
            ))}
          </div>
          <div className="ecosystem-controls">
            <span><i aria-hidden="true" /> در حال توسعه</span>
            <button type="button" onClick={() => setPaused((value) => !value)} aria-pressed={paused} disabled={!!reducedMotion}>
              {paused || reducedMotion ? <PlayCircleOutlined /> : <PauseOutlined />}
              {reducedMotion ? 'نمایش بدون حرکت' : paused ? 'ادامهٔ حرکت' : 'توقف حرکت'}
            </button>
          </div>
        </div>
      </div>
      <div className="ecosystem-directory">
        <h3>{group.title}</h3>
        <div className="ecosystem-directory-items" role="group" aria-label={`فهرست ${group.title}`}>
          {group.items.map((item) => <button type="button" key={item.id} aria-pressed={selected?.id === item.id} aria-controls={detailId} onClick={() => { setSelected(item); setHovered(null); }}>
            <IntegrationMark item={item} /><span>{item.name}</span>{item.status === 'development' && <small>در حال توسعه</small>}
          </button>)}
        </div>
      </div>
    </SectionShell>
  );
};

export default EcosystemOrbitSection;
