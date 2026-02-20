import React, { useState, useEffect, useRef } from 'react';
import { Tag, Input, Dropdown, Button, ColorPicker } from 'antd';
import { PlusOutlined, TagOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';

interface TagItem {
  id: string;
  title: string;
  color: string;
}

interface TagInputProps {
  recordId: string;
  moduleId: string;
  initialTags?: TagItem[];
  onChange?: () => void; // برای رفرش کردن والد
}

const TagInput: React.FC<TagInputProps> = ({ recordId, moduleId, initialTags = [], onChange }) => {
  const [tags, setTags] = useState<TagItem[]>(initialTags);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedColor, setSelectedColor] = useState('#1677ff'); // رنگ پیش‌فرض آبی
  const inputRef = useRef<any>(null);

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  useEffect(() => {
    if (inputVisible) {
      inputRef.current?.focus();
      fetchAllTags();
    }
  }, [inputVisible]);

  const fetchAllTags = async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) setAllTags(data);
  };

  const insertChangelog = async (prevTags: TagItem[], nextTags: TagItem[]) => {
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
          old_value: JSON.stringify(prevTags.map(t => t.title)),
          new_value: JSON.stringify(nextTags.map(t => t.title)),
          user_id: userId,
        }
      ]);
    } catch (err) {
      console.warn('Changelog insert failed (tags):', err);
    }
  };

  const handleClose = async (removedTagId: string) => {
    // حذف ارتباط تگ با رکورد
    const { error } = await supabase
        .from('record_tags')
        .delete()
        .match({ record_id: recordId, tag_id: removedTagId });

    if (!error) {
      const newTags = tags.filter((tag) => tag.id !== removedTagId);
      setTags(newTags);
      await insertChangelog(tags, newTags);
      if (onChange) onChange();
    }
  };

  const handleSelectTag = async (tag: TagItem) => {
      // بررسی تکراری نبودن
      if (tags.some(t => t.id === tag.id)) return;

      // ایجاد ارتباط
      const { error } = await supabase.from('record_tags').insert([{
          record_id: recordId,
          tag_id: tag.id,
          module_id: moduleId
      }]);

        if (!error) {
          const nextTags = [...tags, tag];
          setTags(nextTags);
          setInputVisible(false);
          setInputValue('');
          await insertChangelog(tags, nextTags);
          if (onChange) onChange();
        }
  };

  const handleCreateNewTag = async () => {
    if (!inputValue) return;
    
    // 1. ساخت تگ جدید در جدول tags
    const { data: newTag, error } = await supabase
        .from('tags')
        .insert([{ title: inputValue, color: typeof selectedColor === 'string' ? selectedColor : (selectedColor as any).toHexString() }])
        .select()
        .single();

    if (!error && newTag) {
        // 2. اتصال به رکورد
        handleSelectTag(newTag);
    }
  };

  const filteredTags = allTags.filter(t => t.title.toLowerCase().includes(inputValue.toLowerCase()) && !tags.some(selected => selected.id === t.id));

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
              {filteredTags.map(tag => (
                  <div 
                    key={tag.id} 
                    onClick={() => handleSelectTag(tag)}
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
                          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreateNewTag} block>ایجاد</Button>
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
            closable
            onClose={(e) => {
              e.preventDefault();
              handleClose(tag.id);
            }}
            color={tag.color}
            className="rounded-full px-3 border-none flex items-center gap-1 text-[11px]"
          >
            {tag.title}
          </Tag>
        </span>
      ))}
      
      <Dropdown 
        open={inputVisible} 
        onOpenChange={setInputVisible}
        dropdownRender={dropdownRender} 
        trigger={['click']}
        placement="bottomLeft"
      >
        <Tag onClick={() => setInputVisible(true)} className="border-dashed bg-transparent cursor-pointer hover:border-leather-500 hover:text-leather-500 rounded-full px-3">
          <PlusOutlined /> تگ جدید
        </Tag>
      </Dropdown>
    </div>
  );
};

export default TagInput;