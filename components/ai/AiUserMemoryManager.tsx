import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Empty, Input, Modal, Popconfirm, Spin, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type AiUserMemory = {
  id: string;
  content: string;
  source: 'manual' | 'ai';
  created_at?: string | null;
  updated_at?: string | null;
};

type AiUserMemoryManagerProps = {
  enabled: boolean;
};

const MAX_MEMORY_ITEMS = 40;
const MAX_MEMORY_CHARS = 600;

const AiUserMemoryManager: React.FC<AiUserMemoryManagerProps> = ({ enabled }) => {
  const { message } = App.useApp();
  const [memories, setMemories] = useState<AiUserMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<AiUserMemory | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    if (!enabled) {
      setMemories([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', { body: { action: 'list_user_memories' } });
      if (error) throw error;
      if (data?.success === false) throw new Error(String(data?.message || 'دریافت حافظه هوش مصنوعی ناموفق بود.'));
      setMemories(Array.isArray(data?.memories) ? data.memories : []);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت حافظه هوش مصنوعی ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, message]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const openCreate = () => {
    setEditingMemory(null);
    setContent('');
    setEditorOpen(true);
  };

  const openEdit = (memory: AiUserMemory) => {
    setEditingMemory(memory);
    setContent(memory.content);
    setEditorOpen(true);
  };

  const saveMemory = async () => {
    const nextContent = content.replace(/\s+/g, ' ').trim();
    if (!nextContent) {
      message.warning('متن حافظه را وارد کنید.');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'save_user_memory', id: editingMemory?.id || null, content: nextContent },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(String(data?.message || 'ذخیره حافظه ناموفق بود.'));
      setEditorOpen(false);
      setEditingMemory(null);
      setContent('');
      await loadMemories();
      message.success(editingMemory ? 'حافظه ویرایش شد.' : 'حافظه جدید ثبت شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ذخیره حافظه ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const deleteMemory = async (memory: AiUserMemory) => {
    setDeletingId(memory.id);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'delete_user_memory', id: memory.id },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(String(data?.message || 'حذف حافظه ناموفق بود.'));
      setMemories((current) => current.filter((item) => item.id !== memory.id));
      message.success('مورد حافظه حذف شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'حذف حافظه ناموفق بود.'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!enabled) {
    return (
      <Alert
        showIcon
        type="info"
        message="حافظه شخصی هوش مصنوعی"
        description="برای حفظ حریم خصوصی، حافظه فقط از پروفایل خود هر کاربر قابل مشاهده و مدیریت است."
      />
    );
  }

  return (
    <div className="space-y-4 py-4">
      <Alert
        showIcon
        type="info"
        message="حافظه شخصی هوش مصنوعی"
        description="نکات پایدار مانند شیوه نگارش، ترجیح‌های کاری یا قالب دلخواهتان را نگه می‌دارد تا در گفتگوهای بعدی رعایت شوند. حداکثر ۴۰ مورد نگهداری می‌شود و فقط نکات غیرحساس را ثبت کنید."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-gray-500">{memories.length.toLocaleString('fa-IR')} از {MAX_MEMORY_ITEMS.toLocaleString('fa-IR')} مورد</span>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={memories.length >= MAX_MEMORY_ITEMS}>
          افزودن حافظه
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Spin /></div>
      ) : memories.length ? (
        <div className="grid gap-3">
          {memories.map((memory) => (
            <Card
              key={memory.id}
              size="small"
              className="rounded-xl"
              title={<div className="flex items-center gap-2"><RobotOutlined /><span>یادآوری برای هوش مصنوعی</span></div>}
              extra={<div className="flex gap-1"><Button type="text" size="small" aria-label="ویرایش حافظه" icon={<EditOutlined />} onClick={() => openEdit(memory)} /><Popconfirm title="این مورد از حافظه هوش مصنوعی حذف شود؟" okText="حذف" cancelText="انصراف" onConfirm={() => void deleteMemory(memory)}><Button type="text" danger size="small" aria-label="حذف حافظه" loading={deletingId === memory.id} icon={<DeleteOutlined />} /></Popconfirm></div>}
            >
              <p className="m-0 whitespace-pre-wrap leading-7 text-gray-700 dark:text-gray-200">{memory.content}</p>
              <Tag className="mt-3" color={memory.source === 'ai' ? 'purple' : 'blue'}>{memory.source === 'ai' ? 'ثبت‌شده در گفتگو' : 'ثبت‌شده توسط شما'}</Tag>
            </Card>
          ))}
        </div>
      ) : (
        <Empty description="هنوز نکته‌ای برای یادآوری ثبت نشده است." />
      )}
      <Modal
        open={editorOpen}
        title={editingMemory ? 'ویرایش حافظه هوش مصنوعی' : 'افزودن حافظه هوش مصنوعی'}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={saving}
        onOk={() => void saveMemory()}
        onCancel={() => { if (!saving) setEditorOpen(false); }}
      >
        <p className="mb-3 text-sm leading-7 text-gray-500">مثال: «در متن‌های من لحن رسمی و کوتاه را رعایت کن.»</p>
        <Input.TextArea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={MAX_MEMORY_CHARS}
          autoSize={{ minRows: 4, maxRows: 8 }}
          showCount
          placeholder="یک ترجیح یا نکته پایدار برای گفتگوهای بعدی بنویسید"
        />
      </Modal>
    </div>
  );
};

export default AiUserMemoryManager;
