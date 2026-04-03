import React, { useEffect, useRef, useState } from 'react';
import { Tag, Input, Dropdown, Button, ColorPicker } from 'antd';
import { PlusOutlined, TagOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';

interface TagItem {
  id: string;
  title: string;
  color: string;
}

interface TagInputProps {
  recordId?: string;
  moduleId: string;
  initialTags?: TagItem[];
  onChange?: (tags?: TagItem[]) => void;
  disabled?: boolean;
  popupZIndex?: number;
}

const TagInput: React.FC<TagInputProps> = ({
  recordId,
  moduleId,
  initialTags = [],
  onChange,
  disabled = false,
  popupZIndex = 1600,
}) => {
  const [tags, setTags] = useState<TagItem[]>(initialTags);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedColor, setSelectedColor] = useState('#1677ff');
  const inputRef = useRef<any>(null);

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  useEffect(() => {
    if (inputVisible && !disabled) {
      inputRef.current?.focus();
      void fetchAllTags();
    }
  }, [disabled, inputVisible]);

  const fetchAllTags = async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) setAllTags(data);
  };

  const insertChangelog = async (prevTags: TagItem[], nextTags: TagItem[]) => {
    if (!recordId) return;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      await supabase.from('changelogs').insert([
        {
          module_id: moduleId,
          record_id: recordId,
          action: 'update',
          field_name: 'tags',
          field_label: 'برچسب‌ها',
          old_value: JSON.stringify(prevTags.map((t) => t.title)),
          new_value: JSON.stringify(nextTags.map((t) => t.title)),
          user_id: userId,
        },
      ]);
    } catch (err) {
      console.warn('Changelog insert failed (tags):', err);
    }
  };

  const handleClose = async (removedTagId: string) => {
    const newTags = tags.filter((tag) => tag.id !== removedTagId);

    if (!recordId) {
      setTags(newTags);
      onChange?.(newTags);
      return;
    }

    const { error } = await supabase
      .from('record_tags')
      .delete()
      .match({ record_id: recordId, tag_id: removedTagId });

    if (!error) {
      setTags(newTags);
      await insertChangelog(tags, newTags);
      onChange?.(newTags);
    }
  };

  const handleSelectTag = async (tag: TagItem) => {
    if (tags.some((item) => item.id === tag.id)) return;

    const nextTags = [...tags, tag];
    if (!recordId) {
      setTags(nextTags);
      setInputVisible(false);
      setInputValue('');
      onChange?.(nextTags);
      return;
    }

    const { error } = await supabase.from('record_tags').insert([
      {
        record_id: recordId,
        tag_id: tag.id,
        module_id: moduleId,
      },
    ]);

    if (!error) {
      setTags(nextTags);
      setInputVisible(false);
      setInputValue('');
      await insertChangelog(tags, nextTags);
      onChange?.(nextTags);
    }
  };

  const handleCreateNewTag = async () => {
    if (!inputValue) return;

    const { data: newTag, error } = await supabase
      .from('tags')
      .insert([
        {
          title: inputValue,
          color: typeof selectedColor === 'string' ? selectedColor : (selectedColor as any).toHexString(),
        },
      ])
      .select()
      .single();

    if (!error && newTag) {
      await handleSelectTag(newTag);
    }
  };

  const filteredTags = allTags.filter(
    (tag) =>
      tag.title.toLowerCase().includes(inputValue.toLowerCase())
      && !tags.some((selected) => selected.id === tag.id)
  );

  const dropdownRender = () => (
    <div className="bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 w-64">
      <Input
        ref={inputRef}
        type="text"
        size="small"
        style={{ width: '100%', marginBottom: 8 }}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="جستجو یا ایجاد تگ..."
        prefix={<TagOutlined className="text-gray-400" />}
      />

      <div className="max-h-48 overflow-y-auto space-y-1">
        {filteredTags.map((tag) => (
          <div
            key={tag.id}
            onClick={() => void handleSelectTag(tag)}
            className="flex items-center gap-2 p-1.5 hover:bg-gray-100 dark:hover:bg-white/5 rounded cursor-pointer transition-colors"
          >
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }}></span>
            <span className="text-sm dark:text-gray-200">{tag.title}</span>
          </div>
        ))}
        {filteredTags.length === 0 && inputValue && (
          <div className="p-2 border-t border-gray-100 dark:border-gray-700 mt-2">
            <div className="text-xs text-gray-400 mb-2">ایجاد تگ جدید: "{inputValue}"</div>
            <div className="flex items-center gap-2">
              <ColorPicker
                size="small"
                value={selectedColor}
                onChange={(_, css) => setSelectedColor(css)}
              />
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => void handleCreateNewTag()} block>
                ایجاد
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {tags.map((tag) => (
        <span key={tag.id} className="inline-flex">
          <Tag
            closable={!disabled}
            onClose={(e) => {
              e.preventDefault();
              if (disabled) return;
              void handleClose(tag.id);
            }}
            color={tag.color}
            className="rounded-full px-3 border-none flex items-center gap-1 text-[11px]"
          >
            {tag.title}
          </Tag>
        </span>
      ))}

      <Dropdown
        open={disabled ? false : inputVisible}
        onOpenChange={(open) => {
          if (disabled) return;
          setInputVisible(open);
        }}
        popupRender={dropdownRender}
        trigger={['click']}
        placement="bottomLeft"
        getPopupContainer={(node) => node.parentElement || document.body}
        overlayStyle={{ zIndex: popupZIndex }}
      >
        <Tag
          onClick={() => {
            if (disabled) return;
            setInputVisible(true);
          }}
          className={`border-dashed bg-transparent rounded-full px-3 ${
            disabled
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer hover:border-leather-500 hover:text-leather-500'
          }`}
        >
          <PlusOutlined /> تگ جدید
        </Tag>
      </Dropdown>
    </div>
  );
};

export default TagInput;
