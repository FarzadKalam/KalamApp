import { FieldLocation, FieldNature, FieldType, ModuleNature, ViewMode, type ModuleDefinition } from '../types';
import { installationStatuses, LOCAL_INSTALLATIONS_MODULE } from '../utils/localInstallations';

export const saasLocalInstallationsConfig: ModuleDefinition = {
  id: LOCAL_INSTALLATIONS_MODULE, table: 'saas_local_installations', systemManaged: true,
  titles: { fa: 'نصب‌های اختصاصی', faSingular: 'نصب اختصاصی', en: 'Dedicated installations' },
  nature: ModuleNature.CRM, iconKey: 'cloud_server', disableDelete: true, disableInlineFieldEditing: true,
  supportedViewModes: [ViewMode.LIST], defaultViewMode: ViewMode.LIST,
  registryVisibility: { globalSearch: false, moduleSettings: false, reports: false, workflows: false },
  blocks: [], fields: [
    { key: 'title', labels: { fa: 'عنوان نصب' }, type: FieldType.TEXT, location: FieldLocation.HEADER, nature: FieldNature.STANDARD, isKey: true, isTableColumn: true },
    { key: 'system_code', labels: { fa: 'کد نصب' }, type: FieldType.TEXT, location: FieldLocation.HEADER, nature: FieldNature.SYSTEM, readonly: true, isTableColumn: true },
    { key: 'customer_name', labels: { fa: 'مشتری' }, type: FieldType.TEXT, location: FieldLocation.HEADER, nature: FieldNature.SYSTEM, readonly: true, isTableColumn: true },
    { key: 'status', labels: { fa: 'وضعیت نصب' }, type: FieldType.STATUS, location: FieldLocation.HEADER, nature: FieldNature.SYSTEM, readonly: true, isTableColumn: true,
      options: Object.entries(installationStatuses).map(([value, label]) => ({ value, label })) },
    { key: 'public_url', labels: { fa: 'نشانی نصب' }, type: FieldType.TEXT, location: FieldLocation.HEADER, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'created_at', labels: { fa: 'تاریخ ایجاد' }, type: FieldType.DATETIME, location: FieldLocation.HEADER, nature: FieldNature.SYSTEM, readonly: true, isTableColumn: true },
  ],
};
