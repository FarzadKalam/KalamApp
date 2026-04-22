import React, { useMemo, useRef } from 'react';
import { Modal } from 'antd';

interface AdaptivePickerSurfaceProps {
  open: boolean;
  title: string;
  subtitle?: string;
  zIndex?: number;
  pickerTitle?: string;
  onClose: () => void;
  onConfirm?: () => void;
  onClear?: () => void;
  confirmLabel?: string;
  clearLabel?: string;
  closeLabel?: string;
  confirmDisabled?: boolean;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  modalContainer?: (trigger?: HTMLElement | null) => HTMLElement;
}

const AdaptivePickerSurface: React.FC<AdaptivePickerSurfaceProps> = ({
  open,
  title,
  subtitle,
  zIndex = 10050,
  pickerTitle,
  onClose,
  onConfirm,
  onClear,
  confirmLabel = 'تایید',
  clearLabel = 'پاک کردن',
  closeLabel = 'انصراف',
  confirmDisabled = false,
  children,
  headerExtra,
  modalContainer,
}) => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const getModalContainer = useMemo(
    () =>
      modalContainer
        ? () => {
            const activeElement = typeof document !== 'undefined'
              ? (document.activeElement as HTMLElement | null)
              : null;
            return modalContainer(anchorRef.current || activeElement);
          }
        : undefined,
    [modalContainer]
  );

  return (
    <div ref={anchorRef}>
      <Modal
        open={open}
        footer={null}
        onCancel={onClose}
        maskClosable
        keyboard
        destroyOnHidden={false}
        centered
        width="auto"
        zIndex={zIndex}
        className="kalam-adaptive-picker-modal"
        rootClassName="kalam-adaptive-picker-modal-root"
        getContainer={getModalContainer}
        closeIcon={null}
        style={{
          maxWidth: 'min(calc(100vw - 24px), 460px)',
          margin: '0 auto',
          paddingBottom: 0,
        }}
        styles={{
          mask: { zIndex, backgroundColor: 'rgba(15, 23, 42, 0.58)', backdropFilter: 'blur(4px)' },
          wrapper: {
            zIndex: zIndex + 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            overflow: 'auto',
          },
          content: {
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100dvh - 24px)',
            padding: 0,
            background: 'transparent',
            boxShadow: 'none',
          },
          body: { padding: 0, overflow: 'visible' },
        }}
      >
        <div className="kalam-adaptive-picker-modal__sheet">
          <div className="kalam-adaptive-picker kalam-adaptive-picker--sheet">
            <div className="kalam-adaptive-picker__header">
              <div>
                <div className="kalam-adaptive-picker__title">{pickerTitle || title}</div>
                {subtitle ? <div className="kalam-adaptive-picker__subtitle">{subtitle}</div> : null}
              </div>
              {headerExtra}
            </div>
            <div className="kalam-adaptive-picker__body">{children}</div>
            <div className="kalam-adaptive-picker__footer">
              <button type="button" className="kalam-adaptive-picker__action is-muted" onClick={onClose}>
                {closeLabel}
              </button>
              {onClear ? (
                <button type="button" className="kalam-adaptive-picker__action is-danger" onClick={onClear}>
                  {clearLabel}
                </button>
              ) : null}
              {onConfirm ? (
                <button
                  type="button"
                  className="kalam-adaptive-picker__action is-primary"
                  onClick={onConfirm}
                  disabled={confirmDisabled}
                >
                  {confirmLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdaptivePickerSurface;
