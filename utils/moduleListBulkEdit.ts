export type ModuleListBulkEditOpenState = {
  shouldOpen: boolean;
  editRecordId: string | null;
  isBulkEditMode: boolean;
};

export const resolveModuleListBulkEditOpenState = (
  selectedRowKeys: Array<string | number>
): ModuleListBulkEditOpenState => {
  if (selectedRowKeys.length === 0) {
    return {
      shouldOpen: false,
      editRecordId: null,
      isBulkEditMode: false,
    };
  }

  if (selectedRowKeys.length === 1) {
    return {
      shouldOpen: true,
      editRecordId: String(selectedRowKeys[0]),
      isBulkEditMode: false,
    };
  }

  return {
    shouldOpen: true,
    editRecordId: null,
    isBulkEditMode: true,
  };
};
