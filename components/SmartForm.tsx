import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Form, Button, message, Spin, Divider, Select, Space, Modal, Checkbox } from 'antd';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import SmartFieldRenderer from './SmartFieldRenderer';
import EditableTable from './EditableTable.tsx';
import GridTable from './GridTable';
import SmartTableRenderer from './SmartTableRenderer';
import SummaryCard from './SummaryCard';
import { calculateSummary } from '../utils/calculations';
import { ModuleDefinition, FieldLocation, BlockType, LogicOperator, FieldType, SummaryCalculationType } from '../types';
import { convertArea } from '../utils/unitConversions';
import { PRODUCTION_MESSAGES } from '../utils/productionMessages';
import ProductionStagesField from './ProductionStagesField';
import { applyInvoiceFinalizationInventory } from '../utils/invoiceInventoryWorkflow';
import { syncCustomerLevelsByInvoiceCustomers } from '../utils/customerLeveling';
import { attachTaskCompletionIfNeeded } from '../utils/taskCompletion';

interface SmartFormProps {
  module: ModuleDefinition;
  visible: boolean;
  onCancel: () => void;
  onSave?: (values: any, meta?: { productInventory?: any[] }) => void;
  recordId?: string;
  title?: string;
  isBulkEdit?: boolean;
  initialValues?: Record<string, any>;
}

const SmartForm: React.FC<SmartFormProps> = ({ 
  module, visible, onCancel, onSave, recordId, title, isBulkEdit = false,
  initialValues: initialValuesProp
}) => {
  const initialValues = useMemo(() => initialValuesProp ?? {}, [initialValuesProp]);
  const requireInventoryShelf = initialValuesProp?.__requireInventoryShelf === true;
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [initialRecord, setInitialRecord] = useState<any>(null);
  const watchedValues = Form.useWatch([], form);
  
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean }>({});
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [assignees, setAssignees] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [lastAppliedBomId, setLastAppliedBomId] = useState<string | null>(null);
  const bomConfirmOpenRef = useRef<string | null>(null);

  const buildAssigneeCombo = (assigneeType?: string | null, assigneeId?: string | null) => {
    if (!assigneeType || !assigneeId) return null;
    return `${assigneeType}_${assigneeId}`;
  };

  const parseAssigneeCombo = (val?: string | null) => {
    if (!val) return { assignee_type: null, assignee_id: null };
    const [type, id] = String(val).split('_');
    return { assignee_type: type || 'user', assignee_id: id || null };
  };
  
  const fetchAllRelationOptionsWrapper = async () => {
    await fetchRelationOptions();
    await loadDynamicOptions();
  };

  useEffect(() => {
    if (visible) {
      fetchAllRelationOptionsWrapper();
    }
  }, [visible, module.id]);

  useEffect(() => {
    if (visible) {
      if (recordId && !isBulkEdit) {
        // --- حالت ویرایش ---
        fetchRecord();
      } else {
        // --- حالت ایجاد رکورد جدید ---
        form.resetFields();
        setFormData({}); // اول خالی کن
        setLastAppliedBomId(null);

        // 1. استخراج مقادیر پیش‌فرض از کانفیگ
        const defaults: Record<string, any> = {};
        module.fields.forEach(field => {
          if (field.defaultValue !== undefined) {
            defaults[field.key] = field.defaultValue;
          }
        });

        // 2. ترکیب با مقادیر اولیه ورودی (اولویت با ورودی‌هاست)
        const initialProps = initialValues || {};
        const assigneeCombo = buildAssigneeCombo(initialProps?.assignee_type, initialProps?.assignee_id);
        const finalValues = { ...defaults, ...initialProps, assignee_combo: assigneeCombo };

        // 3. اعمال مقادیر اولیه بدون تاخیر (برای جلوگیری از flicker)
        setFormData(finalValues);
        form.setFieldsValue(finalValues);
      }
      
      // فراخوانی توابع کمکی
      fetchUserPermissions();
      fetchAssignees();
    }
  }, [visible, recordId, isBulkEdit, module, initialValues]);

  const fetchAssignees = async () => {
    try {
      const { data: users } = await supabase.from('profiles').select('id, full_name');
      const { data: roles } = await supabase.from('org_roles').select('id, title');
      setAssignees({ users: users || [], roles: roles || [] });
    } catch (e) {
      console.warn('Could not fetch assignees', e);
    }
  };

  const assigneeOptions = [
    { label: 'پرسنل', title: 'users', options: assignees.users.map(u => ({ label: u.full_name, value: `user_${u.id}`, emoji: <UserOutlined /> })) },
    { label: 'تیم‌ها', title: 'roles', options: assignees.roles.map(r => ({ label: r.title, value: `role_${r.id}`, emoji: <TeamOutlined /> })) }
  ];

  const fetchUserPermissions = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id')
        .eq('id', user.id)
        .single();

      if (!profile?.role_id) return;

      const { data: role } = await supabase
        .from('org_roles')
        .select('permissions')
        .eq('id', profile.role_id)
        .single();

      const modulePerms = role?.permissions?.[module.id] || {};
      setModulePermissions({
        view: modulePerms.view,
        edit: modulePerms.edit,
        delete: modulePerms.delete,
      });
      setFieldPermissions(modulePerms.fields || {});
    } catch (err) {
      console.warn('Could not fetch permissions:', err);
    }
  };
  
  // --- 2. دریافت آپشن‌های ارتباطی (Relation) ---
  const fetchRelationOptions = async () => {
    const options: Record<string, any[]> = {};
    
    // تابع کمکی برای دریافت دیتا با کد سیستمی
    const fetchOptionsForField = async (targetModule?: string, targetField?: string, key?: string) => {
        // اگر پارامترهای ضروری موجود نیستند، کاری انجام نده
        if (!targetModule || !targetField || !key) return;

        try {
            const isShelvesTarget = targetModule === 'shelves';
            const extraSelect = isShelvesTarget ? ', shelf_number' : '';
            // تلاش برای گرفتن نام + کد سیستمی
            const { data, error } = await supabase
                .from(targetModule)
                .select(`id, ${targetField}, system_code${extraSelect}`)
                .limit(100);
            
            if (!error && data) {
                options[key] = data.map((item: any) => ({
                    label: item.system_code
                      ? `${item[targetField] || item.shelf_number || item.system_code || item.id} (${item.system_code})`
                      : (item[targetField] || item.shelf_number || item.system_code || item.id),
                    value: item.id
                }));
                return;
            }
        } catch (e) { /* اگر فیلد system_code نبود خطا نده */ }

        try {
            // تلاش دوم: فقط نام
            const { data } = await supabase
                .from(targetModule)
                .select(`id, ${targetField}`)
                .limit(100);
            
            if (data) {
                options[key] = data.map((item: any) => ({
                    label: item[targetField],
                    value: item.id
                }));
            }
        } catch (e) { console.error("Error fetching relation:", e); }
    };

    // پیمایش فیلدهای اصلی
    for (const field of module.fields) {
      if (field.type === FieldType.RELATION && field.relationConfig) {
        await fetchOptionsForField(field.relationConfig.targetModule, field.relationConfig.targetField, field.key);
      }
    }

    // پیمایش ستون‌های جداول
    if (module.blocks) {
      for (const block of module.blocks) {
        if (block.tableColumns) {
          for (const col of block.tableColumns) {
            if (col.type === FieldType.RELATION && col.relationConfig) {
              const key = `${block.id}_${col.key}`;
              await fetchOptionsForField(col.relationConfig.targetModule, col.relationConfig.targetField, key);
              // کپی برای دسترسی راحت‌تر
              if (!options[col.key]) options[col.key] = options[key];
            }
          }
        }
      }
    }
    setRelationOptions(options);
  };

  // --- 3. دریافت آپشن‌های داینامیک ---
  const loadDynamicOptions = async () => {
    const newOptions: Record<string, any[]> = {};
    const categoriesToFetch = new Set<string>();

    // جمع‌آوری دسته‌ها از فیلدها و ستون‌های جدول
    module.fields.forEach(f => { if (f.dynamicOptionsCategory) categoriesToFetch.add(f.dynamicOptionsCategory); });
    module.blocks?.forEach(b => {
      b.tableColumns?.forEach((c: any) => { if (c.dynamicOptionsCategory) categoriesToFetch.add(c.dynamicOptionsCategory); });
    });

    for (const category of Array.from(categoriesToFetch)) {
        const { data } = await supabase
            .from('dynamic_options')
            .select('label, value')
            .eq('category', category)
            .eq('is_active', true)
            .order('display_order', { ascending: true });
        
        if (data) {
            newOptions[category] = data.map(item => ({
                label: item.label,
                value: item.value,
            }));
        }
    }
    try {
      const { data: formulas } = await supabase
        .from('calculation_formulas')
        .select('id, name');
      if (formulas) {
        newOptions['calculation_formulas'] = formulas.map((f: any) => ({
          label: f.name,
          value: f.id,
        }));
      }
    } catch (err) {
      console.warn('Could not load calculation formulas', err);
    }
    setDynamicOptions(newOptions);
  };

  const getFieldValueLabel = (fieldKey: string, value: any) => {
    if (value === undefined || value === null) return '';
    const field = module.fields.find(f => f.key === fieldKey);
    if (!field) return String(value);

    const formatOptionLabel = (val: any) => {
      if (val === undefined || val === null) return '';
      let opt = field.options?.find((o: any) => o.value === val);
      if (opt) return opt.label;
      if (field.dynamicOptionsCategory) {
        opt = dynamicOptions[field.dynamicOptionsCategory]?.find((o: any) => o.value === val);
        if (opt) return opt.label;
      }
      if (field.type === FieldType.RELATION) {
        const rel = relationOptions[fieldKey]?.find((o: any) => o.value === val);
        if (rel) return rel.label;
      }
      return String(val);
    };

    if (Array.isArray(value)) {
      return value.map(v => formatOptionLabel(v)).filter(Boolean).join('، ');
    }
    return formatOptionLabel(value);
  };

  const buildAutoProductName = (values: any) => {
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };

    const productType = values?.product_type;
    if (productType === 'raw') {
      addPart(getFieldValueLabel('category', values?.category));
      const category = values?.category;
      const specKeys = category === 'leather'
        ? ['leather_type', 'leather_colors', 'leather_finish_1', 'leather_effect', 'leather_sort']
        : category === 'lining'
          ? ['lining_material', 'lining_color', 'lining_width']
          : category === 'accessory'
            ? ['acc_material']
            : category === 'fitting'
              ? ['fitting_type', 'fitting_colors', 'fitting_size']
              : [];
      specKeys.forEach(key => addPart(getFieldValueLabel(key, values?.[key])));
    } else {
      addPart(getFieldValueLabel('product_category', values?.product_category));
      if (values?.related_bom) {
        addPart(getFieldValueLabel('related_bom', values?.related_bom));
      }
    }
    addPart(getFieldValueLabel('brand_name', values?.brand_name));

    return parts.join(' ');
  };

  const buildAutoProductionOrderName = (values: any) => {
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };
    const bomLabelRaw = getFieldValueLabel('bom_id', values?.bom_id);
    const bomLabelClean = String(bomLabelRaw || '').replace(/\s*\([^()]*\)\s*$/, '').trim();
    addPart(bomLabelClean);
    addPart(getFieldValueLabel('color', values?.color));
    return parts.join(' ');
  };

  // --- 4. دریافت رکورد (در حالت ویرایش) ---
  const fetchRecord = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from(module.table).select('*').eq('id', recordId).single();
      if (error) throw error;
      if (data) {
        const assigneeCombo = buildAssigneeCombo(data?.assignee_type, data?.assignee_id);
        const nextValues = { ...data, assignee_combo: assigneeCombo };
        form.setFieldsValue(nextValues);
        setFormData(nextValues);
        setInitialRecord(data);
      }
    } catch (err: any) {
      message.error('خطا: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (module.id !== 'production_orders') return;
    const bomId = (watchedValues?.bom_id || formData?.bom_id) as string | undefined;
    if (!bomId || bomId === lastAppliedBomId) return;

    const applyBom = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('production_boms')
          .select('name, grid_materials, product_category, production_stages_draft')
          .eq('id', bomId)
          .single();
        if (error) throw error;

        const payload = {
          grid_materials: data?.grid_materials || [],
          product_category: data?.product_category || null,
          production_stages_draft: data?.production_stages_draft || [],
          name: data?.name || undefined,
        };

        form.setFieldsValue(payload);
        setFormData((prev: any) => ({ ...prev, ...payload, bom_id: bomId }));
        setLastAppliedBomId(bomId);
        message.success('اقلام BOM به سفارش تولید منتقل شد');
      } catch (err: any) {
        console.error(err);
        message.error('دریافت اقلام BOM ناموفق بود');
      } finally {
        setLoading(false);
      }
    };

    if (initialValuesProp?.__skipBomConfirm === true && !lastAppliedBomId) {
      applyBom();
      return;
    }

    if (bomConfirmOpenRef.current === bomId) return;
    bomConfirmOpenRef.current = bomId;

    Modal.confirm({
      title: 'کپی از شناسنامه تولید',
      content: 'جداول سفارش تولید ریست شوند و مقادیر از روی BOM کپی شوند؟',
      okText: 'بله، کپی کن',
      cancelText: 'خیر',
      onOk: async () => {
        await applyBom();
        bomConfirmOpenRef.current = null;
      },
      onCancel: () => {
        setLastAppliedBomId(bomId);
        bomConfirmOpenRef.current = null;
      },
    });
  }, [module.id, watchedValues?.bom_id, lastAppliedBomId, initialValuesProp]);

  useEffect(() => {
    if (module.id !== 'products') return;
    const currentValues = watchedValues || formData;
    if (!currentValues?.auto_name_enabled) return;
    const nextName = buildAutoProductName(currentValues);
    if (!nextName || nextName === currentValues?.name) return;
    form.setFieldValue('name', nextName);
    setFormData((prev: any) => ({ ...prev, name: nextName }));
  }, [module.id, watchedValues, relationOptions, dynamicOptions]);

  useEffect(() => {
    if (module.id !== 'production_orders') return;
    const currentValues = watchedValues || formData;
    if (!currentValues?.auto_name_enabled) return;
    const nextName = buildAutoProductionOrderName(currentValues);
    if (!nextName || nextName === currentValues?.name) return;
    form.setFieldValue('name', nextName);
    setFormData((prev: any) => ({ ...prev, name: nextName }));
  }, [module.id, watchedValues, relationOptions, dynamicOptions]);

  useEffect(() => {
    if (module.id !== 'products') return;
    const currentValues = watchedValues || formData;
    const mainUnit = currentValues?.main_unit;
    const subUnit = currentValues?.sub_unit;
    const stock = parseFloat(currentValues?.stock) || 0;
    if (!mainUnit || !subUnit) return;
    const subStock = convertArea(stock, mainUnit, subUnit);
    const currentSubStock = parseFloat(currentValues?.sub_stock);
    if (
      Number.isFinite(subStock) &&
      (!Number.isFinite(currentSubStock) || Math.abs((currentSubStock as number) - subStock) > 0.0005)
    ) {
      form.setFieldValue('sub_stock', subStock);
      setFormData((prev: any) => ({ ...prev, sub_stock: subStock }));
    }
  }, [module.id, watchedValues, formData, form]);

  // --- تابع کمکی: دریافت دیتای خلاصه (Summary) ---
  const getSummaryData = (currentData: any) => {
      const summaryBlock = module.blocks?.find(b => b.summaryConfig);
      if (summaryBlock) {
          return calculateSummary(currentData, module.blocks || [], summaryBlock.summaryConfig);
      }
      // اگر کانفیگ نبود ولی جدول داشتیم، پیش‌فرض جمع بزن (برای BOM)
      if (module.blocks?.some(b => b.type === BlockType.TABLE)) {
          return calculateSummary(currentData, module.blocks || [], {});
      }
      return null;
  };

  // --- ذخیره نهایی ---
  const handleFinish = async (values: any) => {
    setLoading(true);
    try {
      if (module.id === 'production_orders' && !recordId) {
        values = { ...formData, ...values };
      }
      if (module.id === 'products') {
        const mainUnit = values?.main_unit ?? formData?.main_unit;
        const subUnit = values?.sub_unit ?? formData?.sub_unit;
        const stock = parseFloat(values?.stock ?? formData?.stock ?? 0) || 0;
        if (mainUnit && subUnit) {
          const computedSubStock = convertArea(stock, mainUnit, subUnit);
          if (Number.isFinite(computedSubStock)) {
            values.sub_stock = computedSubStock;
          }
        }
      }
      const assigneeCombo = values?.assignee_combo ?? formData?.assignee_combo;
      if (assigneeCombo) {
        const { assignee_id, assignee_type } = parseAssigneeCombo(assigneeCombo);
        values.assignee_id = assignee_id;
        values.assignee_type = assignee_type;
      } else {
        if (formData?.assignee_id && !values?.assignee_id) {
          values.assignee_id = formData.assignee_id;
        }
        if (formData?.assignee_type && !values?.assignee_type) {
          values.assignee_type = formData.assignee_type;
        }
      }
      if (values?.assignee_combo !== undefined) {
        delete values.assignee_combo;
      }
      const productInventoryRows = Array.isArray(values?.product_inventory) ? values.product_inventory : [];
      if (requireInventoryShelf && module.id === 'products') {
        const missingShelf = productInventoryRows.some((row: any) => !row?.shelf_id);
        if (missingShelf) {
          message.error(PRODUCTION_MESSAGES.requireInventoryShelf);
          setLoading(false);
          return;
        }
      }

      if (values?.__requireInventoryShelf !== undefined) {
        delete values.__requireInventoryShelf;
      }
      if (values?.__skipBomConfirm !== undefined) {
        delete values.__skipBomConfirm;
      }

      if (module.id === 'products' && values.auto_name_enabled) {
        const nextName = buildAutoProductName(values);
        if (nextName) {
          values.name = nextName;
        }
      }
      if (module.id === 'production_orders' && values.auto_name_enabled) {
        const nextName = buildAutoProductionOrderName(values);
        if (nextName) {
          values.name = nextName;
        }
      }
      if (module.id === 'products') {
        delete values.product_inventory;
      }
      if (module.id === 'shelves') {
        delete values.shelf_inventory;
        delete values.shelf_stock_movements;
        delete values.task_shelf_inventory;
        delete values.task_shelf_stock_movements;
      }
      if (module.id === 'production_orders') {
        if (values.grid_materials === undefined) {
          values.grid_materials = formData?.grid_materials || [];
        }
        if (values.production_stages_draft === undefined) {
          values.production_stages_draft = formData?.production_stages_draft || [];
        }
      }
      if (module.id === 'production_boms') {
        if (values.production_stages_draft === undefined) {
          values.production_stages_draft = formData?.production_stages_draft || [];
        }
      }
      const summaryData = getSummaryData(formData);
      const summaryBlock = module.blocks?.find(b => b.summaryConfig);

      // تزریق مقادیر محاسباتی به دیتای ارسالی
      if (summaryData && summaryBlock?.summaryConfig?.fieldMapping) {
          const mapping = summaryBlock.summaryConfig.fieldMapping;
          if (mapping.total && summaryData.total !== undefined) values[mapping.total] = summaryData.total;
          if (mapping.received && summaryData.received !== undefined) values[mapping.received] = summaryData.received;
          if (mapping.remaining && summaryData.remaining !== undefined) values[mapping.remaining] = summaryData.remaining;
        } else if (summaryData && (module.id === 'products' || module.id === 'production_boms' || module.id === 'production_orders')) {
          values['production_cost'] = summaryData.total;
      }
      if (module.id === 'tasks') {
        values = attachTaskCompletionIfNeeded(values, {
          previousCompletedAt: initialRecord?.completed_at ?? null,
          previousStatus: initialRecord?.status ?? null,
          previousStartDate: initialRecord?.start_date ?? null,
        }) as any;
      }

      if (onSave) {
        await onSave(values, { productInventory: productInventoryRows });
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || null;

        if (recordId) {
          await supabase.from(module.table).update(values).eq('id', recordId);

          if (module.id === 'invoices' || module.id === 'purchase_invoices') {
            await applyInvoiceFinalizationInventory({
              supabase: supabase as any,
              moduleId: module.id,
              recordId,
              previousStatus: initialRecord?.status ?? null,
              nextStatus: values?.status ?? initialRecord?.status ?? null,
              invoiceItems: values?.invoiceItems ?? initialRecord?.invoiceItems ?? [],
              userId,
            });
            if (module.id === 'invoices') {
              await syncCustomerLevelsByInvoiceCustomers({
                supabase: supabase as any,
                customerIds: [initialRecord?.customer_id, values?.customer_id],
              });
            }
          }

          const changes: any[] = [];
          const compareKeys = new Set<string>([...Object.keys(values || {}), ...Object.keys(initialRecord || {})]);
          compareKeys.forEach((key) => {
            const before = initialRecord?.[key];
            const after = values?.[key];
            const beforeStr = JSON.stringify(before ?? null);
            const afterStr = JSON.stringify(after ?? null);
            if (beforeStr !== afterStr) {
              const fieldLabel = module.fields.find(f => f.key === key)?.labels?.fa || key;
              changes.push({
                module_id: module.id,
                record_id: recordId,
                action: 'update',
                field_name: key,
                field_label: fieldLabel,
                old_value: before ?? null,
                new_value: after ?? null,
                user_id: userId,
                record_title: values?.name || values?.title || values?.system_code || null,
              });
            }
          });

          if (changes.length > 0) {
            try {
              const { error } = await supabase.from('changelogs').insert(changes);
              if (error) throw error;
            } catch (err) {
              console.warn('Changelog insert failed:', err);
            }
          }
        } else {
          const { data: inserted, error } = await supabase
            .from(module.table)
            .insert(values)
            .select('id')
            .single();
          if (error) throw error;

          if (inserted?.id) {
            if (module.id === 'invoices' || module.id === 'purchase_invoices') {
              await applyInvoiceFinalizationInventory({
                supabase: supabase as any,
                moduleId: module.id,
                recordId: inserted.id,
                previousStatus: null,
                nextStatus: values?.status ?? null,
                invoiceItems: values?.invoiceItems ?? [],
                userId,
              });
              if (module.id === 'invoices') {
                await syncCustomerLevelsByInvoiceCustomers({
                  supabase: supabase as any,
                  customerIds: [values?.customer_id],
                });
              }
            }
            if (module.id === 'production_orders') {
              const postPayload: any = {};
              if (values?.grid_materials !== undefined) postPayload.grid_materials = values.grid_materials;
              if (values?.production_stages_draft !== undefined) postPayload.production_stages_draft = values.production_stages_draft;
              if (Object.keys(postPayload).length > 0) {
                await supabase.from(module.table).update(postPayload).eq('id', inserted.id);
              }
            }
            try {
              const { error } = await supabase.from('changelogs').insert([
                {
                  module_id: module.id,
                  record_id: inserted.id,
                  action: 'create',
                  user_id: userId,
                  record_title: values?.name || values?.title || values?.system_code || null,
                },
              ]);
              if (error) throw error;
            } catch (err) {
              console.warn('Changelog insert failed:', err);
            }
          }
        }

        message.success('ثبت شد');
        onCancel();
      }
    } catch (err: any) { message.error(err.message); } finally { setLoading(false); }
  };

  const handleValuesChange = (_: any, allValues: any) => {
    const cleanedValues = Object.fromEntries(
      Object.entries(allValues || {}).filter(([, value]) => value !== undefined)
    );
    setFormData((prev: any) => ({ ...prev, ...cleanedValues }));
  };
  const checkVisibility = (logicOrRule: any, values?: any) => {
    if (!logicOrRule) return true;
    
    // پشتیبانی هم از آبجکت logic (که visibleIf دارد) و هم از خود قانون شرط
    const rule = logicOrRule.visibleIf || logicOrRule;
    
    // اگر قانون معتبری نبود، نمایش بده
    if (!rule || !rule.field) return true;

    const { field, operator, value } = rule;
    const resolvedValues = values || watchedValues || formData;
    const fieldValue = resolvedValues?.[field];

    // اگر فیلد مرجع هنوز مقدار نگرفته، برای شرط‌های "مخالف" آن را مخفی کن
    if (fieldValue === undefined || fieldValue === null) {
         if (operator === LogicOperator.NOT_EQUALS) return false;
    }

    switch (operator) {
      case LogicOperator.EQUALS:
        return fieldValue === value;
      case LogicOperator.NOT_EQUALS:
        return fieldValue !== value;
      case LogicOperator.CONTAINS:
        return Array.isArray(fieldValue) ? fieldValue.includes(value) : false;
      case LogicOperator.GREATER_THAN:
        return Number(fieldValue) > Number(value);
      case LogicOperator.LESS_THAN:
        return Number(fieldValue) < Number(value);
      default:
        return true;
    }
  };

  const canEditModule = modulePermissions.edit !== false;
  const canViewField = (fieldKey: string) => {
    if (Object.prototype.hasOwnProperty.call(fieldPermissions, fieldKey)) {
      return fieldPermissions[fieldKey] !== false;
    }
    return true;
  };
  const formActionButtons = (module.actionButtons || []).filter(b => b.placement === 'form');
  const sortedBlocks = [...(module.blocks || [])].sort((a, b) => a.order - b.order);
  const headerFields = module.fields
      .filter(f => f.location === FieldLocation.HEADER)
      .filter(f => canViewField(f.key))
      .filter(f => f.key !== 'assignee_id' && f.key !== 'assignee_type')
      .filter(f => f.nature !== 'system') // 👈 این خط را اینجا هم اضافه کنید
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  // محاسبه دیتا برای نمایش در لحظه (رندر)
  const currentValues = watchedValues || formData;
  const currentSummaryData = getSummaryData(currentValues);
  const summaryConfigObj = module.blocks?.find(b => b.summaryConfig)?.summaryConfig;

  const handleFormAction = (actionId: string) => {
    if (actionId === 'auto_name' && module.id === 'products') {
      let enableAuto = !!form.getFieldValue('auto_name_enabled');
      Modal.confirm({
        title: 'نامگذاری خودکار محصول',
        content: (
          <div className="space-y-3">
            <div>نام محصول براساس مشخصات فعلی ساخته شود؟</div>
            <Checkbox defaultChecked={enableAuto} onChange={(e) => { enableAuto = e.target.checked; }}>
              بروزرسانی خودکار هنگام تغییر مشخصات
            </Checkbox>
          </div>
        ),
        okText: 'اعمال',
        cancelText: 'انصراف',
        onOk: () => {
          const currentValues = form.getFieldsValue();
          const nextName = buildAutoProductName({ ...currentValues, auto_name_enabled: enableAuto });
          if (!nextName) {
            message.warning('اطلاعات کافی برای نامگذاری وجود ندارد');
            return;
          }
          form.setFieldValue('auto_name_enabled', enableAuto);
          form.setFieldValue('name', nextName);
          setFormData({ ...currentValues, name: nextName, auto_name_enabled: enableAuto });
          message.success('نام محصول بروزرسانی شد');
        }
      });
      return;
    }
    if (actionId === 'auto_name' && module.id === 'production_orders') {
      let enableAuto = !!form.getFieldValue('auto_name_enabled');
      Modal.confirm({
        title: 'نامگذاری خودکار سفارش تولید',
        content: (
          <div className="space-y-3">
            <div>نام سفارش براساس شناسنامه تولید و رنگ ساخته شود؟</div>
            <Checkbox defaultChecked={enableAuto} onChange={(e) => { enableAuto = e.target.checked; }}>
              بروزرسانی خودکار هنگام تغییر مقادیر
            </Checkbox>
          </div>
        ),
        okText: 'اعمال',
        cancelText: 'انصراف',
        onOk: () => {
          const currentValues = form.getFieldsValue();
          const nextName = buildAutoProductionOrderName({ ...currentValues, auto_name_enabled: enableAuto });
          if (!nextName) {
            message.warning('اطلاعات کافی برای نامگذاری وجود ندارد');
            return;
          }
          form.setFieldValue('auto_name_enabled', enableAuto);
          form.setFieldValue('name', nextName);
          setFormData({ ...currentValues, name: nextName, auto_name_enabled: enableAuto });
          message.success('نام سفارش تولید بروزرسانی شد');
        }
      });
      return;
    }
    message.info('این عملیات هنوز پیاده‌سازی نشده است');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-3 md:p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#1e1e1e] w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg md:text-xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
              <span className="w-2 h-7 md:h-8 bg-leather-500 rounded-full inline-block"></span>
              {title || (recordId ? `ویرایش ${module.titles.fa}` : `افزودن ${module.titles.fa} جدید`)}
            </h2>
            {formActionButtons.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {formActionButtons.map(btn => (
                  <Button
                    key={btn.id}
                    type={btn.variant === 'primary' ? 'primary' : 'default'}
                    className={btn.variant === 'primary' ? 'bg-leather-600 hover:!bg-leather-500 border-none' : ''}
                    onClick={() => handleFormAction(btn.id)}
                  >
                    {btn.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <Button shape="circle" icon={<CloseOutlined />} onClick={onCancel} className="border-none hover:bg-red-50 hover:text-red-500" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar scrollbar-wide" style={{ position: 'relative', zIndex: 0 }}>
          {loading && !isBulkEdit ? (
            <div className="h-full flex items-center justify-center"><Spin size="large" /></div>
          ) : (
            <Form form={form} layout="vertical" onFinish={handleFinish} onValuesChange={handleValuesChange} initialValues={formData}>
              
              {(canViewField('assignee_id')) && (
                <div className="mb-6">
                  <div className="flex items-center justify-between sm:justify-start bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full pl-2 sm:pl-1 pr-3 py-1 gap-1 sm:gap-2">
                    <span className="text-xs text-gray-400 shrink-0">مسئول:</span>
                    <Form.Item name="assignee_combo" noStyle>
                      <Select
                        bordered={false}
                        placeholder="انتخاب کنید"
                        className="min-w-[180px] font-bold text-gray-700 dark:text-gray-300"
                        dropdownStyle={{ minWidth: 200, zIndex: 4000 }}
                        options={assigneeOptions}
                        optionRender={(option) => (
                          <Space>
                            <span role="img" aria-label={option.data.label}>{(option.data as any).emoji}</span>
                            {option.data.label}
                          </Space>
                        )}
                        disabled={!canEditModule}
                        getPopupContainer={() => document.body}
                        onChange={(val) => {
                          const { assignee_id, assignee_type } = parseAssigneeCombo(String(val));
                          form.setFieldValue('assignee_id', assignee_id);
                          form.setFieldValue('assignee_type', assignee_type);
                          setFormData((prev: any) => ({
                            ...prev,
                            assignee_combo: val,
                            assignee_id,
                            assignee_type
                          }));
                        }}
                      />
                    </Form.Item>
                  </div>
                </div>
              )}

              {/* Header Fields */}
              {headerFields.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 bg-gray-50 dark:bg-white/5 p-3 md:p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  {headerFields.map(field => {
                     if (field.logic && !checkVisibility(field.logic, currentValues)) return null;
                     let options = field.options; 
                     if (field.dynamicOptionsCategory) options = dynamicOptions[field.dynamicOptionsCategory];
                     if (field.type === FieldType.RELATION) options = relationOptions[field.key];
                     return (
                        <div key={field.key} className={field.type === FieldType.IMAGE ? 'row-span-2' : ''}>
                          <SmartFieldRenderer 
                            field={field} 
                            value={formData[field.key]} 
                            onChange={(val) => {
                              form.setFieldValue(field.key, val);
                              setFormData({ ...form.getFieldsValue(), [field.key]: val });
                            }}
                            forceEditMode={true}
                            options={options}
                            moduleId={module.id}
                            recordId={recordId}
                            allValues={formData}
                          />
                        </div>
                     );
                  })}
                </div>
              )}

              {(module.id === 'production_orders' || module.id === 'production_boms') && !(!recordId && module.id === 'production_orders') && (
                <div className="mb-6 bg-white dark:bg-[#1e1e1e] p-4 md:p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
                  <h3 className="text-sm md:text-lg font-bold mb-4 text-gray-700 dark:text-gray-200 flex items-center gap-2">
                    <span className="w-1 h-6 bg-leather-500 rounded-full inline-block"></span>
                    مراحل تولید
                  </h3>
                  <ProductionStagesField
                    recordId={recordId}
                    moduleId={module.id}
                    readOnly={!canEditModule}
                    compact={true}
                    orderStatus={module.id === 'production_orders' ? (currentValues as any)?.status : null}
                    draftStages={(currentValues as any)?.production_stages_draft || []}
                    onDraftStagesChange={(stages) => {
                      const next = { ...form.getFieldsValue(), production_stages_draft: stages };
                      form.setFieldValue('production_stages_draft', stages);
                      setFormData(next);
                    }}
                    showWageSummary={module.id === 'production_orders'}
                  />
                </div>
              )}

              {/* Blocks */}
              {sortedBlocks.map(block => {
                if (block.visibleIf && !checkVisibility(block.visibleIf, currentValues)) return null;
                if (canViewField(String(block.id)) === false) return null;
                if (module.id === 'products' && block.id === 'product_stock_movements') return null;
                if (module.id === 'products' && block.id === 'product_inventory' && !!recordId) return null;
                if (module.id === 'shelves' && block.id === 'shelf_stock_movements') return null;
                if (module.id === 'tasks' && block.id === 'task_shelf_stock_movements') return null;

                if (module.id === 'production_orders' && !recordId && block.type === BlockType.GRID_TABLE) {
                  return null;
                }

                if (block.type === BlockType.FIELD_GROUP || block.type === BlockType.DEFAULT) {
                  const blockFields = module.fields
                    .filter(f => f.blockId === block.id)
                    .filter(f => f.nature !== 'system') // 👈 این خط اضافه شد: حذف کامل فیلدهای سیستمی از گرید
                    .filter(f => canViewField(f.key))
                    .filter(f => f.key !== 'assignee_id' && f.key !== 'assignee_type')
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                  return (
                    <div key={block.id} className="mb-6 animate-slideUp">
                      <Divider orientation="left" className="!border-leather-200 !text-leather-600 !font-bold !text-sm">
                        {block.icon && <i className={`mr-2 ${block.icon}`}></i>}
                        {block.titles.fa}
                      </Divider>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {blockFields.map(field => {
                          if (field.logic && !checkVisibility(field.logic, currentValues)) return null;
                           let fieldValue = formData[field.key];
                           let isReadOnly = false;
                           // فیلدهای خلاصه اگر محاسبه شده باشند
                           if (currentSummaryData && summaryConfigObj?.calculationType === SummaryCalculationType.INVOICE_FINANCIALS) {                               // لاجیک نمایشی فیلدهای خلاصه
                           }
                           let options = field.options;
                           if (field.dynamicOptionsCategory) options = dynamicOptions[field.dynamicOptionsCategory];
                           if (field.type === FieldType.RELATION) options = relationOptions[field.key];
                           return (
                             <SmartFieldRenderer 
                               key={field.key}
                               field={field}
                               value={fieldValue}
                               recordId={recordId}
                               onChange={(val) => {
                                 if (!isReadOnly) { form.setFieldValue(field.key, val); setFormData({ ...form.getFieldsValue(), [field.key]: val }); }
                               }}
                               forceEditMode={true} options={options}
                               moduleId={module.id}
                               allValues={formData}
                             />
                           );
                        })}
                      </div>
                      {block.tableColumns && (
                        <div className="mt-6">
                          {module.id === 'products' && block.id === 'product_inventory' ? (
                            <SmartTableRenderer
                              moduleConfig={{
                                id: `${module.id}_${block.id}_readonly`,
                                fields: (block.tableColumns || []).map((col: any, idx: number) => ({
                                  key: col.key,
                                  labels: { fa: col.title, en: col.key },
                                  type: col.type,
                                  options: col.options,
                                  relationConfig: col.relationConfig,
                                  dynamicOptionsCategory: col.dynamicOptionsCategory,
                                  isTableColumn: true,
                                  order: idx + 1,
                                })),
                              } as any}
                              data={(Array.isArray(formData[block.id]) ? formData[block.id] : []).map((row: any, idx: number) => ({
                                id: row?.id || row?.key || `${block.id}_${idx}`,
                                ...row,
                              }))}
                              loading={false}
                              relationOptions={relationOptions}
                              dynamicOptions={dynamicOptions}
                              pagination={false}
                              disableScroll={false}
                              tableLayout="auto"
                            />
                          ) : (
                            <Form.Item name={block.id} noStyle>
                              <EditableTable
                                block={block}
                                initialData={formData[block.id] || []}
                                mode="local"
                                moduleId={module.id}
                                relationOptions={relationOptions}
                                dynamicOptions={dynamicOptions}
                                canEditModule={canEditModule}
                                canViewField={(fieldKey) =>
                                  canViewField(`${block.id}.${fieldKey}`) && canViewField(fieldKey)
                                }
                                readOnly={module.id === 'products' && block.id === 'product_inventory' && !!recordId}
                                onChange={(newData: any[]) => {
                                  const newFormData = { ...formData, [block.id]: newData };
                                  setFormData(newFormData);
                                  form.setFieldValue(block.id, newData);
                                }}
                              />
                            </Form.Item>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                if (block.type === BlockType.GRID_TABLE) {
                  return (
                    <div key={block.id} className="mb-6 p-1 border border-dashed border-gray-300 rounded-3xl">
                      <Form.Item name={block.id} noStyle>
                        <GridTable
                          block={block}
                          initialData={formData[block.id] || []}
                          mode="local"
                          moduleId={module.id}
                          relationOptions={relationOptions}
                          dynamicOptions={dynamicOptions}
                          canEditModule={canEditModule}
                          canViewField={(fieldKey) =>
                            canViewField(`${block.id}.${fieldKey}`) && canViewField(fieldKey)
                          }
                          onChange={(newData: any[]) => {
                            const newFormData = { ...formData, [block.id]: newData };
                            setFormData(newFormData);
                            form.setFieldValue(block.id, newData);
                          }}
                        />
                      </Form.Item>
                    </div>
                  );
                }

                if (block.type === BlockType.TABLE) {
                      return (
                        <div key={block.id} className="mb-6 p-1 border border-dashed border-gray-300 rounded-3xl">
                            <Form.Item name={block.id} noStyle>
                                <EditableTable
                                    block={block}
                                    initialData={formData[block.id] || []}
                                    mode="local"
                                    moduleId={module.id}
                                    relationOptions={relationOptions}
                                    dynamicOptions={dynamicOptions}
                                  canEditModule={canEditModule}
                                  canViewField={(fieldKey) =>
                                    canViewField(`${block.id}.${fieldKey}`) && canViewField(fieldKey)
                                  }
                                    onChange={(newData: any[]) => {
                                        const newFormData = { ...formData, [block.id]: newData };
                                        setFormData(newFormData);
                                        form.setFieldValue(block.id, newData);
                                    }}
                                />
                            </Form.Item>
                        </div>
                      );
                  }

                return null;
              })}

              {/* --- نمایش فوتر هوشمند --- */}
              {currentSummaryData && summaryConfigObj?.calculationType === SummaryCalculationType.INVOICE_FINANCIALS && (
                  <SummaryCard 
                    type={summaryConfigObj?.calculationType || SummaryCalculationType.SUM_ALL_ROWS} 
                    data={currentSummaryData} 
                  />
              )}
            </Form>
          )}
        </div>

        <div className="p-3 md:p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e1e] flex justify-end gap-2">
          <Button size="middle" onClick={onCancel} className="rounded-xl">انصراف</Button>
          <Button size="middle" type="primary" onClick={() => form.submit()} loading={loading} disabled={!canEditModule} icon={<SaveOutlined />} className="rounded-xl bg-leather-600 hover:!bg-leather-500 shadow-lg shadow-leather-500/20">
            {recordId ? 'ذخیره تغییرات' : 'ثبت نهایی'}
          </Button>
        </div>

      </div>
    </div>
  );
};

export default SmartForm;
