import React, { useState } from 'react';
import { Modal } from 'antd';
import { ExpandOutlined } from '@ant-design/icons';
import { PRODUCT_MEDIA } from '../productMedia';

const ProductScreenshot: React.FC<{ src: string; alt?: string; className?: string }> = ({ src, alt, className = '' }) => {
  const [open, setOpen] = useState(false);
  const asset = Object.values(PRODUCT_MEDIA).find(item => item.src === src);
  const framing = asset && 'framing' in asset ? asset.framing : 'full';
  const title = alt || asset?.alt || 'نمای محیط نرم‌افزار';
  const picture = (expanded = false) => (
    <div className={`product-shot product-shot--${framing}${expanded ? ' product-shot--expanded' : ''}`}>
      <img src={src} alt={title} width={asset?.width} height={asset?.height} loading="lazy" />
    </div>
  );
  return (
    <figure className={`product-shot-figure ${className}`}>
      <button type="button" className="product-shot-button" onClick={() => setOpen(true)} aria-label={`نمایش بزرگ‌تر: ${title}`}>
        {picture()}
        <span className="product-shot-expand"><ExpandOutlined aria-hidden="true" />نمایش بزرگ‌تر</span>
      </button>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title={title} width="min(1400px, 96vw)" centered destroyOnClose>
        {open && picture(true)}
      </Modal>
    </figure>
  );
};

export default ProductScreenshot;
