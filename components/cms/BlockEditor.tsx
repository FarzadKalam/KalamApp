import React, { useCallback, useState } from 'react';
import {
  Button, Dropdown, Input, Select, Upload, Spin,
  Tooltip, Popconfirm,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, UpOutlined, DownOutlined,
  FontSizeOutlined, PictureOutlined, VideoCameraOutlined,
  CheckSquareOutlined, WarningOutlined, MessageOutlined,
  LinkOutlined, MinusOutlined, CodeOutlined, AppstoreOutlined,
  OrderedListOutlined, UnorderedListOutlined, FileImageOutlined,
} from '@ant-design/icons';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import TiptapUnderline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../../utils/storageClient';

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────
export type BlockType =
  | 'paragraph' | 'heading' | 'image' | 'gallery'
  | 'video_embed' | 'video_file' | 'checklist'
  | 'quote' | 'alert' | 'related_posts' | 'divider' | 'code';

export interface ParagraphBlock { id: string; type: 'paragraph'; content: string }
export interface HeadingBlock { id: string; type: 'heading'; level: 1|2|3|4|5|6; content: string }
export interface ImageBlock { id: string; type: 'image'; url: string; alt: string; caption?: string }
export interface GalleryBlock { id: string; type: 'gallery'; images: { url: string; alt: string; caption?: string }[] }
export interface VideoEmbedBlock { id: string; type: 'video_embed'; platform: 'aparat'|'youtube'|'vimeo'; url: string; embed_id: string }
export interface VideoFileBlock { id: string; type: 'video_file'; url: string; title?: string }
export interface ChecklistBlock { id: string; type: 'checklist'; items: { text: string; checked: boolean }[] }
export interface QuoteBlock { id: string; type: 'quote'; content: string; author?: string; source?: string }
export interface AlertBlock { id: string; type: 'alert'; variant: 'info'|'warning'|'danger'|'success'; title?: string; content: string }
export interface RelatedPostsBlock { id: string; type: 'related_posts'; post_type: 'blog'|'tutorial'; post_ids: string[] }
export interface DividerBlock { id: string; type: 'divider' }
export interface CodeBlock { id: string; type: 'code'; language: string; content: string }

export type Block =
  | ParagraphBlock | HeadingBlock | ImageBlock | GalleryBlock
  | VideoEmbedBlock | VideoFileBlock | ChecklistBlock | QuoteBlock
  | AlertBlock | RelatedPostsBlock | DividerBlock | CodeBlock;

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const BLOCK_MENU_ITEMS: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: 'paragraph',    label: 'متن',           icon: <OrderedListOutlined /> },
  { type: 'heading',      label: 'عنوان',          icon: <FontSizeOutlined /> },
  { type: 'image',        label: 'تصویر',          icon: <PictureOutlined /> },
  { type: 'gallery',      label: 'گالری تصاویر',   icon: <AppstoreOutlined /> },
  { type: 'video_embed',  label: 'ویدیو (لینک)',   icon: <VideoCameraOutlined /> },
  { type: 'video_file',   label: 'ویدیو (فایل)',   icon: <VideoCameraOutlined /> },
  { type: 'checklist',    label: 'چک‌لیست',        icon: <CheckSquareOutlined /> },
  { type: 'quote',        label: 'نقل‌قول',        icon: <MessageOutlined /> },
  { type: 'alert',        label: 'هشدار / اطلاع',  icon: <WarningOutlined /> },
  { type: 'code',         label: 'کد',             icon: <CodeOutlined /> },
  { type: 'divider',      label: 'جداکننده',       icon: <MinusOutlined /> },
];

function makeDefaultBlock(type: BlockType): Block {
  const id = makeId();
  switch (type) {
    case 'paragraph':   return { id, type, content: '' };
    case 'heading':     return { id, type, level: 2, content: '' };
    case 'image':       return { id, type, url: '', alt: '' };
    case 'gallery':     return { id, type, images: [] };
    case 'video_embed': return { id, type, platform: 'aparat', url: '', embed_id: '' };
    case 'video_file':  return { id, type, url: '' };
    case 'checklist':   return { id, type, items: [{ text: '', checked: false }] };
    case 'quote':       return { id, type, content: '' };
    case 'alert':       return { id, type, variant: 'info', content: '' };
    case 'related_posts': return { id, type, post_type: 'blog', post_ids: [] };
    case 'divider':     return { id, type };
    case 'code':        return { id, type, language: 'javascript', content: '' };
  }
}

// ──────────────────────────────────────────────────
// Tiptap mini editor (used in paragraph + heading + quote)
// ──────────────────────────────────────────────────
function MiniTiptap({
  content, onChange, placeholder,
}: { content: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: false, underline: false }),
      TiptapLink.configure({ openOnClick: false }),
      TiptapUnderline,
      TextAlign.configure({ types: ['paragraph'] }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  return (
    <div className="mini-tiptap-wrapper">
      <div className="mini-tiptap-toolbar">
        <button
          type="button"
          className={`tt-btn ${editor.isActive('bold') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
        >B</button>
        <button
          type="button"
          className={`tt-btn ${editor.isActive('italic') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
        ><i>I</i></button>
        <button
          type="button"
          className={`tt-btn ${editor.isActive('underline') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
        ><u>U</u></button>
        <button
          type="button"
          className={`tt-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
        ><UnorderedListOutlined /></button>
        <button
          type="button"
          className={`tt-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
        ><OrderedListOutlined /></button>
        <button
          type="button"
          className="tt-btn"
          onMouseDown={e => {
            e.preventDefault();
            const url = window.prompt('آدرس لینک:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        ><LinkOutlined /></button>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

// ──────────────────────────────────────────────────
// Parse video embed URL
// ──────────────────────────────────────────────────
function parseVideoUrl(url: string): { platform: 'aparat'|'youtube'|'vimeo'; embed_id: string } | null {
  if (!url) return null;
  const aparat = url.match(/aparat\.com\/v\/([a-zA-Z0-9]+)/);
  if (aparat) return { platform: 'aparat', embed_id: aparat[1] };
  const yt1 = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt1) return { platform: 'youtube', embed_id: yt1[1] };
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { platform: 'vimeo', embed_id: vimeo[1] };
  return null;
}

// ──────────────────────────────────────────────────
// Block-specific editors
// ──────────────────────────────────────────────────
function ParagraphEditor({ block, onChange }: { block: ParagraphBlock; onChange: (b: Block) => void }) {
  return (
    <MiniTiptap
      content={block.content}
      onChange={html => onChange({ ...block, content: html })}
      placeholder="متن خود را وارد کنید..."
    />
  );
}

function HeadingEditor({ block, onChange }: { block: HeadingBlock; onChange: (b: Block) => void }) {
  return (
    <div className="flex gap-2 items-start">
      <Select
        value={block.level}
        onChange={v => onChange({ ...block, level: v })}
        size="small"
        style={{ width: 72, flexShrink: 0 }}
        options={[1,2,3,4,5,6].map(l => ({ value: l, label: `H${l}` }))}
      />
      <Input
        value={block.content}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder="عنوان..."
        style={{ fontSize: block.level <= 2 ? 20 : block.level === 3 ? 17 : 15, fontWeight: 700 }}
      />
    </div>
  );
}

function ImageEditor({ block, onChange }: { block: ImageBlock; onChange: (b: Block) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `cms/images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await fileStorageClient.storage.from(FILE_STORAGE_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(path);
      onChange({ ...block, url: data.publicUrl });
    } finally {
      setUploading(false);
    }
    return false;
  };

  return (
    <div className="space-y-2">
      <Upload
        accept="image/*"
        showUploadList={false}
        beforeUpload={handleUpload}
        disabled={uploading}
      >
        <Button icon={uploading ? <Spin size="small" /> : <FileImageOutlined />}>
          {block.url ? 'تغییر تصویر' : 'آپلود تصویر'}
        </Button>
      </Upload>
      {block.url && (
        <img src={block.url} alt={block.alt} className="max-h-48 rounded-lg object-cover" />
      )}
      <Input
        value={block.url}
        onChange={e => onChange({ ...block, url: e.target.value })}
        placeholder="یا آدرس URL تصویر..."
        prefix={<LinkOutlined />}
      />
      <Input
        value={block.alt}
        onChange={e => onChange({ ...block, alt: e.target.value })}
        placeholder="متن جایگزین (alt)..."
      />
      <Input
        value={block.caption ?? ''}
        onChange={e => onChange({ ...block, caption: e.target.value })}
        placeholder="کپشن تصویر (اختیاری)..."
      />
    </div>
  );
}

function GalleryEditor({ block, onChange }: { block: GalleryBlock; onChange: (b: Block) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `cms/images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await fileStorageClient.storage.from(FILE_STORAGE_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(path);
      onChange({ ...block, images: [...block.images, { url: data.publicUrl, alt: file.name }] });
    } finally {
      setUploading(false);
    }
    return false;
  };

  const removeImage = (i: number) => {
    onChange({ ...block, images: block.images.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {block.images.map((img, i) => (
          <div key={i} className="relative group">
            <img src={img.url} alt={img.alt} className="w-24 h-24 object-cover rounded-lg" />
            <button
              type="button"
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => removeImage(i)}
            >×</button>
          </div>
        ))}
        <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload} disabled={uploading} multiple>
          <div className="w-24 h-24 border-2 border-dashed border-zinc-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-teal-500 transition-colors">
            {uploading ? <Spin size="small" /> : <PlusOutlined className="text-zinc-400" />}
          </div>
        </Upload>
      </div>
      <p className="text-xs text-zinc-400">برای حذف تصویر روی آن هاور کنید</p>
    </div>
  );
}

function VideoEmbedEditor({ block, onChange }: { block: VideoEmbedBlock; onChange: (b: Block) => void }) {
  const handleUrl = (url: string) => {
    const parsed = parseVideoUrl(url);
    if (parsed) {
      onChange({ ...block, url, platform: parsed.platform, embed_id: parsed.embed_id });
    } else {
      onChange({ ...block, url });
    }
  };

  const previewUrl = block.embed_id ? (
    block.platform === 'aparat'
      ? `https://www.aparat.com/video/video/embed/videohash/${block.embed_id}/vt/frame`
      : block.platform === 'youtube'
      ? `https://www.youtube.com/embed/${block.embed_id}`
      : `https://player.vimeo.com/video/${block.embed_id}`
  ) : null;

  return (
    <div className="space-y-2">
      <Input
        value={block.url}
        onChange={e => handleUrl(e.target.value)}
        placeholder="لینک ویدیو از آپارات، یوتیوب یا ویمئو..."
        prefix={<VideoCameraOutlined />}
      />
      {block.embed_id && (
        <div className="text-xs text-teal-600">✓ پلتفرم: {block.platform} — ID: {block.embed_id}</div>
      )}
      {previewUrl && (
        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={previewUrl}
            className="absolute inset-0 w-full h-full rounded-lg"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

function VideoFileEditor({ block, onChange }: { block: VideoFileBlock; onChange: (b: Block) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `cms/videos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await fileStorageClient.storage.from(FILE_STORAGE_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(path);
      onChange({ ...block, url: data.publicUrl, title: block.title || file.name });
    } finally {
      setUploading(false);
    }
    return false;
  };

  return (
    <div className="space-y-2">
      <Upload accept="video/*" showUploadList={false} beforeUpload={handleUpload} disabled={uploading}>
        <Button icon={uploading ? <Spin size="small" /> : <VideoCameraOutlined />}>
          {block.url ? 'تغییر ویدیو' : 'آپلود ویدیو'}
        </Button>
      </Upload>
      {block.url && (
        <video src={block.url} controls className="w-full max-h-64 rounded-lg" />
      )}
      <Input
        value={block.title ?? ''}
        onChange={e => onChange({ ...block, title: e.target.value })}
        placeholder="عنوان ویدیو (اختیاری)..."
      />
    </div>
  );
}

function ChecklistEditor({ block, onChange }: { block: ChecklistBlock; onChange: (b: Block) => void }) {
  const updateItem = (i: number, text: string) => {
    const items = block.items.map((it, idx) => idx === i ? { ...it, text } : it);
    onChange({ ...block, items });
  };

  const addItem = () => onChange({ ...block, items: [...block.items, { text: '', checked: false }] });

  const removeItem = (i: number) => {
    if (block.items.length <= 1) return;
    onChange({ ...block, items: block.items.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-1">
      {block.items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input type="checkbox" checked={item.checked} className="mt-0.5" readOnly />
          <Input
            value={item.text}
            onChange={e => updateItem(i, e.target.value)}
            placeholder={`مورد ${i + 1}...`}
            onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
          />
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeItem(i)} />
        </div>
      ))}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addItem}>
        افزودن مورد
      </Button>
    </div>
  );
}

function QuoteEditor({ block, onChange }: { block: QuoteBlock; onChange: (b: Block) => void }) {
  return (
    <div className="space-y-2">
      <MiniTiptap
        content={block.content}
        onChange={html => onChange({ ...block, content: html })}
        placeholder="متن نقل‌قول..."
      />
      <Input
        value={block.author ?? ''}
        onChange={e => onChange({ ...block, author: e.target.value })}
        placeholder="نام گوینده (اختیاری)..."
      />
      <Input
        value={block.source ?? ''}
        onChange={e => onChange({ ...block, source: e.target.value })}
        placeholder="منبع (اختیاری)..."
      />
    </div>
  );
}

function AlertEditor({ block, onChange }: { block: AlertBlock; onChange: (b: Block) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select
          value={block.variant}
          onChange={v => onChange({ ...block, variant: v })}
          style={{ width: 120 }}
          options={[
            { value: 'info', label: '💡 اطلاع' },
            { value: 'warning', label: '⚠️ هشدار' },
            { value: 'danger', label: '🚫 خطر' },
            { value: 'success', label: '✅ موفق' },
          ]}
        />
        <Input
          value={block.title ?? ''}
          onChange={e => onChange({ ...block, title: e.target.value })}
          placeholder="عنوان (اختیاری)..."
        />
      </div>
      <Input.TextArea
        value={block.content}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder="متن پیام..."
        rows={2}
      />
    </div>
  );
}

function CodeEditor({ block, onChange }: { block: CodeBlock; onChange: (b: Block) => void }) {
  const langs = ['javascript','typescript','python','php','sql','bash','html','css','json','yaml','go','rust'];
  return (
    <div className="space-y-2">
      <Select
        value={block.language}
        onChange={v => onChange({ ...block, language: v })}
        style={{ width: 140 }}
        options={langs.map(l => ({ value: l, label: l }))}
      />
      <Input.TextArea
        value={block.content}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder="کد..."
        rows={6}
        style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────
// Block renderer for the editor (each block row)
// ──────────────────────────────────────────────────
function BlockEditorItem({
  block, index, total,
  onChange, onDelete, onMoveUp, onMoveDown,
  dragHandleProps,
}: {
  block: Block; index: number; total: number;
  onChange: (b: Block) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const blockTypeLabel = BLOCK_MENU_ITEMS.find(m => m.type === block.type)?.label ?? block.type;

  let editor: React.ReactNode = null;
  switch (block.type) {
    case 'paragraph':   editor = <ParagraphEditor block={block} onChange={onChange} />; break;
    case 'heading':     editor = <HeadingEditor block={block} onChange={onChange} />; break;
    case 'image':       editor = <ImageEditor block={block} onChange={onChange} />; break;
    case 'gallery':     editor = <GalleryEditor block={block} onChange={onChange} />; break;
    case 'video_embed': editor = <VideoEmbedEditor block={block} onChange={onChange} />; break;
    case 'video_file':  editor = <VideoFileEditor block={block} onChange={onChange} />; break;
    case 'checklist':   editor = <ChecklistEditor block={block} onChange={onChange} />; break;
    case 'quote':       editor = <QuoteEditor block={block} onChange={onChange} />; break;
    case 'alert':       editor = <AlertEditor block={block} onChange={onChange} />; break;
    case 'code':        editor = <CodeEditor block={block} onChange={onChange} />; break;
    case 'divider':     editor = <div className="h-px bg-zinc-200 my-2" />; break;
    case 'related_posts': editor = <div className="text-zinc-400 text-sm">بلاک مطالب مرتبط — در نمایش عمومی نشان داده می‌شود</div>; break;
    default: editor = null;
  }

  return (
    <div className="block-editor-item group relative border border-zinc-200 rounded-xl bg-white p-4 hover:border-teal-300 transition-colors">
      {/* drag handle + type label */}
      <div className="flex items-center gap-2 mb-3">
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 select-none px-1 text-lg leading-none"
          title="بکشید برای جابجایی"
        >⠿</div>
        <span className="text-xs font-medium text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded-full">
          {blockTypeLabel}
        </span>
        <div className="flex-1" />
        {/* controls */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip title="به بالا"><Button size="small" type="text" icon={<UpOutlined />} disabled={index === 0} onClick={onMoveUp} /></Tooltip>
          <Tooltip title="به پایین"><Button size="small" type="text" icon={<DownOutlined />} disabled={index === total - 1} onClick={onMoveDown} /></Tooltip>
          <Popconfirm title="حذف این بلاک؟" onConfirm={onDelete} okText="بله" cancelText="نه">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </div>
      {editor}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Sortable wrapper
// ──────────────────────────────────────────────────
function SortableBlock(props: React.ComponentProps<typeof BlockEditorItem>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.block.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <BlockEditorItem {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ──────────────────────────────────────────────────
// Add block button
// ──────────────────────────────────────────────────
function AddBlockButton({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: BLOCK_MENU_ITEMS.map(m => ({
          key: m.type,
          icon: m.icon,
          label: m.label,
          onClick: () => onAdd(m.type),
        })),
      }}
    >
      <button
        type="button"
        className="w-full border-2 border-dashed border-zinc-200 rounded-xl py-3 text-zinc-400 hover:border-teal-400 hover:text-teal-500 transition-colors flex items-center justify-center gap-2 text-sm"
      >
        <PlusOutlined />
        افزودن بلاک
      </button>
    </Dropdown>
  );
}

// ──────────────────────────────────────────────────
// Main BlockEditor
// ──────────────────────────────────────────────────
interface BlockEditorProps {
  value: Block[];
  onChange: (blocks: Block[]) => void;
}

export default function BlockEditor({ value, onChange }: BlockEditorProps) {
  const blocks = value.length ? value : [makeDefaultBlock('paragraph')];

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  }));

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    onChange(arrayMove(blocks, oldIndex, newIndex));
  }, [blocks, onChange]);

  const handleChange = useCallback((id: string, updated: Block) => {
    onChange(blocks.map(b => b.id === id ? updated : b));
  }, [blocks, onChange]);

  const handleDelete = useCallback((id: string) => {
    const next = blocks.filter(b => b.id !== id);
    onChange(next.length ? next : [makeDefaultBlock('paragraph')]);
  }, [blocks, onChange]);

  const handleAdd = useCallback((type: BlockType) => {
    onChange([...blocks, makeDefaultBlock(type)]);
  }, [blocks, onChange]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    onChange(arrayMove(blocks, index, index - 1));
  }, [blocks, onChange]);

  const handleMoveDown = useCallback((index: number) => {
    if (index === blocks.length - 1) return;
    onChange(arrayMove(blocks, index, index + 1));
  }, [blocks, onChange]);

  return (
    <div className="block-editor space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block, index) => (
            <SortableBlock
              key={block.id}
              block={block}
              index={index}
              total={blocks.length}
              onChange={updated => handleChange(block.id, updated)}
              onDelete={() => handleDelete(block.id)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <AddBlockButton onAdd={handleAdd} />
    </div>
  );
}
