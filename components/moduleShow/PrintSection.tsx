import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, Tabs } from 'antd';
import { EyeOutlined, MinusOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { createPortal } from 'react-dom';
import { printStyles } from '../../utils/printTemplates';
import AdaptiveSelectField from '../AdaptiveSelectField';

interface PrintSectionProps {
  isPrintModalOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
  onPreparePrint?: () => void;
  onSendInternalPdf?: () => void | Promise<void>;
  onSavePdfToRecord?: () => void | Promise<void>;
  onRefreshPreview?: () => void | Promise<void>;
  printTemplates: { id: string; title: string; description: string; isSystem?: boolean }[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  renderPrintCard: () => React.ReactNode;
  printMode: boolean;
  printableFields?: any[];
  selectedPrintFields?: Record<string, string[]>;
  onTogglePrintField?: (templateId: string, fieldName: string) => void;
  onMovePrintField?: (templateId: string, fieldName: string, direction: 'up' | 'down') => void;
  onSavePrintFields?: () => void | Promise<boolean>;
  savingPrintFields?: boolean;
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
  onPreparePrint,
  onSendInternalPdf,
  onSavePdfToRecord,
  onRefreshPreview,
  printTemplates,
  selectedTemplateId,
  onSelectTemplate,
  renderPrintCard,
  printMode,
  printableFields = [],
  selectedPrintFields = {},
  onTogglePrintField = () => {},
  onMovePrintField = () => {},
  onSavePrintFields,
  savingPrintFields = false,
  allowFieldSelectionTab = false,
  previewMeta,
}) => {
  const [activeTab, setActiveTab] = useState('preview');
  const [refreshing, setRefreshing] = useState(false);
  const [sendingInternal, setSendingInternal] = useState(false);
  const [savingPdfToRecord, setSavingPdfToRecord] = useState(false);
  const [zoom, setZoom] = useState(1);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const pendingPrintRef = useRef(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const supportsZoom =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('zoom', '1');

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isFieldSelectionAvailable =
    Boolean(selectedTemplateId) &&
    Boolean(allowFieldSelectionTab) &&
    printableFields.length > 0;

  const selectedFieldCount = (selectedPrintFields[selectedTemplateId] || []).length;
  const mobileTemplateOptions = useMemo(
    () =>
      printTemplates.map((template) => ({
        value: template.id,
        label: template.title,
        title: template.title,
        description: template.description,
        isSystem: template.isSystem,
      })),
    [printTemplates]
  );
  const groupedPrintableFields = useMemo(() => {
    const groups = new Map<string, any[]>();
    printableFields.forEach((field) => {
      const groupLabel = String(field?.group || 'سایر فیلدها').trim() || 'سایر فیلدها';
      groups.set(groupLabel, [...(groups.get(groupLabel) || []), field]);
    });
    return Array.from(groups.entries()).map(([group, fields]) => ({ group, fields }));
  }, [printableFields]);
  const orderedSelectedFields = useMemo(() => {
    const fieldMap = new Map(
      printableFields.map((field) => [String(field?.key || '').trim(), field])
    );
    return (selectedPrintFields[selectedTemplateId] || [])
      .map((key) => fieldMap.get(String(key || '').trim()))
      .filter(Boolean);
  }, [printableFields, selectedPrintFields, selectedTemplateId]);
  const paperFrame = getPaperFrame(previewMeta?.paperSize || 'A4', previewMeta?.orientation || 'portrait');
  const paperWidthPx = (paperFrame.mmWidth * 96) / 25.4;
  const paperHeightPx = (paperFrame.mmHeight * 96) / 25.4;

  const fitPreviewZoom = useCallback(() => {
    const stage = previewStageRef.current;
    if (!stage) return;
    const availableWidth = Math.max(120, stage.clientWidth - 28);
    const fit = availableWidth / paperWidthPx;
    const clamped = Math.max(0.35, Math.min(1.6, fit));
    setZoom(Math.round(clamped * 100) / 100);
  }, [paperWidthPx]);

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

  const handleSaveFields = async () => {
    if (!onSavePrintFields) return;
    await onSavePrintFields();
    if (activeTab !== 'preview') {
      await handleRefresh();
    }
  };

  const getTouchDistance = (touches: any) => {
    if (touches.length < 2) return null;
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  };

  const handleCancel = () => {
    pendingPrintRef.current = false;
    onClose();
  };

  const handleRequestPrint = () => {
    try {
      onPreparePrint?.();
    } catch (error) {
      console.error('Prepare print failed', error);
    }

    pendingPrintRef.current = true;
    onClose();
  };

  useEffect(() => {
    if (isPrintModalOpen || !pendingPrintRef.current) return;
    pendingPrintRef.current = false;
    const timer = window.setTimeout(() => {
      onPrint();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isPrintModalOpen, onPrint]);

  const handleSendInternalPdf = async () => {
    if (!onSendInternalPdf) return;
    setSendingInternal(true);
    try {
      await onSendInternalPdf();
    } finally {
      setSendingInternal(false);
    }
  };

  const handleSavePdfToRecord = async () => {
    if (!onSavePdfToRecord) return;
    setSavingPdfToRecord(true);
    try {
      await onSavePdfToRecord();
    } finally {
      setSavingPdfToRecord(false);
    }
  };

  return (
    <>
      {isPrintModalOpen ? (
        <Modal
          title="انتخاب قالب چاپ"
          open
          onCancel={handleCancel}
          onOk={handleRequestPrint}
          footer={(_, { CancelBtn, OkBtn }) => (
            <div className={`flex ${isMobile ? 'flex-col-reverse items-stretch gap-2' : 'items-center justify-end gap-2'}`}>
              <CancelBtn />
              {onSendInternalPdf ? (
                <Button onClick={() => { void handleSendInternalPdf(); }} loading={sendingInternal}>
                  ارسال مستقیم
                </Button>
              ) : null}
              {onSavePdfToRecord ? (
                <Button onClick={() => { void handleSavePdfToRecord(); }} loading={savingPdfToRecord}>
                  ذخیره در نرم افزار
                </Button>
              ) : null}
              <OkBtn />
            </div>
          )}
          okText={isMobile && onPreparePrint ? 'ذخیره PDF' : 'چاپ'}
          cancelText="انصراف"
          width={isMobile ? '100vw' : 1180}
          destroyOnHidden
          centered={!isMobile}
          zIndex={1000}
          rootClassName="print-select-modal"
          style={isMobile ? { top: 0, paddingBottom: 0, maxWidth: '100vw' } : undefined}
          styles={{
            content: isMobile
              ? {
                  borderRadius: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '100dvh',
                  maxHeight: '100dvh',
                  height: '100dvh',
                  paddingBottom: 0,
                  overflow: 'hidden',
                }
              : undefined,
            body: {
              padding: 0,
              ...(isMobile
                ? {
                    flex: '1 1 auto',
                    minHeight: 0,
                    maxHeight: 'none',
                    overflow: 'hidden',
                  }
                : {
                    maxHeight: '85vh',
                    overflow: 'hidden',
                  }),
            },
            footer: isMobile
              ? {
                  flex: '0 0 auto',
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 2,
                  padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
                  marginTop: 0,
                  borderTop: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(248,250,252,0.96)',
                  backdropFilter: 'blur(12px)',
                }
              : undefined,
          }}
        >
        <div className="print-select-shell">
          {isMobile ? (
            <div className="print-template-mobile-select-wrap">
              <div className="print-template-mobile-select-label">قالب چاپ</div>
              <AdaptiveSelectField
                value={selectedTemplateId || undefined}
                onChange={(value) => {
                  onSelectTemplate(value);
                  setActiveTab('preview');
                }}
                showSearch
                allowClear={false}
                className="print-template-mobile-select"
                placeholder="انتخاب قالب چاپ"
                listHeight={320}
                optionFilterProp="label"
                adaptiveMode="auto"
                pickerTitle="انتخاب قالب چاپ"
                mobileSearchPlaceholder="جستجو در قالب‌های چاپ"
                popupMatchSelectWidth
                overlayZIndexBase={12020}
                optionDisplayFallback={(option) => String(option?.title || option?.label || option?.value || '')}
                filterOption={(input, option) => {
                  const search = input.trim().toLowerCase();
                  if (!search) return true;
                  const title = String(option?.title || '').toLowerCase();
                  const description = String(option?.description || '').toLowerCase();
                  return title.includes(search) || description.includes(search);
                }}
                options={mobileTemplateOptions}
                optionRender={(option) => {
                  const data = option.data as {
                    title?: string;
                    description?: string;
                    isSystem?: boolean;
                  };
                  return (
                    <div className="print-template-mobile-option">
                      <div className="print-template-mobile-option-title">
                        <span>{data.title}</span>
                        {data.isSystem ? <span className="print-template-system-tag">سیستمی</span> : null}
                      </div>
                      {data.description ? <div className="print-template-mobile-option-desc">{data.description}</div> : null}
                    </div>
                  );
                }}
                renderMobileOption={(option) => (
                  <div className="print-template-mobile-option">
                    <div className="print-template-mobile-option-title">
                      <span>{String(option?.title || option?.label || option?.value || '')}</span>
                      {option?.isSystem ? <span className="print-template-system-tag">سیستمی</span> : null}
                    </div>
                    {option?.description ? <div className="print-template-mobile-option-desc">{String(option.description)}</div> : null}
                  </div>
                )}
              />
            </div>
          ) : null}
          {!isMobile ? (
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
          ) : null}

          <div className="print-preview-shell">
            <Tabs
              activeKey={activeTab}
              onChange={(key) => {
                setActiveTab(key);
              }}
              tabPosition="top"
              destroyOnHidden
              tabBarGutter={isMobile ? 8 : 12}
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
              tabBarStyle={{
                margin: 0,
                padding: isMobile ? '0 8px' : '0 16px',
                borderBottom: '1px solid rgba(148,163,184,0.18)',
                direction: isMobile ? 'rtl' : undefined,
              }}
              items={[
                {
                  key: 'preview',
                  label: (
                    <span className="inline-flex items-center gap-2" style={{ direction: 'rtl' }}>
                      <EyeOutlined />
                      {isMobile ? 'پیش‌نمایش' : 'پیش‌نمایش'}
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
                      <div
                        className="print-preview-stage"
                        ref={previewStageRef}
                        onTouchStart={(event) => {
                          pinchDistanceRef.current = event.touches.length >= 2 ? getTouchDistance(event.touches) : null;
                        }}
                        onTouchMove={(event) => {
                          if (event.touches.length < 2) return;
                          event.preventDefault();
                          const nextDistance = getTouchDistance(event.touches);
                          const prevDistance = pinchDistanceRef.current;
                          if (!nextDistance || !prevDistance) {
                            pinchDistanceRef.current = nextDistance;
                            return;
                          }
                          const delta = (nextDistance - prevDistance) / 180;
                          if (Math.abs(delta) < 0.015) return;
                          setZoom((prev) => Math.max(0.35, Math.min(1.8, Math.round((prev + delta) * 100) / 100)));
                          pinchDistanceRef.current = nextDistance;
                        }}
                        onTouchEnd={() => {
                          pinchDistanceRef.current = null;
                        }}
                        onTouchCancel={() => {
                          pinchDistanceRef.current = null;
                        }}
                      >
                        <div className="print-preview-canvas">
                          <div
                            className="print-preview-zoom-frame"
                              style={{
                                width: `${Math.round(paperWidthPx * zoom)}px`,
                                minHeight: `${Math.round(paperHeightPx * zoom)}px`,
                                maxWidth: 'none',
                                overflow: 'visible',
                              }}
                          >
                            <div
                              className="print-preview-scale"
                                style={{
                                  width: `${paperFrame.mmWidth}mm`,
                                  minHeight: `${paperFrame.mmHeight}mm`,
                                  ...(supportsZoom
                                    ? ({ zoom } as React.CSSProperties)
                                    : { transform: `scale(${zoom})`, transformOrigin: 'top left' }),
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
                         label: (
                           <span style={{ direction: 'rtl' }}>
                             {`فیلدهای قابل چاپ ${selectedFieldCount > 0 ? `(${selectedFieldCount})` : '(همه)'}`}
                           </span>
                         ),
                        children: (
                          <div className="print-fields-pane">
                            <div className="print-fields-toolbar">
                               <div className="print-fields-meta">فقط گزینه‌های انتخاب‌شده در چاپ نهایی نمایش داده می‌شوند.</div>
                              <Button size="small" type="primary" onClick={handleSaveFields} loading={savingPrintFields}>
                                 ذخیره تغییرات
                              </Button>
                            </div>
                            {orderedSelectedFields.length > 0 ? (
                              <div className="print-selected-fields-panel">
                                <div className="print-selected-fields-title">ترتیب چاپ فیلدهای انتخاب‌شده</div>
                                <div className="print-selected-fields-list">
                                  {orderedSelectedFields.map((field, index) => (
                                    <div key={`selected-${field.key}`} className="print-selected-field-row">
                                      <span className="print-selected-field-label">{field?.labels?.fa || field?.label || field?.key}</span>
                                      <div className="print-selected-field-actions">
                                        <Button
                                          size="small"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onMovePrintField(selectedTemplateId, field.key, 'up');
                                          }}
                                          disabled={index === 0}
                                        >
                                          بالا
                                        </Button>
                                        <Button
                                          size="small"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onMovePrintField(selectedTemplateId, field.key, 'down');
                                          }}
                                          disabled={index === orderedSelectedFields.length - 1}
                                        >
                                          پایین
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <div className="print-fields-groups">
                              {groupedPrintableFields.map(({ group, fields }) => (
                                <div key={group} className="print-fields-group">
                                  <div className="print-fields-group-title">{group}</div>
                                  <div className="print-fields-grid">
                                    {fields.map((field) => {
                                      const isSelected = (selectedPrintFields[selectedTemplateId] || []).includes(field.key);
                                      const isEmpty = field?.hasValue === false;
                                      return (
                                        <div
                                          key={field.key}
                                          onClick={() => onTogglePrintField(selectedTemplateId, field.key)}
                                          className={`print-field-card ${isSelected ? 'selected' : ''} ${isEmpty ? 'empty' : ''}`}
                                        >
                                          <div className="print-field-checkbox">{isSelected ? String.fromCharCode(10003) : ''}</div>
                                          <div className="print-field-card-body">
                                            <span>{field?.labels?.fa || field?.label || field?.key}</span>
                                            {isEmpty ? <small>بدون مقدار</small> : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
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
      ) : null}

      {typeof document !== 'undefined'
        ? createPortal(
            <div
              id="print-root"
              aria-hidden={!printMode}
              style={
                printMode
                  ? {
                      display: 'block',
                      position: 'fixed',
                      top: 0,
                      left: '-200vw',
                      width: 'max-content',
                      maxWidth: 'none',
                      opacity: 0,
                      pointerEvents: 'none',
                      zIndex: -1,
                      overflow: 'hidden',
                    }
                  : { display: 'none' }
              }
            >
              {printMode ? renderPrintCard() : null}
            </div>,
            document.body
          )
        : null}

      <style>{`
        .print-select-modal,
        .print-select-modal *,
        .print-select-modal .ant-modal,
        .print-select-modal .ant-modal-mask,
        .print-select-modal .ant-modal-wrap {
          animation-duration: 0s !important;
          transition-duration: 0s !important;
        }
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
        .print-template-mobile-select-wrap {
          display: none;
        }
        .print-template-mobile-select-label {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 10px;
          font-weight: 700;
          direction: rtl;
        }
        .print-template-mobile-select.kalam-adaptive-picker__trigger {
          width: 100%;
          min-height: 48px;
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.28);
          background: #fff;
          box-shadow: 0 10px 24px rgba(15,23,42,0.06);
        }
        .print-template-mobile-select .kalam-adaptive-picker__trigger-text {
          direction: rtl;
          text-align: right;
        }
        .print-template-mobile-value {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          max-width: 100%;
        }
        .print-template-mobile-value-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.5;
          max-width: 100%;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .print-template-mobile-value-title,
        .print-template-mobile-option-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          font-size: 13px;
          font-weight: 700;
          color: #111827;
          direction: rtl;
          text-align: right;
        }
        .print-template-mobile-option-desc {
          font-size: 11px;
          line-height: 1.7;
          color: #64748b;
          direction: rtl;
          text-align: right;
          display: block;
        }
        .print-template-mobile-option {
          direction: rtl;
          text-align: right;
        }
        .print-template-mobile-option .print-template-system-tag,
        .print-template-mobile-value .print-template-system-tag {
          display: inline-flex;
        }
        .print-template-mobile-popup .ant-select-dropdown {
          padding: 6px 0;
          background: #ffffff !important;
          border: 1px solid rgba(148,163,184,0.2) !important;
          border-radius: 14px !important;
          box-shadow: 0 18px 40px rgba(15,23,42,0.18) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          pointer-events: auto !important;
        }
        .print-template-mobile-popup {
          z-index: 1400 !important;
        }
        .print-template-mobile-popup,
        .print-template-mobile-popup * {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .print-template-mobile-popup .ant-select-item-option {
          background: transparent !important;
          pointer-events: auto !important;
        }
        .print-template-mobile-popup .ant-select-item-option-active {
          background: rgba(var(--brand-500-rgb), 0.08) !important;
        }
        .print-template-mobile-popup .ant-select-item-option-selected {
          background: rgba(var(--brand-500-rgb), 0.12) !important;
        }
        .print-template-mobile-popup .ant-select-item {
          padding: 10px 12px !important;
          border-radius: 12px;
          margin: 0 6px;
        }
        .dark .print-template-mobile-select-label {
          color: #cbd5e1;
        }
        .dark .print-template-mobile-select.kalam-adaptive-picker__trigger {
          background: rgba(15,23,42,0.92);
          border-color: rgba(71,85,105,0.42);
          box-shadow: none;
        }
        .dark .print-template-mobile-popup .ant-select-dropdown {
          background: #0f172a !important;
          border-color: rgba(71,85,105,0.42) !important;
          box-shadow: 0 18px 40px rgba(2,6,23,0.48) !important;
        }
        .dark .print-template-mobile-value-title,
        .dark .print-template-mobile-option-title {
          color: #f8fafc;
        }
        .dark .print-template-mobile-option-desc {
          color: #94a3b8;
        }
        .dark .print-template-mobile-popup .ant-select-item-option-active {
          background: rgba(var(--brand-500-rgb), 0.16) !important;
        }
        .dark .print-template-mobile-popup .ant-select-item-option-selected {
          background: rgba(var(--brand-500-rgb), 0.22) !important;
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
        .print-preview-shell .ant-tabs-nav {
          flex: 0 0 auto;
        }
        .print-preview-shell .ant-tabs-nav-wrap {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          scrollbar-width: none;
        }
        .print-preview-shell .ant-tabs-nav-wrap::-webkit-scrollbar {
          display: none;
        }
        .print-preview-shell .ant-tabs-nav-list {
          flex-wrap: nowrap !important;
          min-width: max-content;
        }
        .print-preview-shell .ant-tabs-tab {
          flex: 0 0 auto;
          white-space: nowrap;
          margin: 0 !important;
        }
        .print-preview-shell .ant-tabs-tab-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1.5;
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
          padding: 8px 10px 10px;
          display: flex;
          justify-content: flex-start;
          align-items: flex-start;
          direction: ltr;
          text-align: initial;
          overscroll-behavior: contain;
        }
        .print-preview-canvas {
          width: max-content;
          min-width: max-content;
          display: flex;
          justify-content: flex-start;
          align-items: flex-start;
          margin: 0 auto;
          overflow: visible;
        }
        .print-preview-zoom-frame {
          display: inline-flex;
          justify-content: flex-start;
          margin: 0 auto;
          position: relative;
          min-width: 0;
          flex: 0 0 auto;
          box-sizing: border-box;
          max-width: none;
          overflow: visible;
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
          overflow: hidden;
          display: inline-block;
          transform-origin: top center;
          direction: rtl;
          text-align: right;
          margin: 0 auto;
          max-width: 100%;
        }
        .print-preview-scale > .invoice-custom-print-shell {
          width: auto !important;
          min-height: auto !important;
          max-width: none !important;
          box-sizing: border-box !important;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 0 auto;
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
        }
        .print-fields-groups {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 16px;
          overflow: auto;
        }
        .print-fields-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .print-fields-group-title {
          font-size: 12px;
          font-weight: 800;
          color: #475569;
          padding: 0 2px;
        }
        .dark .print-fields-group-title {
          color: #cbd5e1;
        }
        .print-fields-pane {
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .print-fields-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px 0;
          direction: rtl;
        }
        .print-fields-meta {
          font-size: 12px;
          color: #64748b;
        }
        .print-selected-fields-panel {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 12px 16px 0;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(248,250,252,0.82);
        }
        .print-selected-fields-title {
          font-size: 12px;
          font-weight: 800;
          color: #334155;
        }
        .print-selected-fields-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .print-selected-field-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(226,232,240,0.95);
        }
        .print-selected-field-label {
          min-width: 0;
        }
        .print-selected-field-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }
        .dark .print-fields-meta {
          color: #cbd5e1;
        }
        .dark .print-selected-fields-panel {
          background: rgba(15,23,42,0.7);
          border-color: rgba(71,85,105,0.4);
        }
        .dark .print-selected-fields-title {
          color: #e2e8f0;
        }
        .dark .print-selected-field-row {
          background: rgba(30,41,59,0.92);
          border-color: rgba(71,85,105,0.48);
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
        .print-field-card.empty {
          opacity: 0.72;
        }
        .dark .print-field-card {
          background: rgba(15,23,42,0.74);
          border-color: rgba(71,85,105,0.42);
          color: #e5e7eb;
        }
        .print-field-card-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .print-field-card-body small {
          font-size: 11px;
          color: #94a3b8;
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
          .print-select-modal .ant-modal-content {
            display: flex;
            flex-direction: column;
            height: 100dvh;
          }
          .print-select-modal .ant-modal-header {
            flex: 0 0 auto;
            padding: 14px 16px 10px;
            margin-bottom: 0;
          }
          .print-select-modal .ant-modal-body {
            flex: 1 1 auto;
            min-height: 0;
          }
          .print-select-modal .ant-modal-footer {
            display: flex;
            gap: 10px;
          }
          .dark .print-select-modal .ant-modal-footer {
            background: rgba(15,23,42,0.96) !important;
            border-top-color: rgba(71,85,105,0.36) !important;
          }
          .print-select-modal .ant-modal-footer .ant-btn {
            flex: 1 1 0;
            height: 42px;
            border-radius: 12px;
          }
          .print-select-modal .ant-modal {
            max-width: 100vw !important;
            margin: 0 !important;
            padding-bottom: 0 !important;
          }
          .print-select-modal .ant-modal-content {
            box-shadow: none;
          }
          .print-select-shell {
            grid-template-columns: 1fr;
            grid-template-rows: auto minmax(0, 1fr);
            height: 100%;
          }
          .print-template-list {
            display: none;
          }
          .print-template-mobile-select-wrap {
            display: block;
            padding: 12px 12px 10px;
            border-bottom: 1px solid rgba(148,163,184,0.18);
            background: rgba(248,250,252,0.88);
            backdrop-filter: blur(10px);
          }
          .dark .print-template-mobile-select-wrap {
            background: rgba(15,23,42,0.88);
          }
          .print-preview-shell {
            min-height: 0;
          }
          .print-preview-shell .ant-tabs-nav {
            margin-bottom: 0 !important;
          }
          .print-preview-shell .ant-tabs-nav-list {
            padding: 0 6px;
          }
          .print-preview-shell .ant-tabs-tab {
            padding: 12px 12px !important;
          }
          .print-preview-shell .ant-tabs-tab + .ant-tabs-tab {
            margin-inline-start: 2px !important;
          }
          .print-preview-toolbar {
            flex-wrap: wrap;
            align-items: stretch;
            padding: 10px 12px 8px;
            gap: 8px;
          }
          .print-preview-actions,
          .print-preview-meta {
            width: 100%;
          }
          .print-preview-actions {
            justify-content: space-between;
          }
          .print-preview-stage {
            padding: 8px 8px 12px;
          }
          .print-fields-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            padding: 10px 12px 0;
          }
          .print-selected-fields-panel {
            margin: 12px 12px 0;
          }
          .print-selected-field-row {
            flex-direction: column;
            align-items: stretch;
          }
          .print-selected-field-actions {
            justify-content: flex-end;
          }
          .print-fields-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .print-fields-groups {
            gap: 12px;
            padding: 12px;
          }
        }
      `}</style>
      <style>{printStyles}</style>
    </>
  );
};

export default PrintSection;
