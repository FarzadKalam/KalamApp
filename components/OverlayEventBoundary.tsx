import React from 'react';

type OverlayBoundaryEvent =
  | React.MouseEvent<HTMLElement>
  | React.TouchEvent<HTMLElement>
  | React.PointerEvent<HTMLElement>;

export const stopOverlayEventPropagation = (event?: OverlayBoundaryEvent | Event | null) => {
  if (!event) return;

  if ('stopPropagation' in event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }

  const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
  if (nativeEvent && 'stopImmediatePropagation' in nativeEvent && typeof nativeEvent.stopImmediatePropagation === 'function') {
    nativeEvent.stopImmediatePropagation();
  }
};

interface OverlayEventBoundaryProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const OverlayEventBoundary: React.FC<OverlayEventBoundaryProps> = ({ children, className, style }) => (
  <div
    className={className}
    style={style}
    onPointerDown={stopOverlayEventPropagation}
    onMouseDown={stopOverlayEventPropagation}
    onClick={stopOverlayEventPropagation}
    onTouchStart={stopOverlayEventPropagation}
  >
    {children}
  </div>
);

export default OverlayEventBoundary;
