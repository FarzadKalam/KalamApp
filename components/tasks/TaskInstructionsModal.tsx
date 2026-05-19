import React from 'react';
import { Button, Empty, Modal, Tag } from 'antd';
import { FileTextOutlined, PaperClipOutlined } from '@ant-design/icons';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

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
};

const TaskInstructionsModal: React.FC<TaskInstructionsModalProps> = ({
  open,
  loading = false,
  instructions,
  activeInstructionId,
  onSelectInstruction,
  onClose,
}) => {
  const activeInstruction = instructions.find((item) => String(item?.id || '') === String(activeInstructionId || '')) || instructions[0] || null;

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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
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

          <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-[#111827]">
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

                {activeInstruction?.image_url ? (
                  <img
                    src={String(activeInstruction.image_url)}
                    alt={String(activeInstruction.name || 'instruction')}
                    className="max-h-[260px] w-full rounded-2xl border border-gray-200 object-cover dark:border-gray-700"
                  />
                ) : null}

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

                {(activeInstruction?.attachments || []).length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                      <PaperClipOutlined />
                      <span>فایل‌ها و پیوست‌ها</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(activeInstruction.attachments || []).map((attachment) => (
                        <Button
                          key={attachment.id}
                          href={attachment.url}
                          target="_blank"
                          icon={<FileTextOutlined />}
                        >
                          {attachment.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
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
