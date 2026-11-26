import React, { useEffect, useMemo, useRef } from 'react';
import { Button, Dropdown, Input, Popover, Tooltip } from 'antd';
import {
  BoldOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  FontColorsOutlined,
  ItalicOutlined,
  LinkOutlined,
  UndoOutlined,
  RedoOutlined,
  OrderedListOutlined,
  UnderlineOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import { normalizeRichTextHtml } from '../utils/richText';

const COLORS = ['#111827', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0284c7', '#4f46e5', '#9333ea'];

type RichTextEditorProps = {
  value?: unknown;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  minRows?: number;
};

const toolButton = (title: string, icon: React.ReactNode, active: boolean, onClick: () => void, disabled?: boolean) => (
  <Tooltip title={title}>
    <Button
      type={active ? 'primary' : 'text'}
      size="small"
      icon={icon}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    />
  </Tooltip>
);

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, disabled = false, compact = false, minRows = 4 }) => {
  const latestValue = useRef(normalizeRichTextHtml(value));
  const emitTimer = useRef<number | null>(null);
  const normalizedValue = useMemo(() => normalizeRichTextHtml(value), [value]);
  const onChangeRef = useRef(onChange);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState('');
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, underline: false, link: { openOnClick: false } }),
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['right', 'center', 'left'] }),
    ],
    content: normalizedValue,
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue = normalizeRichTextHtml(currentEditor.getHTML());
      latestValue.current = nextValue;
      if (emitTimer.current !== null) window.clearTimeout(emitTimer.current);
      emitTimer.current = window.setTimeout(() => {
        emitTimer.current = null;
        onChangeRef.current(latestValue.current);
      }, 140);
    },
  });

  useEffect(() => () => {
    if (emitTimer.current !== null) window.clearTimeout(emitTimer.current);
  }, []);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || editor.isFocused || latestValue.current === normalizedValue) return;
    latestValue.current = normalizedValue;
    editor.commands.setContent(normalizedValue, { emitUpdate: false });
  }, [editor, normalizedValue]);

  const commitImmediately = () => {
    if (emitTimer.current !== null) window.clearTimeout(emitTimer.current);
    emitTimer.current = null;
    onChangeRef.current(latestValue.current);
  };

  const applyLink = () => {
    const href = linkUrl.trim();
    const command = editor?.chain().focus().extendMarkRange('link');
    if (href ? !command?.setLink({ href }).run() : !command?.unsetLink().run()) return;
    setLinkOpen(false);
  };

  const colorPicker = (
    <div className="grid grid-cols-4 gap-1.5 p-1" dir="ltr">
      <button
        type="button"
        aria-label="رنگ پیش‌فرض متن"
        className="col-span-4 h-7 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().unsetColor().run()}
      >
        رنگ پیش‌فرض
      </button>
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`رنگ ${color}`}
          className="h-5 w-5 rounded-full border border-black/15"
          style={{ backgroundColor: color }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor?.chain().focus().setColor(color).run()}
        />
      ))}
    </div>
  );

  return (
    <div className={`rich-text-editor ${compact ? 'rich-text-editor--compact' : ''}`}>
      <div className="rich-text-editor__toolbar" role="toolbar" aria-label="ابزارهای ویرایش متن">
        {toolButton('بولد', <BoldOutlined />, !!editor?.isActive('bold'), () => editor?.chain().focus().toggleBold().run(), disabled)}
        {toolButton('ایتالیک', <ItalicOutlined />, !!editor?.isActive('italic'), () => editor?.chain().focus().toggleItalic().run(), disabled)}
        {toolButton('زیرخط', <UnderlineOutlined />, !!editor?.isActive('underline'), () => editor?.chain().focus().toggleUnderline().run(), disabled)}
        <Dropdown
          disabled={disabled}
          menu={{ items: [2, 3, 4].map((level) => ({ key: String(level), label: `تیتر H${level}`, onClick: () => editor?.chain().focus().toggleHeading({ level: level as 2 | 3 | 4 }).run() })) }}
        >
          <Button size="small" type={editor?.isActive('heading') ? 'primary' : 'text'} aria-label="تیتر">H</Button>
        </Dropdown>
        {toolButton('فهرست نقطه‌ای', <UnorderedListOutlined />, !!editor?.isActive('bulletList'), () => editor?.chain().focus().toggleBulletList().run(), disabled)}
        {toolButton('فهرست شماره‌ای', <OrderedListOutlined />, !!editor?.isActive('orderedList'), () => editor?.chain().focus().toggleOrderedList().run(), disabled)}
        {([
          ['right', 'راست‌چین', <AlignRightOutlined />],
          ['center', 'وسط‌چین', <AlignCenterOutlined />],
          ['left', 'چپ‌چین', <AlignLeftOutlined />],
        ] as const).map(([align, title, icon]) => (
          <React.Fragment key={align}>
            {toolButton(title, icon, !!editor?.isActive({ textAlign: align }),
              () => editor?.chain().focus().setTextAlign(align).run(), disabled)}
          </React.Fragment>
        ))}
        <Popover open={linkOpen} onOpenChange={(open) => {
          if (open) setLinkUrl(editor?.getAttributes('link').href ?? '');
          setLinkOpen(open);
        }} trigger="click" content={
          <div className="flex items-center gap-2">
            <Input size="small" dir="ltr" aria-label="نشانی پیوند" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)}
              onPressEnter={(event) => { event.preventDefault(); applyLink(); }} />
            <Button size="small" onClick={applyLink}>{linkUrl.trim() ? 'ثبت پیوند' : 'حذف پیوند'}</Button>
          </div>
        }>
          <Button size="small" type={editor?.isActive('link') ? 'primary' : 'text'} icon={<LinkOutlined />} aria-label="پیوند" disabled={disabled} onMouseDown={(event) => event.preventDefault()} />
        </Popover>
        {toolButton('واگرد', <UndoOutlined />, false, () => editor?.chain().focus().undo().run(), disabled)}
        {toolButton('انجام دوباره', <RedoOutlined />, false, () => editor?.chain().focus().redo().run(), disabled)}
        <Popover content={colorPicker} trigger="click" placement="bottomRight">
          <Button size="small" type="text" icon={<FontColorsOutlined />} aria-label="رنگ متن" disabled={disabled} />
        </Popover>
      </div>
      <EditorContent
        editor={editor}
        onBlur={commitImmediately}
        className="rich-text-editor__content"
        style={{ minHeight: `${Math.max(1, minRows) * 1.55}rem` }}
      />
    </div>
  );
};

export default RichTextEditor;
