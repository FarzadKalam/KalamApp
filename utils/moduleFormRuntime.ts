export type RelationOptionLike = {
  value?: string | null;
  module?: string | null;
};

const getSelectedRelationModule = (value: any, options: RelationOptionLike[]) => {
  const selectedId = String(value || '').trim();
  if (!selectedId) return { selectedId: '', selectedModule: '' };
  const selectedOption = (options || []).find((option) => String(option?.value || '').trim() === selectedId);
  return {
    selectedId,
    selectedModule: String(selectedOption?.module || '').trim(),
  };
};

const inferSelectedAccountModule = (
  selectedId: string,
  values: Record<string, any>,
  prefix?: 'payment' | 'receipt',
) => {
  if (!selectedId) return '';
  if (prefix) {
    if (String(values?.[`${prefix}_bank_account_id`] || '').trim() === selectedId) return 'bank_accounts';
    if (String(values?.[`${prefix}_cash_box_id`] || '').trim() === selectedId) return 'cash_boxes';
    if (String(values?.[`${prefix}_petty_fund_id`] || '').trim() === selectedId) return 'petty_funds';
  }
  if (String(values?.bank_account_id || '').trim() === selectedId) return 'bank_accounts';
  if (String(values?.cash_box_id || '').trim() === selectedId) return 'cash_boxes';
  if (String(values?.petty_fund_id || '').trim() === selectedId) return 'petty_funds';
  return '';
};

const getTransferAccountPatch = (
  fieldKey: 'payment_account_id' | 'receipt_account_id',
  value: any,
  options: RelationOptionLike[],
  values: Record<string, any> = {}
) => {
  const { selectedId, selectedModule } = getSelectedRelationModule(value, options);
  const prefix = fieldKey === 'payment_account_id' ? 'payment' : 'receipt';
  const resolvedModule = selectedModule || inferSelectedAccountModule(selectedId, values, prefix);
  return {
    [`${prefix}_bank_account_id`]: resolvedModule === 'bank_accounts' && selectedId ? selectedId : null,
    [`${prefix}_cash_box_id`]: resolvedModule === 'cash_boxes' && selectedId ? selectedId : null,
    [`${prefix}_petty_fund_id`]: resolvedModule === 'petty_funds' && selectedId ? selectedId : null,
  } as Record<string, string | null>;
};

export const normalizeModuleFormValues = (
  moduleId: string,
  rawValues: Record<string, any> | null | undefined
) => {
  const values = { ...(rawValues || {}) };

  if (moduleId === 'cash_bank_operations') {
    const operationType = String(values.operation_type || '').trim();
    const treasuryAccountId = values.bank_account_id || values.cash_box_id || values.petty_fund_id || null;
    const paymentTransferAccountId = values.payment_bank_account_id || values.payment_cash_box_id || values.payment_petty_fund_id || null;
    const receiptTransferAccountId = values.receipt_bank_account_id || values.receipt_cash_box_id || values.receipt_petty_fund_id || null;
    const paymentAccountId = paymentTransferAccountId || (operationType === 'payment' ? treasuryAccountId : null);
    const receiptAccountId = receiptTransferAccountId || (operationType === 'receipt' ? treasuryAccountId : null);
    const assigneeId = values.assignee_id || values.employee_id || null;
    const assigneeType = values.assignee_type || (values.assignee_role_id ? 'role' : assigneeId ? 'user' : null);
    const imageUrl = values.image_url || values.attachment_url || null;
    return {
      ...values,
      image_url: imageUrl,
      attachment_url: values.attachment_url || imageUrl,
      assignee_id: assigneeType === 'role' ? null : assigneeId,
      assignee_type: assigneeType,
      assignee_role_id: assigneeType === 'role' ? (values.assignee_role_id || assigneeId || null) : (values.assignee_role_id || null),
      bank_account_id: treasuryAccountId,
      payment_account_id: paymentAccountId,
      receipt_account_id: receiptAccountId,
    };
  }

  if (moduleId === 'leave_requests') {
    return {
      ...values,
      status: values.status || 'pending',
      leave_type: values.leave_type || 'daily',
      total_days: Number(values.total_days || 0),
      total_minutes: Number(values.total_minutes || 0),
    };
  }

  if (moduleId === 'overtime_requests') {
    return {
      ...values,
      status: values.status || 'pending',
      total_minutes: Number(values.total_minutes || 0),
    };
  }

  if (moduleId === 'mission_requests') {
    return {
      ...values,
      status: values.status || 'pending',
    };
  }

  if (moduleId === 'employee_bonus_requests' || moduleId === 'employee_penalty_requests') {
    return {
      ...values,
      status: values.status || 'pending',
      amount: Number(values.amount || 0),
    };
  }

  return values;
};

export const buildModuleOnChangePatch = (
  moduleId: string,
  allValues: Record<string, any>,
  relationOptions: Record<string, RelationOptionLike[]> = {}
) => {
  if (moduleId === 'overtime_requests' && allValues.start_time && allValues.end_time) {
    const [sh, sm] = String(allValues.start_time).split(':').map(Number);
    const [eh, em] = String(allValues.end_time).split(':').map(Number);
    if (![sh, sm, eh, em].some(Number.isNaN)) {
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff >= 0 && diff !== Number(allValues.total_minutes || 0)) {
        return { total_minutes: diff };
      }
    }
  }

  if (
    moduleId === 'leave_requests'
    && allValues.start_date
    && allValues.end_date
    && String(allValues.leave_type || '') !== 'hourly'
  ) {
    const start = new Date(`${allValues.start_date}T12:00:00`);
    const end = new Date(`${allValues.end_date}T12:00:00`);
    const diff = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (diff > 0 && diff !== Number(allValues.total_days || 0)) {
      return { total_days: diff };
    }
  }

  if (moduleId === 'cash_bank_operations') {
    const operationType = String(allValues.operation_type || '').trim();
    const paymentType = String(allValues.payment_type || '').trim();
    const patch: Record<string, any> = {};

    if (paymentType !== 'cheque' && allValues.cheque_id) patch.cheque_id = null;
    if (paymentType !== 'barter' && allValues.barter_id) patch.barter_id = null;

    if (operationType === 'transfer') {
      [
        'bank_account_id',
        'cash_box_id',
        'petty_fund_id',
        'sales_invoice_id',
        'purchase_invoice_id',
        'expense_document_id',
        'employee_advance_id',
        'payroll_slip_id',
        'customer_id',
        'supplier_id',
        'cheque_id',
        'barter_id',
      ].forEach((key) => {
        if (allValues[key]) patch[key] = null;
      });
    } else {
      const sourceFieldKey = operationType === 'receipt' ? 'receipt_account_id' : 'payment_account_id';
      const hiddenFieldKey = sourceFieldKey === 'receipt_account_id' ? 'payment_account_id' : 'receipt_account_id';
      if (allValues[hiddenFieldKey]) {
        patch[hiddenFieldKey] = null;
      }
      const selectedTreasury = getSelectedRelationModule(allValues[sourceFieldKey], relationOptions[sourceFieldKey] || []);
      if (selectedTreasury.selectedModule === 'cash_boxes' && allValues.cash_box_id !== selectedTreasury.selectedId) {
        patch.cash_box_id = selectedTreasury.selectedId;
      }
      if (selectedTreasury.selectedModule !== 'cash_boxes' && allValues.cash_box_id) {
        patch.cash_box_id = null;
      }
    }

    return Object.keys(patch).length ? patch : null;
  }

  return null;
};

export const transformModulePayloadForSave = (
  moduleId: string,
  rawPayload: Record<string, any>,
  relationOptions: Record<string, RelationOptionLike[]> = {}
) => {
  if (moduleId !== 'cash_bank_operations') {
    return rawPayload;
  }

  const payload = { ...(rawPayload || {}) };
  const operationType = String(payload.operation_type || '').trim();
  const assigneeType = String(
    payload.assignee_type
    || (payload.assignee_role_id ? 'role' : (payload.assignee_id ? 'user' : ''))
  ).trim() || null;
  const assigneeId = String(payload.assignee_id || '').trim() || null;
  const assigneeRoleId = String(payload.assignee_role_id || '').trim() || null;
  const employeeId = String(payload.employee_id || '').trim() || null;
  const imageUrl = String(payload.image_url || payload.attachment_url || '').trim() || null;

  if (operationType === 'transfer') {
    Object.assign(
      payload,
      getTransferAccountPatch('payment_account_id', payload.payment_account_id, relationOptions.payment_account_id || [], payload),
      getTransferAccountPatch('receipt_account_id', payload.receipt_account_id, relationOptions.receipt_account_id || [], payload)
    );
    payload.bank_account_id = null;
    payload.cash_box_id = null;
    payload.petty_fund_id = null;
    payload.sales_invoice_id = null;
    payload.purchase_invoice_id = null;
    payload.expense_document_id = null;
    payload.employee_advance_id = null;
    payload.payroll_slip_id = null;
    payload.customer_id = null;
    payload.supplier_id = null;
    payload.cheque_id = null;
    payload.barter_id = null;
  } else {
    const sourceFieldKey = operationType === 'receipt' ? 'receipt_account_id' : 'payment_account_id';
    const sourceValue = payload[sourceFieldKey];
    const { selectedId, selectedModule } = getSelectedRelationModule(sourceValue, relationOptions[sourceFieldKey] || []);
    const prefix = operationType === 'receipt' ? 'receipt' : 'payment';
    const resolvedModule = selectedModule || inferSelectedAccountModule(selectedId, payload, prefix);
    payload.bank_account_id = null;
    payload.cash_box_id = null;
    payload.petty_fund_id = null;
    payload.payment_bank_account_id = operationType === 'payment' && resolvedModule === 'bank_accounts' && selectedId ? selectedId : null;
    payload.payment_cash_box_id = operationType === 'payment' && resolvedModule === 'cash_boxes' && selectedId ? selectedId : null;
    payload.payment_petty_fund_id = operationType === 'payment' && resolvedModule === 'petty_funds' && selectedId ? selectedId : null;
    payload.receipt_bank_account_id = operationType === 'receipt' && resolvedModule === 'bank_accounts' && selectedId ? selectedId : null;
    payload.receipt_cash_box_id = operationType === 'receipt' && resolvedModule === 'cash_boxes' && selectedId ? selectedId : null;
    payload.receipt_petty_fund_id = operationType === 'receipt' && resolvedModule === 'petty_funds' && selectedId ? selectedId : null;
  }

  payload.image_url = imageUrl;
  payload.attachment_url = String(payload.attachment_url || imageUrl || '').trim() || null;
  payload.assignee_type = assigneeType;
  payload.assignee_role_id = assigneeType === 'role' ? assigneeRoleId : null;
  payload.assignee_id = assigneeType === 'role' ? null : assigneeId;
  payload.employee_id = employeeId;

  delete payload.payment_account_id;
  delete payload.receipt_account_id;
  return payload;
};

export const validateModuleFormValues = (
  moduleId: string,
  rawValues: Record<string, any>,
  relationOptions: Record<string, RelationOptionLike[]> = {}
) => {
  if (moduleId !== 'cash_bank_operations') {
    return null;
  }

  const values = rawValues || {};
  const operationType = String(values.operation_type || '').trim();
  if (operationType === 'receipt') {
    const receiptAccountId = String(values.receipt_account_id || '').trim();
    if (!receiptAccountId) {
      return 'برای دریافت، انتخاب حساب دریافت الزامی است.';
    }
    return null;
  }

  if (operationType === 'payment') {
    const paymentAccountId = String(values.payment_account_id || '').trim();
    if (!paymentAccountId) {
      return 'برای پرداخت، انتخاب حساب پرداخت الزامی است.';
    }
    return null;
  }

  if (operationType !== 'transfer') {
    return null;
  }

  const paymentAccountId = String(values.payment_account_id || '').trim();
  const receiptAccountId = String(values.receipt_account_id || '').trim();
  if (!paymentAccountId || !receiptAccountId) {
    return 'برای انتقال، انتخاب حساب پرداخت و حساب دریافت الزامی است.';
  }

  const paymentOption = (relationOptions.payment_account_id || []).find(
    (option) => String(option?.value || '').trim() === paymentAccountId,
  );
  const receiptOption = (relationOptions.receipt_account_id || []).find(
    (option) => String(option?.value || '').trim() === receiptAccountId,
  );
  const paymentModule = String(paymentOption?.module || '').trim();
  const receiptModule = String(receiptOption?.module || '').trim();

  if (paymentAccountId === receiptAccountId && paymentModule === receiptModule) {
    return 'حساب پرداخت و حساب دریافت نمی‌توانند یکسان باشند.';
  }

  return null;
};
