import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type OrgDocument = {
  id: string;
  title: string;
  body: string;
  document_type?: string | null;
  status: 'active' | 'draft' | 'archived';
  updated_at?: string | null;
};

type KnowledgeFormValues = {
  title: string;
  document_type: string;
  status: 'active' | 'draft' | 'archived';
  body: string;
};

const DEFAULT_FORM_VALUES: KnowledgeFormValues = {
  title: '',
  document_type: 'business_plan',
  status: 'active',
  body: '',
};

const DOCUMENT_TYPE_OPTIONS = [
  { label: 'بیزنس پلن', value: 'business_plan' },
  { label: 'توضیحات کسب و کار', value: 'business_overview' },
  { label: 'SOP / فرایندها', value: 'sop' },
  { label: 'سیاست‌ها', value: 'policy' },
  { label: 'عمومی', value: 'general' },
];

const STATUS_OPTIONS = [
  { label: 'فعال', value: 'active' },
  { label: 'پیش‌نویس', value: 'draft' },
  { label: 'آرشیو', value: 'archived' },
];

const splitIntoChunks = (body: string) => {
  const paragraphs = String(body || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  const maxLength = 1200;

  paragraphs.forEach((paragraph) => {
    if (!current) {
      current = paragraph;
      return;
    }
    if (`${current}\n\n${paragraph}`.length <= maxLength) {
      current = `${current}\n\n${paragraph}`;
      return;
    }
    chunks.push(current);
    current = paragraph;
  });

  if (current) chunks.push(current);
  if (chunks.length === 0 && body.trim()) chunks.push(body.trim().slice(0, maxLength));
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];
    const pieces: string[] = [];
    for (let index = 0; index < chunk.length; index += maxLength) {
      pieces.push(chunk.slice(index, index + maxLength));
    }
    return pieces;
  });
};

const hashText = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return Math.abs(hash).toString(16);
};

const AiKnowledgeTab: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<KnowledgeFormValues>();
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<OrgDocument | null>(null);

  const sortedDocuments = useMemo(
    () => [...documents].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))),
    [documents]
  );

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('org_documents')
        .select('id, title, body, document_type, status, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setDocuments((data || []) as OrgDocument[]);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'خطا در دریافت دانش سازمان'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
  }, []);

  const rebuildChunks = async (document: OrgDocument) => {
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', document.id);
    if (deleteError) throw deleteError;

    if (document.status !== 'active') return;
    const chunks = splitIntoChunks(document.body);
    if (chunks.length === 0) return;

    const rows = chunks.map((content, index) => ({
      document_id: document.id,
      chunk_index: index,
      content,
      content_hash: hashText(content),
      token_estimate: Math.ceil(content.length / 4),
      status: 'active',
      metadata: {
        document_title: document.title,
        document_type: document.document_type || 'general',
      },
    }));

    const { error: insertError } = await supabase.from('document_chunks').insert(rows);
    if (insertError) throw insertError;
  };

  const openCreateModal = () => {
    setEditingDocument(null);
    form.setFieldsValue(DEFAULT_FORM_VALUES);
    setModalOpen(true);
  };

  const openEditModal = (document: OrgDocument) => {
    setEditingDocument(document);
    form.setFieldsValue({
      title: document.title || '',
      body: document.body || '',
      document_type: document.document_type || 'general',
      status: document.status || 'active',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const payload = {
        title: values.title.trim(),
        body: values.body.trim(),
        document_type: values.document_type || 'general',
        status: values.status || 'active',
        updated_by: authData?.user?.id || null,
      };

      let nextDocument: OrgDocument | null = null;
      if (editingDocument?.id) {
        const { data, error } = await supabase
          .from('org_documents')
          .update(payload)
          .eq('id', editingDocument.id)
          .select('id, title, body, document_type, status, updated_at')
          .maybeSingle();
        if (error) throw error;
        nextDocument = data as OrgDocument;
      } else {
        const { data, error } = await supabase
          .from('org_documents')
          .insert([{ ...payload, created_by: authData?.user?.id || null }])
          .select('id, title, body, document_type, status, updated_at')
          .maybeSingle();
        if (error) throw error;
        nextDocument = data as OrgDocument;
      }

      if (nextDocument) {
        await rebuildChunks(nextDocument);
      }
      message.success('دانش سازمان ذخیره شد.');
      setModalOpen(false);
      setEditingDocument(null);
      await fetchDocuments();
    } catch (error: any) {
      if (Array.isArray(error?.errorFields)) return;
      message.error(toFaErrorMessage(error, 'ذخیره دانش سازمان ناموفق بود'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    try {
      const { error } = await supabase.from('org_documents').delete().eq('id', documentId);
      if (error) throw error;
      message.success('سند حذف شد.');
      await fetchDocuments();
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'حذف سند ناموفق بود'));
    }
  };

  const handleRebuild = async (document: OrgDocument) => {
    try {
      await rebuildChunks(document);
      message.success('chunkهای سند بازسازی شد.');
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بازسازی chunkها ناموفق بود'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="m-0 text-base font-bold text-gray-800 dark:text-gray-100">دانش سازمان</h3>
          <p className="m-0 mt-1 text-xs text-gray-500">
            متن‌های فعال به chunk تبدیل می‌شوند و دستیار هنگام پاسخ‌گویی از آن‌ها استفاده می‌کند.
          </p>
        </div>
        <Button type="primary" icon={<SaveOutlined />} onClick={openCreateModal}>
          سند جدید
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={sortedDocuments}
        locale={{ emptyText: <Empty description="هنوز سندی ثبت نشده است." /> }}
        pagination={{ pageSize: 8 }}
        columns={[
          {
            title: 'عنوان',
            dataIndex: 'title',
            render: (value: string, row: OrgDocument) => (
              <div>
                <div className="font-medium">{value || '-'}</div>
                <div className="text-xs text-gray-400">{row.document_type || 'general'}</div>
              </div>
            ),
          },
          {
            title: 'وضعیت',
            dataIndex: 'status',
            width: 120,
            render: (value: OrgDocument['status']) => (
              <Tag color={value === 'active' ? 'green' : value === 'draft' ? 'gold' : 'default'}>
                {value === 'active' ? 'فعال' : value === 'draft' ? 'پیش‌نویس' : 'آرشیو'}
              </Tag>
            ),
          },
          {
            title: 'حجم متن',
            dataIndex: 'body',
            width: 120,
            render: (value: string) => `${String(value || '').length} کاراکتر`,
          },
          {
            title: 'عملیات',
            width: 220,
            render: (_: unknown, row: OrgDocument) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(row)}>
                  ویرایش
                </Button>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRebuild(row)}>
                  بازسازی
                </Button>
                <Popconfirm title="این سند حذف شود؟" onConfirm={() => handleDelete(row.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="ذخیره"
        cancelText="انصراف"
        title={editingDocument ? 'ویرایش سند دانش سازمان' : 'سند جدید دانش سازمان'}
        width={820}
      >
        <Form form={form} layout="vertical" initialValues={DEFAULT_FORM_VALUES}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Form.Item
              label="عنوان"
              name="title"
              className="md:col-span-2"
              rules={[{ required: true, message: 'عنوان را وارد کنید.' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item label="نوع سند" name="document_type">
              <Select options={DOCUMENT_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item label="وضعیت" name="status">
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          </div>
          <Form.Item
            label="متن"
            name="body"
            rules={[{ required: true, message: 'متن سند را وارد کنید.' }]}
          >
            <Input.TextArea rows={14} placeholder="بیزنس پلن، توضیحات کسب‌وکار، سیاست‌ها یا فرایندها..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AiKnowledgeTab;
