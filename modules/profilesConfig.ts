import { ModuleDefinition, FieldType, FieldLocation, BlockType } from '../types';

export const profilesModule: ModuleDefinition = {
  id: 'profiles',
  titles: { fa: 'پروفایل کاربری', en: 'User Profile' },
  table: 'profiles',
  fields: [
    // --- فیلدهای اصلی (هدر) ---
    { 
      key: 'full_name', 
      labels: { fa: 'نام و نام خانوادگی' }, 
      type: FieldType.TEXT, 
      location: FieldLocation.HEADER
    },
    { 
      key: 'job_title', 
      labels: { fa: 'عنوان شغلی' }, 
      type: FieldType.TEXT,
      location: FieldLocation.HEADER
    },
    { 
      key: 'is_active', 
      labels: { fa: 'وضعیت حساب' }, 
      type: FieldType.CHECKBOX,
      location: FieldLocation.HEADER
    },
    
    // --- فیلدهای تماس و سازمانی ---
    { 
      key: 'mobile', 
      labels: { fa: 'شماره موبایل' }, 
      type: FieldType.TEXT,
      location: FieldLocation.BLOCK,
      blockId: 'details'
    },
    { 
      key: 'email', 
      labels: { fa: 'ایمیل' }, 
      type: FieldType.TEXT,
      location: FieldLocation.BLOCK,
      blockId: 'details'
      // نکته: این فیلد مجازی است و از جدول auth پر می‌شود
    },
    { 
      key: 'org_id', 
      labels: { fa: 'سازمان' }, 
      type: FieldType.RELATION,
      location: FieldLocation.BLOCK,
      blockId: 'details',
      relationConfig: { 
        targetModule: 'organizations', 
        targetField: 'name' 
      }
    },
    {
      key: 'role',
      labels: { fa: 'نقش کاربری' },
      type: FieldType.SELECT,
      location: FieldLocation.BLOCK,
      blockId: 'details',
      options: [
        { label: 'مدیر کل سیستم', value: 'super_admin', color: 'gold' },
        { label: 'مدیر داخلی', value: 'admin', color: 'blue' },
        { label: 'کارمند', value: 'employee', color: 'cyan' },
        { label: 'بازدیدکننده', value: 'viewer', color: 'default' },
      ]
    },

    // --- اطلاعات تکمیلی ---
    { 
      key: 'bio', 
      labels: { fa: 'درباره من' }, 
      type: FieldType.TEXT,
      location: FieldLocation.BLOCK,
      blockId: 'details'
    },
    { 
      key: 'created_at', 
      labels: { fa: 'تاریخ عضویت' }, 
      type: FieldType.DATE,
      location: FieldLocation.BLOCK,
      blockId: 'details'
    }
  ],
  blocks: [
    {
      id: 'details',
      titles: { fa: 'جزئیات' },
      type: BlockType.FIELD_GROUP,
      order: 1,
    },
  ]
};