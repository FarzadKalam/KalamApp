import { useMemo } from 'react';
import { ModuleDefinition, ModuleField } from '../types';
import { buildConditionalFieldStateMap, evaluateLegacyVisibilityRule, getConditionalFieldClearValue, isConditionalFieldValueEmpty } from '../utils/conditionalFieldRules';
import { getResolvedModuleConditionalDisplay } from '../utils/moduleSettingsRuntime';

export const useConditionalFieldRuntime = (
  moduleDef: Pick<ModuleDefinition, 'id' | 'fields'> | null | undefined,
  values: Record<string, any>
) => {
  const settings = useMemo(
    () => getResolvedModuleConditionalDisplay(moduleDef?.id),
    [moduleDef?.id]
  );

  const stateMap = useMemo(
    () => buildConditionalFieldStateMap(moduleDef?.fields || [], values || {}, settings),
    [moduleDef?.fields, settings, values]
  );

  const isFieldVisible = (field?: ModuleField | null) => {
    if (!field?.key) return true;
    return stateMap[field.key]?.visible ?? evaluateLegacyVisibilityRule(field.logic, values || {});
  };

  const getFieldRequired = (field?: ModuleField | null) => {
    if (!field?.key) return false;
    return stateMap[field.key]?.required ?? (field.validation?.required === true);
  };

  const getRuntimeField = (field?: ModuleField | null) => {
    if (!field) return field;
    const required = getFieldRequired(field);
    return {
      ...field,
      validation: {
        ...(field.validation || {}),
        required,
      },
    };
  };

  const getDefaultPatchForReveal = (
    field: ModuleField | undefined,
    previousVisible: boolean,
    isCreate: boolean,
    currentValue: any
  ) => {
    if (!field?.key) return undefined;
    const state = stateMap[field.key];
    if (!state || state.defaultMode === 'inherit') return undefined;
    const becameVisible = state.visible && !previousVisible;
    if (!isCreate && !becameVisible) return undefined;
    if (!isConditionalFieldValueEmpty(currentValue)) return undefined;
    if (state.defaultMode === 'clear') return getConditionalFieldClearValue(field);
    return state.defaultValue;
  };

  return {
    settings,
    stateMap,
    isFieldVisible,
    getFieldRequired,
    getRuntimeField,
    getDefaultPatchForReveal,
  };
};
