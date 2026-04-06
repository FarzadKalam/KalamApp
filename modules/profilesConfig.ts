import { ModuleDefinition, FieldType, FieldLocation, BlockType } from '../types';
import { SOFTWARE_ROLE_OPTIONS } from '../utils/softwareRoles';

const SOFTWARE_ROLE_OPTION_COLORS: Record<string, string> = {
  super_admin: 'gold',
  admin: 'blue',
  manager: 'purple',
  editor: 'orange',
  viewer: 'default',
  user: 'green',
  employee: 'cyan',
};

export const profilesModule: ModuleDefinition = {
  id: 'profiles',
  titles: { fa: 'پروفایل کاربری', en: 'User Profile' },
  table: 'profiles',
  relationDisplay: {
    labelTemplate: '{{full_name}}',
    searchFields: ['full_name', 'email', 'mobile', 'mobile_1', 'job_title', 'id'],
  },
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
      labels: { fa: 'نقش نرم‌افزاری' },
      type: FieldType.SELECT,
      location: FieldLocation.BLOCK,
      blockId: 'details',
      options: SOFTWARE_ROLE_OPTIONS.map((option) => ({
        ...option,
        color: SOFTWARE_ROLE_OPTION_COLORS[option.value] || 'default',
      })),
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
  ],
  relatedTabs: [
    {
      id: 'related_employee',
      title: 'کارمند مرتبط',
      icon: 'UsergroupAddOutlined',
      relationType: 'fk_from_field',
      targetModule: 'employees',
      sourceField: 'id',
      foreignKey: 'related_profile_id',
    },
  ]
};
