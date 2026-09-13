import { useEffect, useMemo, useState } from "react";
import { App, Modal, Spin } from "antd";
import SmartFieldRenderer from "../SmartFieldRenderer";
import { FieldLocation, FieldNature, FieldType } from "../../types";
import { supabase } from "../../supabaseClient";
import { CASH_BANK_PAYMENT_TYPE_OPTIONS } from "../../utils/cashBankFieldCatalog";
import { INVOICE_PAYMENT_ACCOUNT_RELATION_CONFIG } from "../../utils/invoiceAccountFieldConfig";
import { toFaErrorMessage } from "../../utils/errorMessageFa";

const field = (
  key: string,
  label: string,
  type: FieldType,
  extra: Record<string, unknown> = {},
) => ({
  key,
  labels: { fa: label },
  type,
  location: FieldLocation.BLOCK,
  nature: FieldNature.STANDARD,
  ...extra,
});

const FIELDS = [
  field(
    "default_create_mode",
    "فاکتور فروشگاهی حالت پیش‌فرض افزودن فاکتور باشد",
    FieldType.CHECKBOX,
  ),
  field("default_price_list_id", "لیست قیمت پیش‌فرض", FieldType.RELATION, {
    relationConfig: { targetModule: "price_lists", targetField: "name" },
  }),
  field(
    "default_receiving_account_id",
    "حساب دریافت پیش‌فرض",
    FieldType.RELATION,
    {
      relationConfig: INVOICE_PAYMENT_ACCOUNT_RELATION_CONFIG,
    },
  ),
  field(
    "default_payment_methods",
    "روش‌های دریافت پیش‌فرض (حداکثر دو مورد)",
    FieldType.MULTI_SELECT,
    {
      options: [...CASH_BANK_PAYMENT_TYPE_OPTIONS],
    },
  ),
];

const RetailInvoiceSettingsModal = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { message } = App.useApp();
  const [settingsId, setSettingsId] = useState("");
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void Promise.resolve(
      supabase
        .from("company_settings")
        .select("id,retail_invoice_settings")
        .limit(1)
        .maybeSingle(),
    )
      .then(({ data, error }) => {
        if (error) throw error;
        if (!active) return;
        setSettingsId(String(data?.id || ""));
        setValues(data?.retail_invoice_settings || {});
      })
      .catch((error) => {
        if (active)
          message.error(
            toFaErrorMessage(error, "دریافت تنظیمات فروشگاهی ناموفق بود."),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [message, open]);

  const normalizedValues = useMemo<Record<string, any>>(
    () => ({
      ...values,
      default_payment_methods: (Array.isArray(values.default_payment_methods)
        ? values.default_payment_methods
        : []
      ).slice(0, 2),
    }),
    [values],
  );

  const save = async () => {
    if (!settingsId) {
      message.error("رکورد تنظیمات سازمان یافت نشد.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("company_settings")
        .update({ retail_invoice_settings: normalizedValues })
        .eq("id", settingsId);
      if (error) throw error;
      message.success("تنظیمات فاکتور فروشگاهی ذخیره شد.");
      onClose();
    } catch (error) {
      message.error(
        toFaErrorMessage(error, "ذخیره تنظیمات فروشگاهی ناموفق بود."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => void save()}
      okText="ذخیره تنظیمات"
      cancelText="انصراف"
      confirmLoading={saving}
      title="تنظیمات فاکتور فروشگاهی"
      destroyOnHidden
    >
      {loading ? (
        <div className="py-10 text-center">
          <Spin />
        </div>
      ) : (
        <div className="space-y-4 pt-3">
          {FIELDS.map((item) => (
            <SmartFieldRenderer
              key={item.key}
              field={item as any}
              value={normalizedValues[item.key]}
              onChange={(value) =>
                setValues((current) => ({
                  ...current,
                  [item.key]:
                    item.key === "default_payment_methods" &&
                    Array.isArray(value)
                      ? value.slice(0, 2)
                      : value,
                }))
              }
              allValues={normalizedValues}
              moduleId="invoices"
              standalone
              forceEditMode
            />
          ))}
        </div>
      )}
    </Modal>
  );
};

export default RetailInvoiceSettingsModal;
