import React from 'react';
import { Button, Empty, Image, Modal, Tag } from 'antd';
import { FileTextOutlined, PaperClipOutlined, PlayCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { buildImagePreviewUrl } from '../../utils/imagePreview';

type InstructionAttachment = {
  id: string;
  url: string;
  name: string;
  mimeType?: string | null;
  fileType?: string | null;
};

type InstructionRecord = Record<string, any> & {
  attachments?: InstructionAttachment[];
};

type TaskInstructionsModalProps = {
  open: boolean;
  loading?: boolean;
  instructions: InstructionRecord[];
  activeInstructionId?: string | null;
  onSelectInstruction: (instructionId: string) => void;
  onClose: () => void;
  hideList?: boolean;
};

const resolveFileKind = (attachment: InstructionAttachment): 'image' | 'video' | 'audio' | 'file' => {
  const ft = String(attachment.fileType || '').toLowerCase();
  if (ft === 'image') return 'image';
  if (ft === 'video') return 'video';
  if (ft === 'audio') return 'audio';
  const mt = String(attachment.mimeType || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/')) return 'audio';
  const ext = attachment.url.split('?')[0].split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 'audio';
  return 'file';
};

const buildInstructionImageSources = (url?: string | null) => {
  const original = String(url || '').trim();
  if (!original) return { thumb: '', preview: '' };
  return {
    thumb: buildImagePreviewUrl(original, 'gallery'),
    preview: buildImagePreviewUrl(original, 'hero'),
  };
};

const AttachmentsGallery: React.FC<{ attachments: InstructionAttachment[]; imageUrl?: string | null }> = ({ attachments, imageUrl }) => {
  const images: InstructionAttachment[] = attachments.filter((a) => resolveFileKind(a) === 'image');
  const videos: InstructionAttachment[] = attachments.filter((a) => resolveFileKind(a) === 'video');
  const audios: InstructionAttachment[] = attachments.filter((a) => resolveFileKind(a) === 'audio');
  const files: InstructionAttachment[] = attachments.filter((a) => resolveFileKind(a) === 'file');

  const legacyImageUrl = imageUrl && images.length === 0 ? imageUrl : null;
  const legacyImageSources = buildInstructionImageSources(legacyImageUrl);

  return (
    <div className="space-y-3">
      {(images.length > 0 || legacyImageUrl) && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-500">تصاویر</div>
          <Image.PreviewGroup>
            <div className="flex flex-wrap gap-2">
              {legacyImageUrl && (
                <Image
                  src={legacyImageSources.thumb}
                  alt="تصویر دستورالعمل"
                  className="rounded-xl border border-gray-200 object-cover dark:border-gray-700"
                  style={{ maxHeight: 160, maxWidth: 240, cursor: 'pointer' }}
                  preview={{ src: legacyImageSources.preview || legacyImageSources.thumb }}
                />
              )}
              {images.map((img) => {
                const sources = buildInstructionImageSources(img.url);
                return (
                  <Image
                    key={img.id}
                    src={sources.thumb}
                    alt={img.name}
                    className="rounded-xl border border-gray-200 object-cover dark:border-gray-700"
                    style={{ maxHeight: 160, maxWidth: 240, cursor: 'pointer' }}
                    preview={{ src: sources.preview || sources.thumb }}
                  />
                );
              })}
            </div>
          </Image.PreviewGroup>
        </div>
      )}

      {!legacyImageUrl && imageUrl && images.length > 0 && (
        <Image.PreviewGroup>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const sources = buildInstructionImageSources(imageUrl);
              return (
                <Image
                  src={sources.thumb}
                  alt="تصویر دستورالعمل"
                  className="rounded-xl border border-gray-200 object-cover dark:border-gray-700"
                  style={{ maxHeight: 160, maxWidth: 240, cursor: 'pointer' }}
                  preview={{ src: sources.preview || sources.thumb }}
                />
              );
            })()}
          </div>
        </Image.PreviewGroup>
      )}

      {videos.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-500">
            <PlayCircleOutlined />
            <span>ویدیوها</span>
          </div>
          <div className="flex flex-col gap-2">
            {videos.map((vid) => (
              <video
                key={vid.id}
                src={vid.url}
                controls
                className="w-full max-h-[240px] rounded-xl border border-gray-200 dark:border-gray-700"
                title={vid.name}
              />
            ))}
          </div>
        </div>
      )}

      {audios.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-500">
            <SoundOutlined />
            <span>فایل‌های صوتی</span>
          </div>
          <div className="flex flex-col gap-2">
            {audios.map((aud) => (
              <audio key={aud.id} src={aud.url} controls className="w-full" title={aud.name} />
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <PaperClipOutlined />
            <span>فایل‌ها و پیوست‌ها</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((f) => (
              <Button key={f.id} href={f.url} target="_blank" icon={<FileTextOutlined />}>
                {f.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TaskInstructionsModal: React.FC<TaskInstructionsModalProps> = ({
  open,
  loading = false,
  instructions,
  activeInstructionId,
  onSelectInstruction,
  onClose,
  hideList = false,
}) => {
  const activeInstruction = instructions.find((item) => String(item?.id || '') === String(activeInstructionId || '')) || instructions[0] || null;
  const hasMedia = (instr: InstructionRecord) =>
    (instr?.attachments || []).length > 0 || !!instr?.image_url;

  return (
    <Modal
      open={open}
      title="مشاهده دستورالعمل‌ها"
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={1080}
    >
      {instructions.length === 0 && !loading ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="دستورالعملی برای این فعالیت ثبت نشده است."
        />
      ) : (
        <div className={hideList ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]'}>
          {!hideList ? (
          <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-white/5">
            <div className="text-xs text-gray-500">
              {`تعداد دستورالعمل‌ها: ${toPersianNumber(instructions.length)}`}
            </div>
            <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
              {instructions.map((instruction) => {
                const isActive = String(activeInstruction?.id || '') === String(instruction?.id || '');
                return (
                  <button
                    key={String(instruction?.id || '')}
                    type="button"
                    onClick={() => onSelectInstruction(String(instruction?.id || ''))}
                    className={`w-full rounded-xl border px-3 py-3 text-right transition ${
                      isActive
                        ? 'border-leather-500 bg-white shadow-sm dark:bg-gray-900'
                        : 'border-gray-200 bg-white/70 hover:border-leather-300 dark:border-gray-700 dark:bg-black/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {String(instruction?.name || instruction?.system_code || 'دستورالعمل')}
                      </div>
                      {instruction?.status_label ? (
                        <Tag color={String(instruction?.status_color || 'default')}>{instruction.status_label}</Tag>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {String(instruction?.department || '').trim() || 'بدون دپارتمان'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          ) : null}

          <div className="min-w-0 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-[#111827]" style={{ maxHeight: '72vh' }}>
            {activeInstruction ? (
              <div className="space-y-4">
                <div className="space-y-2 border-b border-gray-200 pb-3 dark:border-gray-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {String(activeInstruction?.name || activeInstruction?.system_code || 'دستورالعمل')}
                    </div>
                    {activeInstruction?.status_label ? (
                      <Tag color={String(activeInstruction?.status_color || 'default')}>{activeInstruction.status_label}</Tag>
                    ) : null}
                    {activeInstruction?.department ? <Tag>{String(activeInstruction.department)}</Tag> : null}
                  </div>
                  {activeInstruction?.system_code ? (
                    <div className="text-xs text-gray-500">کد سیستمی: {String(activeInstruction.system_code)}</div>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold text-gray-500">هدف</div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-7 text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                    {String(activeInstruction?.goal || '').trim() || '-'}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold text-gray-500">متن دستورالعمل</div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-7 text-gray-700 whitespace-pre-wrap dark:border-gray-700 dark:bg-white/5 dark:text-gray-200">
                    {String(activeInstruction?.body || '').trim() || '-'}
                  </div>
                </div>

                {hasMedia(activeInstruction) && (
                  <AttachmentsGallery
                    attachments={activeInstruction.attachments || []}
                    imageUrl={activeInstruction.image_url || null}
                  />
                )}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="دستورالعملی انتخاب نشده است." />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default TaskInstructionsModal;
