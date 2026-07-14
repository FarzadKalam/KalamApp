import React, { useState } from 'react';
import { Button, Input, Popover } from 'antd';
import AiSparkleIcon from '../../ai/AiSparkleIcon';

type AiReplySuggestionActionProps = {
  disabled?: boolean;
  loading?: boolean;
  onSubmit: (instruction: string) => void | Promise<void>;
};

const AiReplySuggestionAction: React.FC<AiReplySuggestionActionProps> = ({
  disabled = false,
  loading = false,
  onSubmit,
}) => {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');

  const submit = async () => {
    await onSubmit(String(instruction || '').trim());
    setOpen(false);
  };

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(nextOpen) => {
        if (!loading) setOpen(nextOpen);
      }}
      placement="topLeft"
      content={(
        <div className="w-[min(280px,calc(100vw-32px))] space-y-2" dir="rtl">
          <div className="text-xs leading-5 text-slate-500 dark:text-slate-300">
            در صورت نیاز، سبک یا نکته خاص پاسخ را بنویسید.
          </div>
          <Input.TextArea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="مثلا: کوتاه و رسمی پاسخ بده"
            autoSize={{ minRows: 2, maxRows: 4 }}
            disabled={loading}
          />
          <div className="flex justify-end">
            <Button type="primary" size="small" loading={loading} onClick={() => void submit()}>
              دریافت پیشنهاد
            </Button>
          </div>
        </div>
      )}
    >
      <Button
        type="text"
        size="small"
        shape="circle"
        icon={<AiSparkleIcon className="h-4 w-4" />}
        aria-label="پیشنهاد پاسخ هوش مصنوعی"
        title="پیشنهاد پاسخ هوش مصنوعی"
        disabled={disabled}
        loading={loading}
      />
    </Popover>
  );
};

export default AiReplySuggestionAction;
