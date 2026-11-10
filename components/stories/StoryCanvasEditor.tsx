import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DeleteOutlined,
  EditOutlined,
  PauseOutlined,
  PlayCircleFilled,
  SoundOutlined,
  AudioMutedOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import ProfileAvatar from '../common/ProfileAvatar';
import { getGradientPreset } from '../../utils/storyGradients';
import { buildImageBackgroundStyle } from '../../utils/imagePreview';
import {
  SAAS_STORY_AVATAR_URL,
  SAAS_STORY_CREATOR_NAME,
  type StorySlide,
  type StoryStickerLayer,
  type StoryTextLayer,
} from './storyTypes';
import {
  buildStoryTextLayerStyle,
  computeStoryRenderScale,
  StoryStickerVisual,
} from './storyLayerRenderers';

export type SelectedStoryElement =
  | { kind: 'text'; id: string }
  | { kind: 'sticker'; id: string }
  | null;

interface StoryCanvasEditorProps {
  slide: StorySlide | null;
  creatorName: string;
  creatorAvatar?: string | null;
  isSaasWide?: boolean;
  selectedElement: SelectedStoryElement;
  onSelectElement: (next: SelectedStoryElement) => void;
  onUpdateTextLayer: (layerId: string, patch: Partial<StoryTextLayer>) => void;
  onRemoveTextLayer: (layerId: string) => void;
  onUpdateSticker: (stickerId: string, patch: Partial<StoryStickerLayer>) => void;
  onRemoveSticker: (stickerId: string) => void;
  onRequestEditElement?: (el: NonNullable<SelectedStoryElement>) => void;
}

type DragSession =
  | {
      mode: 'move';
      kind: 'text' | 'sticker';
      id: string;
      startClientX: number;
      startClientY: number;
      origX: number;
      origY: number;
      stageWidth: number;
      stageHeight: number;
    }
  | {
      mode: 'scale';
      kind: 'text' | 'sticker';
      id: string;
      centerClientX: number;
      centerClientY: number;
      startDist: number;
      origFontSize: number;
      origScale: number;
    }
  | {
      mode: 'width';
      id: string;
      edge: 'left' | 'right';
      startClientX: number;
      origWidthPct: number;
      stageWidth: number;
    };

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

export const StoryCanvasEditor: React.FC<StoryCanvasEditorProps> = ({
  slide,
  creatorName,
  creatorAvatar,
  isSaasWide = false,
  selectedElement,
  onSelectElement,
  onUpdateTextLayer,
  onRemoveTextLayer,
  onUpdateSticker,
  onRemoveSticker,
  onRequestEditElement,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const activeTouchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchInitialRef = useRef<{
    dist: number;
    kind: 'text' | 'sticker';
    id: string;
    origFontSize: number;
    origScale: number;
  } | null>(null);

  const [stageWidth, setStageWidth] = useState(310);
  const [snapGuideX, setSnapGuideX] = useState(false);
  const [snapGuideY, setSnapGuideY] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [inlineEditingTextId, setInlineEditingTextId] = useState<string | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => setStageWidth(el.clientWidth || 310);
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedElement || selectedElement.kind !== 'text' || selectedElement.id !== inlineEditingTextId) {
      setInlineEditingTextId(null);
    }
  }, [inlineEditingTextId, selectedElement]);

  useEffect(() => {
    setVideoPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [slide?.id, slide?.video_url]);

  const renderScale = useMemo(() => computeStoryRenderScale(stageWidth), [stageWidth]);

  const slideBackgroundStyle = useMemo<React.CSSProperties>(() => {
    if (!slide) return { background: '#0F172A' };
    if (slide.type === 'image' && slide.image_url) {
      return buildImageBackgroundStyle(slide.image_url, 'hero');
    }
    if (slide.type === 'video' && slide.video_url) {
      return { background: '#090D16' };
    }
    return { background: getGradientPreset(slide.gradient_key).gradient };
  }, [slide]);

  const beginMoveSession = (
    e: React.PointerEvent,
    kind: 'text' | 'sticker',
    id: string,
    origX: number,
    origY: number,
  ) => {
    if (e.button > 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();

    const stage = stageRef.current;
    if (!stage) return;

    activeTouchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activeTouchPointersRef.current.size === 2 && selectedElement) {
      const pts = Array.from(activeTouchPointersRef.current.values());
      const dist = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const targetText = selectedElement.kind === 'text'
        ? slide?.text_layers?.find((t) => t.id === selectedElement.id)
        : null;
      const targetSticker = selectedElement.kind === 'sticker'
        ? slide?.stickers?.find((s) => s.id === selectedElement.id)
        : null;
      pinchInitialRef.current = {
        dist,
        kind: selectedElement.kind,
        id: selectedElement.id,
        origFontSize: Number(targetText?.font_size) || 22,
        origScale: Number(targetSticker?.scale) || 1,
      };
      dragSessionRef.current = null;
      return;
    }

    onSelectElement({ kind, id });
    if (inlineEditingTextId === id) return;

    const rect = stage.getBoundingClientRect();
    dragSessionRef.current = {
      mode: 'move',
      kind,
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX,
      origY,
      stageWidth: rect.width || 310,
      stageHeight: rect.height || 550,
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore if synthetic event
    }
  };

  const beginCornerScaleSession = (
    e: React.PointerEvent,
    kind: 'text' | 'sticker',
    id: string,
    centerXPercent: number,
    centerYPercent: number,
    origFontSize: number,
    origScale: number,
  ) => {
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const centerClientX = rect.left + (centerXPercent / 100) * rect.width;
    const centerClientY = rect.top + (centerYPercent / 100) * rect.height;
    const startDist = Math.max(16, Math.hypot(e.clientX - centerClientX, e.clientY - centerClientY));

    dragSessionRef.current = {
      mode: 'scale',
      kind,
      id,
      centerClientX,
      centerClientY,
      startDist,
      origFontSize,
      origScale,
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const beginWidthSession = (
    e: React.PointerEvent,
    id: string,
    edge: 'left' | 'right',
    origWidthPct: number,
  ) => {
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    dragSessionRef.current = {
      mode: 'width',
      id,
      edge,
      startClientX: e.clientX,
      origWidthPct,
      stageWidth: stage.getBoundingClientRect().width || 310,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleStagePointerDown = (e: React.PointerEvent) => {
    activeTouchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activeTouchPointersRef.current.size === 2 && selectedElement && slide) {
      const pts = Array.from(activeTouchPointersRef.current.values());
      const dist = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const targetText = selectedElement.kind === 'text'
        ? slide.text_layers?.find((t) => t.id === selectedElement.id)
        : null;
      const targetSticker = selectedElement.kind === 'sticker'
        ? slide.stickers?.find((s) => s.id === selectedElement.id)
        : null;
      pinchInitialRef.current = {
        dist,
        kind: selectedElement.kind,
        id: selectedElement.id,
        origFontSize: Number(targetText?.font_size) || 22,
        origScale: Number(targetSticker?.scale) || 1,
      };
      dragSessionRef.current = null;
      return;
    }

    if (e.target === e.currentTarget) {
      onSelectElement(null);
      setInlineEditingTextId(null);
    }
  };

  const handleStagePointerMove = (e: React.PointerEvent) => {
    if (activeTouchPointersRef.current.has(e.pointerId)) {
      activeTouchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // دو انگشت در موبایل: بزرگ/کوچک‌سازی بدون چرخش
    if (activeTouchPointersRef.current.size >= 2 && pinchInitialRef.current) {
      const pts = Array.from(activeTouchPointersRef.current.values());
      const dist = Math.max(12, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const ratio = dist / pinchInitialRef.current.dist;
      if (pinchInitialRef.current.kind === 'text') {
        const nextFontSize = Math.round(clamp(pinchInitialRef.current.origFontSize * ratio, 12, 64));
        onUpdateTextLayer(pinchInitialRef.current.id, { font_size: nextFontSize });
      } else {
        const nextScale = Number(clamp(pinchInitialRef.current.origScale * ratio, 0.55, 2.4).toFixed(2));
        onUpdateSticker(pinchInitialRef.current.id, { scale: nextScale });
      }
      return;
    }

    const session = dragSessionRef.current;
    if (!session) return;

    if (session.mode === 'move') {
      const dxPct = ((e.clientX - session.startClientX) / session.stageWidth) * 100;
      const dyPct = ((e.clientY - session.startClientY) / session.stageHeight) * 100;
      let nextX = clamp(session.origX + dxPct, 6, 94);
      let nextY = clamp(session.origY + dyPct, 8, 92);

      const snappedX = Math.abs(nextX - 50) < 2.4;
      const snappedY = Math.abs(nextY - 50) < 2.4;
      if (snappedX) nextX = 50;
      if (snappedY) nextY = 50;
      setSnapGuideX(snappedX);
      setSnapGuideY(snappedY);

      const roundedX = Number(nextX.toFixed(1));
      const roundedY = Number(nextY.toFixed(1));
      if (session.kind === 'text') {
        onUpdateTextLayer(session.id, { x: roundedX, y: roundedY });
      } else {
        onUpdateSticker(session.id, { x: roundedX, y: roundedY });
      }
      return;
    }

    if (session.mode === 'scale') {
      const currentDist = Math.max(12, Math.hypot(e.clientX - session.centerClientX, e.clientY - session.centerClientY));
      const ratio = currentDist / session.startDist;
      if (session.kind === 'text') {
        const nextFontSize = Math.round(clamp(session.origFontSize * ratio, 12, 64));
        onUpdateTextLayer(session.id, { font_size: nextFontSize });
      } else {
        const nextScale = Number(clamp(session.origScale * ratio, 0.55, 2.4).toFixed(2));
        onUpdateSticker(session.id, { scale: nextScale });
      }
      return;
    }

    if (session.mode === 'width') {
      const deltaPct = ((e.clientX - session.startClientX) / session.stageWidth) * 100 * 2;
      const signedDelta = session.edge === 'right' ? deltaPct : -deltaPct;
      const nextWidthPct = Math.round(clamp(session.origWidthPct + signedDelta, 28, 92));
      onUpdateTextLayer(session.id, { width_pct: nextWidthPct });
    }
  };

  const endPointerInteractions = (e?: React.PointerEvent) => {
    if (e) {
      activeTouchPointersRef.current.delete(e.pointerId);
    } else {
      activeTouchPointersRef.current.clear();
    }
    if (activeTouchPointersRef.current.size < 2) {
      pinchInitialRef.current = null;
    }
    dragSessionRef.current = null;
    setSnapGuideX(false);
    setSnapGuideY(false);
  };

  const adjustSelectedScaleStep = (delta: number) => {
    if (!selectedElement || !slide) return;
    if (selectedElement.kind === 'text') {
      const target = slide.text_layers?.find((t) => t.id === selectedElement.id);
      if (!target) return;
      onUpdateTextLayer(target.id, { font_size: Math.round(clamp((target.font_size || 22) + delta * 3, 12, 64)) });
    } else {
      const target = slide.stickers?.find((s) => s.id === selectedElement.id);
      if (!target) return;
      onUpdateSticker(target.id, { scale: Number(clamp((target.scale || 1) + delta * 0.14, 0.55, 2.4).toFixed(2)) });
    }
  };

  const displayCreatorName = isSaasWide ? SAAS_STORY_CREATOR_NAME : (creatorName || 'شما');
  const displayCreatorAvatar = isSaasWide ? SAAS_STORY_AVATAR_URL : creatorAvatar;

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={endPointerInteractions}
        onPointerCancel={endPointerInteractions}
        className="relative w-full max-w-[310px] aspect-[9/16] rounded-[22px] overflow-hidden border border-slate-200 dark:border-dark-border shadow-[0_18px_46px_rgba(15,23,42,0.16)] dark:shadow-[0_18px_46px_rgba(0,0,0,0.45)] touch-none"
        style={slideBackgroundStyle}
      >
        {/* ویدیوی واقعی در صورت ویدیویی بودن اسلاید */}
        {slide?.type === 'video' && slide.video_url && (
          <>
            <video
              ref={videoRef}
              src={slide.video_url}
              muted={slide.video_muted !== false}
              playsInline
              loop
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) {
                  void video.play().catch(() => undefined);
                  setVideoPlaying(true);
                } else {
                  video.pause();
                  setVideoPlaying(false);
                }
              }}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) {
                  void video.play().catch(() => undefined);
                  setVideoPlaying(true);
                } else {
                  video.pause();
                  setVideoPlaying(false);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-slate-950/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md border border-white/20 hover:bg-slate-950/80 cursor-pointer"
            >
              {videoPlaying ? <PauseOutlined /> : <PlayCircleFilled />}
              <span>{videoPlaying ? 'توقف' : 'پخش ویدیو'}</span>
            </button>
            <div className="pointer-events-none absolute top-14 left-3 z-20 inline-flex items-center gap-1 rounded-full bg-slate-950/55 px-2 py-0.5 text-[10px] text-white backdrop-blur">
              {slide.video_muted ? <AudioMutedOutlined /> : <SoundOutlined />}
              <span>{slide.video_muted ? 'بی‌صدا' : 'باصدا'}</span>
            </div>
          </>
        )}

        {/* هدر شبیه‌سازی‌شده استوری در بوم */}
        <div className="pointer-events-none absolute top-2.5 inset-x-3 z-10 flex flex-col gap-2">
          <div className="h-[3px] w-full rounded-full bg-white/40 overflow-hidden">
            <div className="h-full w-3/5 rounded-full bg-white" />
          </div>
          <div className="flex items-center gap-2" dir="rtl">
            <ProfileAvatar
              size={28}
              src={displayCreatorAvatar || undefined}
              name={displayCreatorName}
              style={{
                border: '1.5px solid rgba(255,255,255,0.85)',
                backgroundColor: '#fff',
                flexShrink: 0,
              }}
            />
            <span className="text-[11px] font-bold text-white drop-shadow truncate">
              {displayCreatorName}
            </span>
          </div>
        </div>

        {/* خطوط راهنمای تراز وسط */}
        {snapGuideX && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-sky-400/90 shadow-[0_0_8px_rgba(56,189,248,0.8)] z-30" />
        )}
        {snapGuideY && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-sky-400/90 shadow-[0_0_8px_rgba(56,189,248,0.8)] z-30" />
        )}

        {/* لایه‌های متن */}
        {(slide?.text_layers || []).map((layer) => {
          const isSelected = selectedElement?.kind === 'text' && selectedElement.id === layer.id;
          const isEditingInline = inlineEditingTextId === layer.id;
          const widthPct = clamp(Number(layer.width_pct) || 74, 26, 92);

          return (
            <div
              key={layer.id}
              onPointerDown={(e) => beginMoveSession(e, 'text', layer.id, layer.x, layer.y)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectElement({ kind: 'text', id: layer.id });
                setInlineEditingTextId(layer.id);
              }}
              style={{
                position: 'absolute',
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                transform: 'translate(-50%, -50%)',
                width: `${widthPct}%`,
                zIndex: isSelected ? 28 : 18,
                cursor: isEditingInline ? 'text' : 'move',
              }}
            >
              <div
                className="relative"
                style={{
                  border: isSelected ? '1.5px dashed rgba(255,255,255,0.96)' : '1.5px dashed transparent',
                  borderRadius: 12,
                  boxShadow: isSelected ? '0 0 0 1px rgba(15,23,42,0.45)' : 'none',
                  padding: isSelected ? 2 : 0,
                }}
              >
                {isEditingInline ? (
                  <textarea
                    autoFocus
                    value={layer.content}
                    onChange={(e) => onUpdateTextLayer(layer.id, { content: e.target.value })}
                    onBlur={() => setInlineEditingTextId(null)}
                    onPointerDown={(e) => e.stopPropagation()}
                    rows={Math.max(1, Math.min(6, (layer.content || '').split('\n').length))}
                    style={{
                      ...buildStoryTextLayerStyle(layer, renderScale),
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      resize: 'none',
                    }}
                  />
                ) : (
                  <div style={buildStoryTextLayerStyle(layer, renderScale)}>
                    {layer.content || 'متن خود را بنویسید'}
                  </div>
                )}

                {isSelected && !isEditingInline && (
                  <>
                    {/* اکشن بالای کادر */}
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-slate-900/90 px-2 py-0.5 text-white shadow-lg backdrop-blur"
                    >
                      <button
                        type="button"
                        onClick={() => setInlineEditingTextId(layer.id)}
                        className="text-[11px] px-1.5 py-0.5 hover:text-sky-300 cursor-pointer"
                        title="ویرایش متن"
                      >
                        <EditOutlined />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveTextLayer(layer.id);
                          onSelectElement(null);
                        }}
                        className="text-[11px] px-1.5 py-0.5 text-rose-300 hover:text-rose-400 cursor-pointer"
                        title="حذف متن"
                      >
                        <DeleteOutlined />
                      </button>
                    </div>

                    {/* دستگیره‌های گوشه برای تغییر اندازه (بدون چرخش) */}
                    {([
                      { pos: '-top-1.5 -left-1.5 cursor-nwse-resize', key: 'nw' },
                      { pos: '-top-1.5 -right-1.5 cursor-nesw-resize', key: 'ne' },
                      { pos: '-bottom-1.5 -left-1.5 cursor-nesw-resize', key: 'sw' },
                      { pos: '-bottom-1.5 -right-1.5 cursor-nwse-resize', key: 'se' },
                    ] as const).map((handle) => (
                      <div
                        key={handle.key}
                        onPointerDown={(e) =>
                          beginCornerScaleSession(
                            e,
                            'text',
                            layer.id,
                            layer.x,
                            layer.y,
                            layer.font_size || 22,
                            1,
                          )
                        }
                        className={`hidden md:block absolute ${handle.pos} w-3.5 h-3.5 rounded-full bg-white border-2 border-[rgb(var(--brand-500-rgb,55_48_163))] shadow`}
                        title="کشیدن برای تغییر اندازه متن"
                      />
                    ))}

                    {/* دستگیره‌های چپ و راست برای عرض کادر متن */}
                    <div
                      onPointerDown={(e) => beginWidthSession(e, layer.id, 'left', widthPct)}
                      className="hidden md:block absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-5 rounded-full bg-white border border-slate-500 shadow cursor-ew-resize"
                      title="تغییر عرض کادر متن"
                    />
                    <div
                      onPointerDown={(e) => beginWidthSession(e, layer.id, 'right', widthPct)}
                      className="hidden md:block absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-5 rounded-full bg-white border border-slate-500 shadow cursor-ew-resize"
                      title="تغییر عرض کادر متن"
                    />
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* لایه‌های استیکر */}
        {(slide?.stickers || []).map((sticker) => {
          const isSelected = selectedElement?.kind === 'sticker' && selectedElement.id === sticker.id;
          return (
            <div
              key={sticker.id}
              onPointerDown={(e) => beginMoveSession(e, 'sticker', sticker.id, sticker.x, sticker.y)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectElement({ kind: 'sticker', id: sticker.id });
                onRequestEditElement?.({ kind: 'sticker', id: sticker.id });
              }}
              style={{
                position: 'absolute',
                left: `${sticker.x}%`,
                top: `${sticker.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: isSelected ? 29 : 20,
                cursor: 'move',
              }}
            >
              <div
                className="relative"
                style={{
                  border: isSelected ? '1.5px dashed rgba(255,255,255,0.96)' : '1.5px dashed transparent',
                  borderRadius: 14,
                  boxShadow: isSelected ? '0 0 0 1px rgba(15,23,42,0.45)' : 'none',
                  padding: isSelected ? 4 : 0,
                }}
              >
                <StoryStickerVisual
                  sticker={sticker}
                  renderScale={renderScale}
                  isEditor
                />

                {isSelected && (
                  <>
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-slate-900/90 px-2 py-0.5 text-white shadow-lg backdrop-blur"
                    >
                      {(sticker.type === 'mention' || sticker.type === 'link' || sticker.type === 'audio' || sticker.type === 'badge') && (
                        <button
                          type="button"
                          onClick={() => onRequestEditElement?.({ kind: 'sticker', id: sticker.id })}
                          className="text-[11px] px-1.5 py-0.5 hover:text-sky-300 cursor-pointer"
                          title="ویرایش استیکر"
                        >
                          <EditOutlined />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onRemoveSticker(sticker.id);
                          onSelectElement(null);
                        }}
                        className="text-[11px] px-1.5 py-0.5 text-rose-300 hover:text-rose-400 cursor-pointer"
                        title="حذف استیکر"
                      >
                        <DeleteOutlined />
                      </button>
                    </div>

                    {([
                      { pos: '-top-1.5 -left-1.5 cursor-nwse-resize', key: 'nw' },
                      { pos: '-top-1.5 -right-1.5 cursor-nesw-resize', key: 'ne' },
                      { pos: '-bottom-1.5 -left-1.5 cursor-nesw-resize', key: 'sw' },
                      { pos: '-bottom-1.5 -right-1.5 cursor-nwse-resize', key: 'se' },
                    ] as const).map((handle) => (
                      <div
                        key={handle.key}
                        onPointerDown={(e) =>
                          beginCornerScaleSession(
                            e,
                            'sticker',
                            sticker.id,
                            sticker.x,
                            sticker.y,
                            22,
                            Number(sticker.scale) || 1,
                          )
                        }
                        className={`hidden md:block absolute ${handle.pos} w-3.5 h-3.5 rounded-full bg-white border-2 border-[rgb(var(--brand-500-rgb,55_48_163))] shadow`}
                        title="کشیدن برای بزرگ یا کوچک کردن استیکر"
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* دکمه لینک قدیمی اسلاید (سازگار با نسخه‌های قبل) */}
        {slide?.link_url && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-15">
            <div className="rounded-full bg-white/25 backdrop-blur-md border border-white/40 px-3.5 py-1 text-[11px] font-semibold text-white whitespace-nowrap">
              {slide.link_label || 'مشاهده بیشتر'}
            </div>
          </div>
        )}
      </div>

      {/* نوار کنترل سریع اندازه در زیر بوم برای دسکتاپ و موبایل */}
      {selectedElement ? (
        <div className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-dark-border bg-white/95 dark:bg-dark-surface px-2.5 py-1 shadow-sm text-[11px] text-slate-600 dark:text-slate-300" dir="rtl">
          <Tooltip title="کوچک‌تر">
            <Button
              size="small"
              type="text"
              icon={<ZoomOutOutlined />}
              onClick={() => adjustSelectedScaleStep(-1)}
            />
          </Tooltip>
          <span className="px-1 font-medium">
            {selectedElement.kind === 'text' ? 'بزرگ‌نمایی متن' : 'اندازه استیکر'}
          </span>
          <Tooltip title="بزرگ‌تر">
            <Button
              size="small"
              type="text"
              icon={<ZoomInOutlined />}
              onClick={() => adjustSelectedScaleStep(1)}
            />
          </Tooltip>
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center" dir="rtl">
          برای جابجایی بکشید • با کادر (دسکتاپ) یا دو انگشت (موبایل) اندازه را تغییر دهید
        </div>
      )}
    </div>
  );
};
