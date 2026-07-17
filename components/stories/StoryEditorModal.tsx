import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DeleteOutlined,
  FontSizeOutlined,
  PictureOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Button,
  Col,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { supabase } from '../../supabaseClient';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../../utils/storageClient';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import PersianDatePicker from '../PersianDatePicker';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { STORY_GRADIENT_PRESET_LIST, getGradientPreset } from '../../utils/storyGradients';
import { createWorkflowId as createId } from '../../utils/workflowTypes';
import { normalizePublicAssetUrl } from '../../utils/assetUrl';
import { buildImageBackgroundStyle } from '../../utils/imagePreview';
import type {
  OrgStory,
  StorySlide,
  StoryTextLayer,
} from './storyTypes';
import { DEFAULT_SLIDE_DURATION_MS, DEFAULT_TEXT_LAYER } from './storyTypes';

interface StoryEditorModalProps {
  open: boolean;
  orgId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string | null;
  editingStory?: OrgStory | null;
  canPublishSaasStory?: boolean;
  canPublishSaasAdminStory?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onNotifySms?: (storyId: string, text: string, recipientIds: string[]) => void;
}

// موقعیت‌های پیش‌فرض متن در شبکه ۳×۳ (x,y درصد)
const POSITION_PRESETS = [
  { x: 15, y: 15 }, { x: 50, y: 15 }, { x: 85, y: 15 },
  { x: 15, y: 50 }, { x: 50, y: 50 }, { x: 85, y: 50 },
  { x: 15, y: 85 }, { x: 50, y: 85 }, { x: 85, y: 85 },
];

// ─────────────────────────────────────────────
// کامپوننت اصلی ویرایشگر استوری
// ─────────────────────────────────────────────
const StoryEditorModal: React.FC<StoryEditorModalProps> = ({
  open,
  orgId,
  currentUserId: _currentUserId,
  currentUserName,
  currentUserAvatar,
  editingStory,
  canPublishSaasStory = false,
  canPublishSaasAdminStory = false,
  onClose,
  onSaved,
  onNotifySms,
}) => {
  const [slides, setSlides] = useState<StorySlide[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [isOrgWide, setIsOrgWide] = useState(true);
  const [isSaasWide, setIsSaasWide] = useState(false);
  const [isSaasAdminsOnly, setIsSaasAdminsOnly] = useState(false);
  const [viewerUserIds, setViewerUserIds] = useState<string[]>([]);
  const [viewerRoleIds, setViewerRoleIds] = useState<string[]>([]);
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [notifySms, setNotifySms] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsRecipientIds, setSmsRecipientIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // popup container — دراپ‌داون‌ها و تقویم داخل مودال باز می‌شوند نه زیر آن
  const OVERLAY_Z_BASE = 1400;
  const popupContainer = (triggerNode?: HTMLElement | null) => {
    const host = triggerNode?.closest?.(
      '.ant-modal-body, .ant-modal-content, .ant-modal'
    ) as HTMLElement | null;
    return host || resolveOverlayPopupContainer(triggerNode);
  };

  const isEdit = Boolean(editingStory);

  // بارگذاری استوری در حالت ویرایش
  useEffect(() => {
    if (!open) return;
    if (editingStory) {
      setSlides(editingStory.slides ?? []);
      setIsOrgWide(editingStory.is_org_wide);
      setIsSaasWide(editingStory.is_saas_wide ?? false);
      setIsSaasAdminsOnly(editingStory.is_saas_admins_only ?? false);
      setViewerUserIds(editingStory.viewer_user_ids ?? []);
      setViewerRoleIds(editingStory.viewer_role_ids ?? []);
      setMentionUserIds(editingStory.mention_user_ids ?? []);
      setExpiresAt(editingStory.expires_at);
    } else {
      setSlides([createGradientSlide('brand_indigo')]);
      setIsOrgWide(true);
      setIsSaasWide(false);
      setIsSaasAdminsOnly(false);
      setViewerUserIds([]);
      setViewerRoleIds([]);
      setMentionUserIds([]);
      setExpiresAt(null);
      setNotifySms(false);
      setSmsText('');
      setSmsRecipientIds([]);
    }
    setActiveSlideIdx(0);
  }, [open, editingStory]);

  const activeSlide = slides[activeSlideIdx] ?? null;

  // ─── مدیریت اسلایدها ───────────────────────

  const updateActiveSlide = useCallback(
    (updater: (slide: StorySlide) => StorySlide) => {
      setSlides((prev) =>
        prev.map((s, i) => (i === activeSlideIdx ? updater(s) : s))
      );
    },
    [activeSlideIdx]
  );

  const addImageSlide = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : createId();
      const path = `stories/${orgId}/${randomPart}.${ext}`;
      const { error: uploadError } = await fileStorageClient.storage
        .from(FILE_STORAGE_BUCKET)
        .upload(path, file, { cacheControl: '31536000', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = fileStorageClient.storage
        .from(FILE_STORAGE_BUCKET)
        .getPublicUrl(path);

      const slide: StorySlide = {
        id: createId(),
        type: 'image',
        image_url: normalizePublicAssetUrl(urlData.publicUrl) || urlData.publicUrl,
        text_layers: [],
        duration_ms: DEFAULT_SLIDE_DURATION_MS,
      };
      setSlides((prev) => [...prev, slide]);
      setActiveSlideIdx(slides.length);
    } catch {
      message.error('آپلود تصویر ناموفق بود');
    } finally {
      setUploading(false);
    }
  };

  const removeSlide = (idx: number) => {
    if (slides.length <= 1) {
      message.warning('حداقل یک اسلاید باید داشته باشید');
      return;
    }
    setSlides((prev) => prev.filter((_, i) => i !== idx));
    setActiveSlideIdx((prev) => Math.max(0, prev > idx ? prev - 1 : prev));
  };

  // ─── لایه‌های متن ──────────────────────────

  const addTextLayer = () => {
    updateActiveSlide((slide) => ({
      ...slide,
      text_layers: [
        ...slide.text_layers,
        { id: createId(), ...DEFAULT_TEXT_LAYER },
      ],
    }));
  };

  const updateTextLayer = (layerId: string, changes: Partial<StoryTextLayer>) => {
    updateActiveSlide((slide) => ({
      ...slide,
      text_layers: slide.text_layers.map((l) =>
        l.id === layerId ? { ...l, ...changes } : l
      ),
    }));
  };

  const removeTextLayer = (layerId: string) => {
    updateActiveSlide((slide) => ({
      ...slide,
      text_layers: slide.text_layers.filter((l) => l.id !== layerId),
    }));
  };

  // ─── ذخیره ─────────────────────────────────

  const handleSave = async () => {
    if (slides.length === 0) {
      message.warning('حداقل یک اسلاید اضافه کنید');
      return;
    }
    setSaving(true);
    try {
      const updatePayload = {
        creator_name: currentUserName,
        slides,
        is_org_wide: isOrgWide,
        is_saas_wide: isSaasWide,
        is_saas_admins_only: isSaasWide ? isSaasAdminsOnly : false,
        viewer_user_ids: isOrgWide ? [] : viewerUserIds,
        viewer_role_ids: isOrgWide ? [] : viewerRoleIds,
        mention_user_ids: mentionUserIds,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      };

      let storyId: string;

      if (isEdit && editingStory) {
        const { error } = await supabase
          .from('org_stories')
          .update(updatePayload)
          .eq('id', editingStory.id);
        if (error) throw error;
        storyId = editingStory.id;
      } else {
        // INSERT از طریق SECURITY DEFINER RPC — creator_id و org_id سرور ست می‌کنه
        const { data, error } = await supabase.rpc('create_org_story', {
          p_creator_name: currentUserName,
          p_creator_avatar: normalizePublicAssetUrl(currentUserAvatar) || null,
          p_slides: slides,
          p_is_org_wide: isOrgWide,
          p_is_saas_wide: isSaasWide,
          p_is_saas_admins_only: isSaasWide ? isSaasAdminsOnly : false,
          p_viewer_user_ids: isOrgWide ? [] : viewerUserIds,
          p_viewer_role_ids: isOrgWide ? [] : viewerRoleIds,
          p_mention_user_ids: mentionUserIds,
          p_expires_at: expiresAt,
        });
        if (error) throw error;
        storyId = data as string;
      }

      // ارسال پیامک اطلاع‌رسانی
      if (notifySms && smsText && smsRecipientIds.length > 0 && onNotifySms) {
        onNotifySms(storyId, smsText, smsRecipientIds);
      }

      message.success(isEdit ? 'استوری ویرایش شد' : 'استوری منتشر شد');
      onSaved();
      onClose();
    } catch {
      message.error('خطا در ذخیره استوری');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const slideBackground: React.CSSProperties = (() => {
    if (!activeSlide) return {};
    if (activeSlide.type === 'image' && activeSlide.image_url)
      return buildImageBackgroundStyle(activeSlide.image_url, 'hero');
    return { background: getGradientPreset(activeSlide.gradient_key).gradient };
  })();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={isEdit ? 'ویرایش استوری' : 'استوری جدید'}
      zIndex={1401}
      width={820}
      footer={
        <Space>
          <Button onClick={onClose}>انصراف</Button>
          <Button type="primary" loading={saving} onClick={handleSave}>
            {isEdit ? 'ذخیره تغییرات' : 'انتشار استوری'}
          </Button>
        </Space>
      }
      styles={{ body: { padding: '16px 20px' } }}
    >
      <Row gutter={16}>
        {/* ─── ستون چپ: پیش‌نمایش + ابزارهای اسلاید ─── */}
        <Col xs={24} md={10}>
          {/* پیش‌نمایش اسلاید */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '9/16',
              borderRadius: 12,
              overflow: 'hidden',
              ...slideBackground,
              marginBottom: 10,
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            }}
          >
            {activeSlide?.text_layers.map((layer) => (
              <div
                key={layer.id}
                style={{
                  position: 'absolute',
                  left: `${layer.x}%`,
                  top: `${layer.y}%`,
                  transform: 'translate(-50%, -50%)',
                  color: layer.color,
                  fontSize: layer.font_size,
                  fontWeight: layer.bold ? 'bold' : 'normal',
                  textAlign: layer.align,
                  direction: 'rtl',
                  textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                  pointerEvents: 'none',
                  maxWidth: '85%',
                  wordBreak: 'break-word',
                  lineHeight: 1.4,
                }}
              >
                {layer.content || '...'}
              </div>
            ))}
            {!activeSlide && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
                <Typography.Text type="secondary">اسلایدی انتخاب نشده</Typography.Text>
              </div>
            )}
          </div>

          {/* نوار اسلایدها */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {slides.map((slide, idx) => (
              <div
                key={slide.id}
                onClick={() => setActiveSlideIdx(idx)}
                style={{
                  width: 44,
                  height: 78,
                  borderRadius: 6,
                  flexShrink: 0,
                  cursor: 'pointer',
                  border: idx === activeSlideIdx ? '2px solid var(--brand-primary, #3730A3)' : '2px solid transparent',
                  overflow: 'hidden',
                  position: 'relative',
                  ...(slide.type === 'image' && slide.image_url
                    ? buildImageBackgroundStyle(slide.image_url, 'thumb')
                    : { background: getGradientPreset(slide.gradient_key).gradient }),
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); removeSlide(idx); }}
                  style={{
                    position: 'absolute',
                    top: 2, right: 2,
                    background: 'rgba(0,0,0,0.4)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 16, height: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 9,
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            {/* افزودن اسلاید جدید */}
            <Tooltip title="افزودن اسلاید">
              <div
                style={{
                  width: 44, height: 78, borderRadius: 6, flexShrink: 0,
                  border: '2px dashed #CBD5E1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#94A3B8', fontSize: 20,
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <PlusOutlined />
              </div>
            </Tooltip>
          </div>

          {/* ابزارهای افزودن اسلاید */}
          <Space wrap style={{ marginTop: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) addImageSlide(file);
                e.target.value = '';
              }}
            />
            <Button
              size="small"
              icon={<PictureOutlined />}
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              از دستگاه
            </Button>
          </Space>
        </Col>

        {/* ─── ستون راست: تنظیمات ─── */}
        <Col xs={24} md={14}>
          {/* انتخاب گرادینت */}
          <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
            گرادینت پس‌زمینه
          </Typography.Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {STORY_GRADIENT_PRESET_LIST.map((g) => (
              <Tooltip key={g.key} title={g.label}>
                <div
                  onClick={() =>
                    updateActiveSlide((s) => ({
                      ...s,
                      type: 'gradient',
                      gradient_key: g.key,
                      image_url: undefined,
                    }))
                  }
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: g.gradient,
                    cursor: 'pointer',
                    border:
                      activeSlide?.type === 'gradient' && activeSlide.gradient_key === g.key
                        ? '2px solid var(--brand-primary, #3730A3)'
                        : '2px solid transparent',
                    transition: 'border 0.15s',
                  }}
                />
              </Tooltip>
            ))}
          </div>

          <Divider style={{ margin: '8px 0' }} />

          {/* لایه‌های متن */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Typography.Text strong>لایه‌های متن</Typography.Text>
            <Button size="small" icon={<FontSizeOutlined />} onClick={addTextLayer}>
              افزودن متن
            </Button>
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeSlide?.text_layers.map((layer) => (
              <div
                key={layer.id}
                className="border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 rounded-lg"
                style={{ padding: '8px 10px' }}
              >
                <Row gutter={6} align="middle">
                  <Col flex={1}>
                    <Input
                      size="small"
                      placeholder="متن اسلاید..."
                      value={layer.content}
                      onChange={(e) => updateTextLayer(layer.id, { content: e.target.value })}
                      style={{ direction: 'rtl' }}
                    />
                  </Col>
                  <Col>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeTextLayer(layer.id)}
                    />
                  </Col>
                </Row>
                <Row gutter={6} style={{ marginTop: 4 }}>
                  <Col span={8}>
                    <Select
                      size="small"
                      value={layer.align}
                      onChange={(v) => updateTextLayer(layer.id, { align: v })}
                      style={{ width: '100%' }}
                      getPopupContainer={popupContainer}
                      options={[
                        { label: 'راست', value: 'right' },
                        { label: 'وسط', value: 'center' },
                        { label: 'چپ', value: 'left' },
                      ]}
                    />
                  </Col>
                  <Col span={8}>
                    <Input
                      size="small"
                      type="number"
                      min={10}
                      max={60}
                      value={layer.font_size}
                      onChange={(e) => updateTextLayer(layer.id, { font_size: Number(e.target.value) })}
                      prefix={<span style={{ fontSize: 10 }}>px</span>}
                    />
                  </Col>
                  <Col span={4}>
                    <input
                      type="color"
                      value={layer.color}
                      onChange={(e) => updateTextLayer(layer.id, { color: e.target.value })}
                      style={{ width: 32, height: 28, border: 'none', cursor: 'pointer', borderRadius: 4 }}
                    />
                  </Col>
                  <Col span={4}>
                    <Tooltip title="ضخیم">
                      <Button
                        size="small"
                        type={layer.bold ? 'primary' : 'default'}
                        onClick={() => updateTextLayer(layer.id, { bold: !layer.bold })}
                        style={{ fontWeight: 'bold' }}
                      >
                        B
                      </Button>
                    </Tooltip>
                  </Col>
                </Row>
                {/* انتخاب موقعیت متن — شبکه ۳×۳ */}
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--kalam-text-secondary, #64748B)', marginBottom: 4, display: 'block' }}>موقعیت</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, width: 72 }}>
                    {POSITION_PRESETS.map((pos) => {
                      const isActive = layer.x === pos.x && layer.y === pos.y;
                      return (
                        <div
                          key={`${pos.x}-${pos.y}`}
                          onClick={() => updateTextLayer(layer.id, { x: pos.x, y: pos.y })}
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            cursor: 'pointer',
                            backgroundColor: isActive
                              ? 'var(--brand-primary, #3730A3)'
                              : 'var(--kalam-border, #CBD5E1)',
                            transition: 'background-color 0.15s',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            {activeSlide?.text_layers.length === 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                روی «افزودن متن» کلیک کنید
              </Typography.Text>
            )}
          </div>

          <Divider style={{ margin: '10px 0' }} />

          {/* لینک اسلاید */}
          {activeSlide && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Typography.Text strong>لینک اسلاید</Typography.Text>
                {activeSlide.link_url && (
                  <Button
                    size="small"
                    type="text"
                    danger
                    onClick={() => updateActiveSlide((s) => ({ ...s, link_url: undefined, link_type: undefined, link_label: undefined }))}
                  >
                    حذف لینک
                  </Button>
                )}
              </div>
              <Row gutter={6} style={{ marginBottom: 8 }}>
                <Col span={7}>
                  <Select
                    size="small"
                    value={activeSlide.link_type ?? 'external'}
                    onChange={(v) => updateActiveSlide((s) => ({ ...s, link_type: v }))}
                    style={{ width: '100%' }}
                    getPopupContainer={popupContainer}
                    options={[
                      { label: 'خارجی', value: 'external' },
                      { label: 'داخلی', value: 'internal' },
                    ]}
                  />
                </Col>
                <Col span={17}>
                  <Input
                    size="small"
                    value={activeSlide.link_url ?? ''}
                    onChange={(e) =>
                      updateActiveSlide((s) => ({
                        ...s,
                        link_url: e.target.value || undefined,
                        link_type: s.link_type ?? 'external',
                      }))
                    }
                    placeholder={activeSlide.link_type === 'internal' ? '/module/customers/123' : 'https://...'}
                    style={{ direction: 'ltr' }}
                  />
                </Col>
              </Row>
              <Row gutter={6} style={{ marginBottom: 4 }}>
                <Col span={24}>
                  <Input
                    size="small"
                    value={activeSlide.link_label ?? ''}
                    onChange={(e) =>
                      updateActiveSlide((s) => ({ ...s, link_label: e.target.value || undefined }))
                    }
                    placeholder="برچسب دکمه (اختیاری) — پیش‌فرض: مشاهده بیشتر"
                    style={{ direction: 'rtl' }}
                  />
                </Col>
              </Row>
            </>
          )}

          <Divider style={{ margin: '10px 0' }} />

          {/* منشن کاربران */}
          <Form.Item label="منشن کاربران" style={{ marginBottom: 10 }}>
            <AdaptiveIdentityPicker
              mode="multiple"
              scopes={['user']}
              valueMode="raw"
              value={mentionUserIds}
              onChange={(v) => setMentionUserIds(v as string[])}
              placeholder="@ انتخاب کاربران"
              getPopupContainer={popupContainer as any}
              modalContainer={popupContainer}
              preferLocalPopupContainer
              overlayZIndexBase={OVERLAY_Z_BASE}
            />
          </Form.Item>

          {/* دسترسی مشاهده */}
          <Form.Item label="مخاطبان" style={{ marginBottom: 10 }}>
            <Switch
              checked={isOrgWide}
              onChange={setIsOrgWide}
              checkedChildren="همه اعضا"
              unCheckedChildren="محدود"
            />
          </Form.Item>

          {!isOrgWide && (
            <>
              <Form.Item label="کاربران مجاز" style={{ marginBottom: 8 }}>
                <AdaptiveIdentityPicker
                  mode="multiple"
                  scopes={['user']}
                  valueMode="raw"
                  value={viewerUserIds}
                  onChange={(v) => setViewerUserIds(v as string[])}
                  placeholder="انتخاب کاربران"
                  getPopupContainer={popupContainer as any}
                  modalContainer={popupContainer}
                  preferLocalPopupContainer
                  overlayZIndexBase={OVERLAY_Z_BASE}
                />
              </Form.Item>
              <Form.Item label="نقش‌های مجاز" style={{ marginBottom: 8 }}>
                <AdaptiveIdentityPicker
                  mode="multiple"
                  scopes={['role']}
                  valueMode="raw"
                  value={viewerRoleIds}
                  onChange={(v) => setViewerRoleIds(v as string[])}
                  placeholder="انتخاب نقش‌ها"
                  getPopupContainer={popupContainer as any}
                  modalContainer={popupContainer}
                  preferLocalPopupContainer
                  overlayZIndexBase={OVERLAY_Z_BASE}
                />
              </Form.Item>
            </>
          )}

          {/* تاریخ انقضا */}
          <Form.Item label="انقضا" style={{ marginBottom: 10 }}>
            <PersianDatePicker
              type="DATETIME"
              value={expiresAt || ''}
              onChange={(v) => setExpiresAt(v || null)}
              placeholder="بدون انقضا"
              modalContainer={popupContainer}
              overlayZIndexBase={OVERLAY_Z_BASE}
            />
          </Form.Item>

          {/* انتشار SaaS — فقط برای ادمین‌های SaaS */}
          {(canPublishSaasStory || canPublishSaasAdminStory) && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <Form.Item
                label="انتشار برای کاربران تازه‌سیستم"
                tooltip="استوری برای همه کاربران همه سازمان‌ها نمایش داده می‌شود"
                style={{ marginBottom: 10 }}
              >
                <Switch
                  checked={isSaasWide}
                  onChange={(v) => {
                    setIsSaasWide(v);
                    if (!v) setIsSaasAdminsOnly(false);
                  }}
                  checkedChildren="فعال"
                  unCheckedChildren="غیرفعال"
                  disabled={!canPublishSaasStory && !canPublishSaasAdminStory}
                />
              </Form.Item>
              {isSaasWide && canPublishSaasAdminStory && (
                <Form.Item
                  label="فقط برای مدیران سازمان‌ها"
                  tooltip="استوری فقط برای صاحبان و مدیران اصلی سازمان‌ها نمایش داده می‌شود"
                  style={{ marginBottom: 10 }}
                >
                  <Switch
                    checked={isSaasAdminsOnly}
                    onChange={setIsSaasAdminsOnly}
                    checkedChildren="فعال"
                    unCheckedChildren="غیرفعال"
                  />
                </Form.Item>
              )}
            </>
          )}

          <Divider style={{ margin: '8px 0' }} />

          {/* اطلاع‌رسانی پیامکی */}
          <Form.Item label="اطلاع‌رسانی پیامکی" style={{ marginBottom: 8 }}>
            <Switch
              checked={notifySms}
              onChange={setNotifySms}
              checkedChildren="فعال"
              unCheckedChildren="غیرفعال"
            />
          </Form.Item>

          {notifySms && (
            <>
              <Form.Item label="متن پیامک" style={{ marginBottom: 8 }}>
                <Input.TextArea
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                  rows={2}
                  placeholder="متن پیامک را وارد کنید..."
                  style={{ direction: 'rtl' }}
                />
              </Form.Item>
              <Form.Item label="گیرندگان پیامک" style={{ marginBottom: 8 }}>
                <AdaptiveIdentityPicker
                  mode="multiple"
                  scopes={['user']}
                  valueMode="raw"
                  value={smsRecipientIds}
                  onChange={(v) => setSmsRecipientIds(v as string[])}
                  placeholder="انتخاب کاربران"
                  getPopupContainer={popupContainer as any}
                  modalContainer={popupContainer}
                  preferLocalPopupContainer
                  overlayZIndexBase={OVERLAY_Z_BASE}
                />
              </Form.Item>
            </>
          )}
        </Col>
      </Row>
    </Modal>
  );
};

// ─── helpers ─────────────────────────────────

function createGradientSlide(gradientKey: string): StorySlide {
  return {
    id: createId(),
    type: 'gradient',
    gradient_key: gradientKey,
    text_layers: [],
    duration_ms: DEFAULT_SLIDE_DURATION_MS,
  };
}

export default StoryEditorModal;
