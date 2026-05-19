import React, { useMemo, useState } from 'react';
import { App } from 'antd';
import SmartForm from '../SmartForm';
import RecordFilesManager from '../RecordFilesManager';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { buildInstructionModuleConfig, buildInstructionModuleOptions, INSTRUCTIONS_MODULE_ID } from '../../utils/instructionSupport';
import { getCachedAuthUser } from '../../utils/sessionCache';
import { buildClientFallbackSystemCode } from '../../utils/systemCode';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type InstructionQuickCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (record: Record<string, any>) => void | Promise<void>;
  initialValues?: Record<string, any>;
  userOptions?: Array<{ label: string; value: string }>;
  roleOptions?: Array<{ label: string; value: string }>;
  overlayZIndex?: number;
};

const InstructionQuickCreateModal: React.FC<InstructionQuickCreateModalProps> = ({
  open,
  onClose,
  onCreated,
  initialValues,
  userOptions = [],
  roleOptions = [],
  overlayZIndex,
}) => {
  const { message } = App.useApp();
  const [filesTarget, setFilesTarget] = useState<Record<string, any> | null>(null);

  const moduleConfig = useMemo(() => {
    const baseModule = MODULES[INSTRUCTIONS_MODULE_ID];
    return baseModule
      ? buildInstructionModuleConfig(baseModule, {
        moduleOptions: buildInstructionModuleOptions(),
        userOptions,
        roleOptions,
      })
      : null;
  }, [roleOptions, userOptions]);

  if (!moduleConfig) return null;

  return (
    <>
      <SmartForm
        module={moduleConfig}
        visible={open}
        title="افزودن سریع دستورالعمل"
        overlayZIndex={overlayZIndex}
        initialValues={{
          status: 'draft',
          ...(initialValues || {}),
        }}
        onCancel={onClose}
        onSave={async (values) => {
          const authUser = await getCachedAuthUser(supabase);
          const userId = authUser?.id || null;
          const payload = {
            ...values,
            visible_to_user_ids: Array.isArray(values?.visible_to_user_ids) ? values.visible_to_user_ids : [],
            visible_to_role_ids: Array.isArray(values?.visible_to_role_ids) ? values.visible_to_role_ids : [],
            module_ids: Array.isArray(values?.module_ids) ? values.module_ids : [],
            created_by: userId,
            updated_by: userId,
          };
          if (!payload.system_code) {
            payload.system_code = await buildClientFallbackSystemCode(supabase, INSTRUCTIONS_MODULE_ID, moduleConfig.table);
          }

          const { data, error } = await supabase
            .from(moduleConfig.table)
            .insert(payload)
            .select('*')
            .single();
          if (error) throw error;

          setFilesTarget(data || null);
          await onCreated?.(data || {});
          message.success('دستورالعمل ایجاد شد. در صورت نیاز فایل‌ها را هم اضافه کنید.');
          onClose();
        }}
      />

      <RecordFilesManager
        open={!!filesTarget}
        onClose={() => setFilesTarget(null)}
        moduleId={INSTRUCTIONS_MODULE_ID}
        recordId={String(filesTarget?.id || '')}
        mainImage={filesTarget?.image_url || null}
        onMainImageChange={async (imageUrl) => {
          if (!filesTarget?.id) return;
          const { error } = await supabase
            .from(moduleConfig.table)
            .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
            .eq('id', filesTarget.id);
          if (error) {
            message.error(toFaErrorMessage(error, 'بروزرسانی تصویر دستورالعمل ناموفق بود.'));
            return;
          }
          setFilesTarget((prev) => (prev ? { ...prev, image_url: imageUrl } : prev));
        }}
        canEdit
        canDelete
      />
    </>
  );
};

export default InstructionQuickCreateModal;
