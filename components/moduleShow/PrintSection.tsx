import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, Tabs } from 'antd';
import { EyeOutlined, MinusOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { createPortal } from 'react-dom';
import { printStyles } from '../../utils/printTemplates';

interface PrintSectionProps {
  isPrintModalOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
  onRefreshPreview?: () => void | Promise<void>;
  printTemplates: { id: string; title: string; description: string; isSystem?: boolean }[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  renderPrintCard: () => React.ReactNode;
  printMode: boolean;
  printableFields?: any[];
  selectedPrintFields?: Record<string, string[]>;
  onTogglePrintField?: (templateId: string, fieldName: string) => void;
  allowFieldSelectionTab?: boolean;
  previewMeta?: {
    paperSize?: 'A4' | 'A5' | 'A6';
    orientation?: 'portrait' | 'landscape';
  };
}

const getPaperFrame = (
  paperSize: 'A4' | 'A5' | 'A6' = 'A4',
  orientation: 'portrait' | 'landscape' = 'portrait'
) => {
  const base =
    paperSize === 'A6'
      ? { width: 105, height: 148 }
      : paperSize === 'A5'
        ? { width: 148, height: 210 }
        : { width: 210, height: 297 };

  return orientation === 'landscape'
    ? { mmWidth: base.height, mmHeight: base.width }
    : { mmWidth: base.width, mmHeight: base.height };
};

const PrintSection: React.FC<PrintSectionProps> = ({
  isPrintModalOpen,
  onClose,
  onPrint,
  onRefreshPreview,
  printTemplates,
  selectedTemplateId,
  onSelectTemplate,
  renderPrintCard,
  printMode,
  printableFields = [],
  selectedPrintFields = {},
  onTogglePrintField = () => {},
  allowFieldSelectionTab = false,
  previewMeta,
}) => {
  const [activeTab, setActiveTab] = useState('preview');
  const [refreshing, setRefreshing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const supportsZoom = false;

  useEffect(() => {
    if (!printMode) return;
    const handleAfterPrint = () => {
      document.body.classList.remove('print-mode');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    document.body.classList.add('print-mode');
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('print-mode');
    };
  }, [printMode]);

  const selectedTemplateMeta = useMemo(
    () => printTemplates.find((template) => template.id === selectedTemplateId) || null,
    [printTemplates, selectedTemplateId]
  );
  const isFieldSelectionAvailable =
    Boolean(selectedTemplateId) &&
    Boolean(allowFieldSelectionTab) &&
    printableFields.length > 0;

  const selectedFieldCount = (selectedPrintFields[selectedTemplateId] || []).length;
  const paperFrame = getPaperFrame(previewMeta?.paperSize || 'A4', previewMeta?.orientation || 'portrait');

  const fitPreviewZoom = useCallback(() => {
    const stage = previewStageRef.current;
    if (!stage) return;
    const mmToPx = (value: number) => (value * 96) / 25.4;
    const paperWidthPx = mmToPx(paperFrame.mmWidth);
    const paperHeightPx = mmToPx(paperFrame.mmHeight);
    const availableWidth = Math.max(120, stage.clientWidth - 24);
    const availableHeight = Math.max(120, stage.clientHeight - 24);
    const fit = Math.min(availableWidth / paperWidthPx, availableHeight / paperHeightPx);
    const clamped = Math.max(0.35, Math.min(1.6, fit));
    setZoom(Math.round(clamped * 100) / 100);
  }, [paperFrame.mmHeight, paperFrame.mmWidth]);

  useEffect(() => {
    if (!isPrintModalOpen || activeTab !== 'preview') return;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(fitPreviewZoom);
    });
    const handleResize = () => fitPreviewZoom();
    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeTab, fitPreviewZoom, isPrintModalOpen, selectedTemplateId]);

  const handleRefresh = async () => {
    if (!onRefreshPreview) return;
    setRefreshing(true);
    try {
      await onRefreshPreview();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Modal
        title="انتخاب قالب چاپ"
        open={isPrintModalOpen}
        onCancel={onClose}
        onOk={onPrint}
        okText="چاپ"
        cancelText="انصراف"
        width={isMobile ? '96vw' : 1180}
        destroyOnHidden
        centered
        zIndex={2400}
        rootClassName="print-select-modal"
        styles={{
          body: {
            padding: 0,
            maxHeight: '85vh',
            overflow: 'hidden',
          },
        }}
      >
        <div className="print-select-shell">
          <div
            className="print-template-list"
            style={{
              gridTemplateColumns: isMobile ? 'repeat(auto-fit, minmax(160px, 1fr))' : undefined,
            }}
          >
            {printTemplates.map((template) => {
              const isSelected = selectedTemplateId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    onSelectTemplate(template.id);
                    setActiveTab('preview');
                  }}
                  className={`print-template-card ${isSelected ? 'selected' : ''}`}
                >
                  <div className="print-template-card-title">
                    {template.title}
                    {template.isSystem ? <span className="print-template-system-tag">سیستمی</span> : null}
                  </div>
                  <div className="print-template-card-desc">{template.description}</div>
                </button>
              );
            })}
          </div>

          <div className="print-preview-shell">
            <Tabs
              activeKey={activeTab}
              onChange={(key) => {
                setActiveTab(key);
                if (key === 'preview' && onRefreshPreview) {
                  void handleRefresh();
                }
              }}
              tabPosition="top"
              destroyInactiveTabPane
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
              tabBarStyle={{ margin: 0, padding: '0 16px', borderBottom: '1px solid rgba(148,163,184,0.18)' }}
              items={[
                {
                  key: 'preview',
                  label: (
                    <span className="inline-flex items-center gap-2">
                      <EyeOutlined />
                      پیش‌نمایش
                    </span>
                  ),
                  children: (
                    <div className="print-preview-pane">
                      <div className="print-preview-toolbar">
                        <div className="print-preview-meta">
                          <span>{previewMeta?.paperSize || 'A4'}</span>
                          <span>{(previewMeta?.orientation || 'portrait') === 'landscape' ? 'افقی' : 'عمودی'}</span>
                          <span>{`${Math.round(zoom * 100)}%`}</span>
                        </div>
                        <div className="print-preview-actions">
                          <Button
                            size="small"
                            icon={<MinusOutlined />}
                            onClick={() => setZoom((prev) => Math.max(0.5, Math.round((prev - 0.1) * 10) / 10))}
                            title="کوچک‌نمایی"
                          />
                          <Button
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => setZoom((prev) => Math.min(1.8, Math.round((prev + 0.1) * 10) / 10))}
                            title="بزرگ‌نمایی"
                          />
                          <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={handleRefresh}
                            loading={refreshing}
                            disabled={!onRefreshPreview}
                            title="رفرش پیش‌نمایش"
                          />
                        </div>
                      </div>
                      <div className="print-preview-stage" ref={previewStageRef}>
                        <div className="print-preview-canvas">
                          <div
                            className="print-preview-zoom-frame"
                            style={{
                              width: supportsZoom ? `${paperFrame.mmWidth}mm` : `${paperFrame.mmWidth * zoom}mm`,
                            }}
                          >
                            <div
                              className="print-preview-scale"
                              style={{
                                width: `${paperFrame.mmWidth}mm`,
                                ...(supportsZoom
                                  ? ({ zoom } as React.CSSProperties)
                                  : { transform: `scale(${zoom})` }),
                              }}
                            >
                              {!printMode ? renderPrintCard() : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                },
                ...(isFieldSelectionAvailable
                  ? [
                      {
                        key: 'fields',
                        label: `${selectedTemplateMeta?.isSystem ? 'فیلدهای سیستمی' : 'فیلدهای چاپ'} ${
                          selectedFieldCount > 0 ? `(${selectedFieldCount})` : '(همه)'
                        }`,
                        children: (
                          <div className="print-fields-grid">
                            {printableFields.map((field) => {
                              const isSelected = (selectedPrintFields[selectedTemplateId] || []).includes(field.key);
                              return (
                                <div
                                  key={field.key}
                                  onClick={() => onTogglePrintField(selectedTemplateId, field.key)}
                                  className={`print-field-card ${isSelected ? 'selected' : ''}`}
                                >
                                  <div className="print-field-checkbox">{isSelected ? '✓' : ''}</div>
                                  <span>{field?.labels?.fa || field?.label || field?.key}</span>
                                </div>
                              );
                            })}
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      </Modal>

      {typeof document !== 'undefined'
        ? createPortal(
            <div id="print-root" aria-hidden={!printMode} style={{ display: printMode ? 'block' : 'none' }}>
              {printMode ? renderPrintCard() : null}
            </div>,
            document.body
          )
        : null}

      <style>{`
        .print-select-shell {
          display: grid;
          grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
          height: 76vh;
          background:
            radial-gradient(circle at top right, rgba(var(--brand-500-rgb), 0.16), transparent 28%),
            linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.98));
        }
        .dark .print-select-shell {
          background:
            radial-gradient(circle at top right, rgba(var(--brand-500-rgb), 0.18), transparent 28%),
            linear-gradient(180deg, rgba(15,23,42,0.98), rgba(17,24,39,0.98));
        }
        .print-template-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px;
          overflow: auto;
          border-inline-end: 1px solid rgba(148,163,184,0.18);
          background: rgba(255,255,255,0.44);
          backdrop-filter: blur(12px);
        }
        .dark .print-template-list {
          background: rgba(2,6,23,0.26);
          border-inline-end-color: rgba(71,85,105,0.36);
        }
        .print-template-card {
          width: 100%;
          text-align: right;
          border-radius: 18px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(255,255,255,0.78);
          padding: 14px 12px;
          cursor: pointer;
          transition: 0.18s ease;
          box-shadow: 0 8px 18px rgba(15,23,42,0.04);
        }
        .print-template-card:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--brand-500-rgb), 0.42);
        }
        .print-template-card.selected {
          border-color: rgba(var(--brand-500-rgb), 0.75);
          background: linear-gradient(180deg, rgba(255,248,240,0.96), rgba(255,255,255,0.98));
          box-shadow: 0 14px 28px rgba(var(--brand-500-rgb), 0.16);
        }
        .dark .print-template-card {
          background: rgba(15,23,42,0.74);
          border-color: rgba(71,85,105,0.44);
          box-shadow: none;
        }
        .dark .print-template-card.selected {
          background: linear-gradient(180deg, rgba(51,30,18,0.86), rgba(15,23,42,0.94));
        }
        .print-template-card-title {
          font-size: 13px;
          font-weight: 800;
          color: #111827;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .dark .print-template-card-title {
          color: #f8fafc;
        }
        .print-template-system-tag {
          font-size: 10px;
          line-height: 1;
          border-radius: 999px;
          border: 1px solid rgba(16, 185, 129, 0.45);
          background: rgba(16, 185, 129, 0.14);
          color: #065f46;
          padding: 2px 8px;
        }
        .dark .print-template-system-tag {
          border-color: rgba(52, 211, 153, 0.5);
          background: rgba(6, 95, 70, 0.35);
          color: #a7f3d0;
        }
        .print-template-card-desc {
          margin-top: 4px;
          font-size: 11px;
          line-height: 1.7;
          color: #64748b;
        }
        .dark .print-template-card-desc {
          color: #94a3b8;
        }
        .print-preview-shell {
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .print-preview-shell .ant-tabs,
        .print-preview-shell .ant-tabs-content-holder,
        .print-preview-shell .ant-tabs-content {
          min-height: 0;
          height: 100%;
        }
        .print-preview-shell .ant-tabs {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
        }
        .print-preview-shell .ant-tabs-content-holder {
          flex: 1 1 auto;
          overflow: hidden;
        }
        .print-preview-shell .ant-tabs-content {
          min-height: 0;
          height: 100%;
        }
        .print-preview-shell .ant-tabs-tabpane {
          min-height: 0;
          height: 100%;
        }
        .print-preview-shell .ant-tabs-tabpane-active {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
        }
        .print-preview-pane {
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
          direction: ltr;
        }
        .print-preview-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px 10px;
          direction: rtl;
        }
        .print-preview-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .print-preview-meta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 12px;
          color: #64748b;
        }
        .print-preview-meta span {
          border: 1px solid rgba(148,163,184,0.24);
          border-radius: 999px;
          padding: 4px 10px;
          background: rgba(255,255,255,0.7);
        }
        .dark .print-preview-meta {
          color: #cbd5e1;
        }
        .dark .print-preview-meta span {
          background: rgba(15,23,42,0.74);
          border-color: rgba(71,85,105,0.42);
        }
        .print-preview-stage {
          flex: 1;
          overflow: auto;
          min-height: 0;
          border-top: 1px solid rgba(148,163,184,0.18);
          background: linear-gradient(180deg, rgba(226,232,240,0.42), rgba(241,245,249,0.92));
          padding: 8px 10px 12px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          direction: ltr;
          text-align: center;
        }
        .print-preview-canvas {
          min-width: 100%;
          width: max-content;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          margin: 0 auto;
        }
        .print-preview-zoom-frame {
          display: block;
          width: fit-content;
          margin: 0 auto;
          position: relative;
          min-width: fit-content;
        }
        .print-preview-stage > .print-preview-zoom-frame {
          margin-inline: auto;
        }
        .dark .print-preview-stage {
          background: linear-gradient(180deg, rgba(2,6,23,0.44), rgba(15,23,42,0.9));
          border-top-color: rgba(71,85,105,0.36);
        }
        .print-preview-scale {
          background: #fff;
          box-shadow: 0 24px 60px rgba(15,23,42,0.22);
          box-sizing: border-box;
          overflow: visible;
          display: inline-block;
          transform-origin: top left;
          direction: ltr;
          margin: 0 auto;
        }
        .print-preview-scale > .invoice-custom-print-shell {
          width: 100% !important;
          min-height: auto !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        .print-preview-scale .print-template-page + .print-template-page {
          margin-top: 10mm;
        }
        .print-preview-scale .print-template-page {
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
          border: 1px solid rgba(203, 213, 225, 0.95);
        }
        @media print {
          .print-preview-scale .print-template-page + .print-template-page {
            margin-top: 0 !important;
          }
          .print-preview-scale .print-template-page {
            box-shadow: none !important;
            border: 0 !important;
          }
        }
        .print-fields-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
          padding: 16px;
          overflow: auto;
        }
        .print-field-card {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(255,255,255,0.78);
          transition: 0.18s ease;
        }
        .print-field-card.selected {
          border-color: rgba(var(--brand-500-rgb), 0.7);
          background: rgba(255,248,240,0.92);
        }
        .dark .print-field-card {
          background: rgba(15,23,42,0.74);
          border-color: rgba(71,85,105,0.42);
          color: #e5e7eb;
        }
        .print-field-checkbox {
          width: 20px;
          height: 20px;
          flex: 0 0 20px;
          border-radius: 6px;
          border: 2px solid rgba(148,163,184,0.48);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          background: transparent;
          font-weight: 700;
        }
        .print-field-card.selected .print-field-checkbox {
          border-color: rgba(var(--brand-500-rgb), 1);
          background: rgb(var(--brand-500-rgb));
        }
        @media (max-width: 767px) {
          .print-select-shell {
            grid-template-columns: 1fr;
            height: 82vh;
          }
          .print-template-list {
            border-inline-end: none;
            border-bottom: 1px solid rgba(148,163,184,0.18);
          }
        }
      `}</style>
      <style>{printStyles}</style>
    </>
  );
};

export default PrintSection;
