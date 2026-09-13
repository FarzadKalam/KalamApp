import { useEffect, useMemo, useState } from "react";
import { App, Button, Card, Empty, Form, Spin, Switch } from "antd";
import { DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import SmartFieldRenderer from "../../components/SmartFieldRenderer";
import PersianDatePicker from "../../components/PersianDatePicker";
import { FieldLocation, FieldNature, FieldType } from "../../types";
import { supabase } from "../../supabaseClient";
import { toFaErrorMessage } from "../../utils/errorMessageFa";
import { CASH_BANK_PAYMENT_TYPE_OPTIONS } from "../../utils/cashBankFieldCatalog";

type Shift = { id: string; start: string; end: string };
type DaySchedule = { enabled: boolean; shifts: Shift[] };
type DateException = {
  id: string;
  date: string;
  closed: boolean;
  shifts: Shift[];
};
const DAYS = [
  ["sat", "شنبه"],
  ["sun", "یکشنبه"],
  ["mon", "دوشنبه"],
  ["tue", "سه‌شنبه"],
  ["wed", "چهارشنبه"],
  ["thu", "پنجشنبه"],
  ["fri", "جمعه"],
] as const;
const emptyWeek = (): Record<string, DaySchedule> =>
  Object.fromEntries(
    DAYS.map(([key]) => [
      key,
      {
        enabled: key !== "fri",
        shifts:
          key === "fri"
            ? []
            : [{ id: crypto.randomUUID(), start: "09:00", end: "17:00" }],
      },
    ]),
  );
const makeField = (
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
const BASE_FIELDS = [
  makeField("slot_minutes", "فاصله زمانی هر نوبت (دقیقه)", FieldType.NUMBER, {
    defaultValue: 30,
  }),
  makeField("default_deposit_mode", "روش پیش‌فرض بیعانه", FieldType.SELECT, {
    defaultValue: "none",
    options: [
      { label: "بدون بیعانه", value: "none" },
      { label: "مبلغ ثابت", value: "fixed" },
      { label: "درصدی از خدمات", value: "percent" },
    ],
  }),
  makeField("default_deposit_value", "مقدار پیش‌فرض بیعانه", FieldType.PRICE, {
    defaultValue: 0,
  }),
  makeField(
    "default_payment_account_id",
    "حساب پیش‌فرض بیعانه",
    FieldType.RELATION,
    {
      relationConfig: {
        targetModule: "chart_of_accounts",
        targetField: "name",
      },
    },
  ),
  makeField(
    "default_payment_type",
    "روش پیش‌فرض دریافت بیعانه",
    FieldType.SELECT,
    { defaultValue: "cash", options: [...CASH_BANK_PAYMENT_TYPE_OPTIONS] },
  ),
  makeField(
    "allow_overbooking",
    "اجازه رزرو بیش از ظرفیت",
    FieldType.CHECKBOX,
    { defaultValue: false },
  ),
  makeField(
    "allow_official_holidays",
    "امکان رزرو در تعطیلات رسمی",
    FieldType.CHECKBOX,
    { defaultValue: false },
  ),
];

export default function ReservationSettingsTab() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState("");
  const [week, setWeek] = useState<Record<string, DaySchedule>>(emptyWeek);
  const [exceptions, setExceptions] = useState<DateException[]>([]);
  const values = Form.useWatch([], form) || {};
  const normalizedWeek = useMemo(
    () =>
      Object.fromEntries(
        DAYS.map(([key]) => [key, week[key] || { enabled: false, shifts: [] }]),
      ),
    [week],
  );

  useEffect(() => {
    void supabase
      .from("company_settings")
      .select("id,reservation_settings")
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) message.error(toFaErrorMessage(error));
        const settings = data?.reservation_settings || {};
        setSettingsId(String(data?.id || ""));
        form.setFieldsValue(settings);
        if (settings.weekly_schedule)
          setWeek({ ...emptyWeek(), ...settings.weekly_schedule });
        if (Array.isArray(settings.date_exceptions))
          setExceptions(settings.date_exceptions);
        setLoading(false);
      });
  }, [form, message]);
  const patchDay = (day: string, patch: Partial<DaySchedule>) =>
    setWeek((current) => ({
      ...current,
      [day]: { ...current[day], ...patch },
    }));
  const patchShift = (day: string, id: string, patch: Partial<Shift>) =>
    patchDay(day, {
      shifts: (week[day]?.shifts || []).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  const save = async () => {
    setSaving(true);
    try {
      const base = await form.validateFields();
      for (const [day, schedule] of Object.entries(normalizedWeek))
        for (const shift of schedule.shifts)
          if (
            schedule.enabled &&
            (!shift.start || !shift.end || shift.start >= shift.end)
          )
            throw new Error(
              `بازهٔ ساعت ${DAYS.find(([key]) => key === day)?.[1]} معتبر نیست.`,
            );
      for (const exception of exceptions) {
        if (!exception.date) throw new Error("تاریخ استثنا را مشخص کنید.");
        for (const shift of exception.shifts)
          if (
            !exception.closed &&
            (!shift.start || !shift.end || shift.start >= shift.end)
          )
            throw new Error("یکی از شیفت‌های تاریخ استثنا معتبر نیست.");
      }
      if (!settingsId) throw new Error("رکورد تنظیمات سازمان یافت نشد.");
      const { error } = await supabase
        .from("company_settings")
        .update({
          reservation_settings: {
            ...base,
            weekly_schedule: normalizedWeek,
            date_exceptions: exceptions,
          },
        })
        .eq("id", settingsId);
      if (error) throw error;
      message.success("تنظیمات رزرواسیون ذخیره شد.");
    } catch (error) {
      message.error(toFaErrorMessage(error, "ذخیره تنظیمات ناموفق بود."));
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return (
      <div className="p-10 text-center">
        <Spin />
      </div>
    );
  return (
    <div className="max-w-5xl space-y-4">
      <Card title="قواعد عمومی">
        <Form form={form} layout="vertical">
          <div className="grid gap-4 md:grid-cols-2">
            {BASE_FIELDS.map((item: any) => (
              <Form.Item key={item.key} name={item.key}>
                <SmartFieldRenderer
                  field={item}
                  value={values[item.key]}
                  onChange={(value) => form.setFieldValue(item.key, value)}
                  allValues={values}
                  moduleId="reservations"
                  standalone
                  forceEditMode
                />
              </Form.Item>
            ))}
          </div>
        </Form>
      </Card>
      <Card title="ساعات فعالیت هفتگی">
        <div className="space-y-3">
          {DAYS.map(([day, label]) => {
            const schedule = normalizedWeek[day];
            return (
              <div
                key={day}
                className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5"
              >
                <div className="mb-3 flex items-center gap-3">
                  <Switch
                    checked={schedule.enabled}
                    onChange={(enabled) => patchDay(day, { enabled })}
                  />
                  <b>{label}</b>
                  <Button
                    className="mr-auto"
                    type="text"
                    size="small"
                    icon={<PlusOutlined />}
                    disabled={!schedule.enabled}
                    onClick={() =>
                      patchDay(day, {
                        shifts: [
                          ...schedule.shifts,
                          {
                            id: crypto.randomUUID(),
                            start: "09:00",
                            end: "17:00",
                          },
                        ],
                      })
                    }
                  >
                    افزودن شیفت
                  </Button>
                </div>
                {schedule.enabled ? (
                  <div className="space-y-2">
                    {schedule.shifts.length ? (
                      schedule.shifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="grid items-end gap-2 md:grid-cols-[1fr_1fr_auto]"
                        >
                          <SmartFieldRenderer
                            field={makeField(
                              "start",
                              "شروع شیفت",
                              FieldType.TIME,
                            )}
                            value={shift.start}
                            onChange={(start) =>
                              patchShift(day, shift.id, { start })
                            }
                            allValues={shift}
                            moduleId="reservations"
                            standalone
                            forceEditMode
                          />
                          <SmartFieldRenderer
                            field={makeField(
                              "end",
                              "پایان شیفت",
                              FieldType.TIME,
                            )}
                            value={shift.end}
                            onChange={(end) =>
                              patchShift(day, shift.id, { end })
                            }
                            allValues={shift}
                            moduleId="reservations"
                            standalone
                            forceEditMode
                          />
                          <Button
                            danger
                            type="text"
                            icon={<DeleteOutlined />}
                            onClick={() =>
                              patchDay(day, {
                                shifts: schedule.shifts.filter(
                                  (item) => item.id !== shift.id,
                                ),
                              })
                            }
                          >
                            حذف
                          </Button>
                        </div>
                      ))
                    ) : (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="شیفتی تعریف نشده است"
                      />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
      <Card
        title="استثناهای تقویم"
        extra={
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setExceptions((current) => [
                ...current,
                { id: crypto.randomUUID(), date: "", closed: true, shifts: [] },
              ])
            }
          >
            افزودن تاریخ
          </Button>
        }
      >
        {exceptions.length ? (
          <div className="space-y-3">
            {exceptions.map((exception) => (
              <div
                key={exception.id}
                className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5"
              >
                <div className="grid items-end gap-3 md:grid-cols-[220px_1fr_auto]">
                  <div>
                    <div className="mb-1 text-xs font-bold">تاریخ</div>
                    <PersianDatePicker
                      type="DATE"
                      value={exception.date}
                      onChange={(date) =>
                        setExceptions((current) =>
                          current.map((item) =>
                            item.id === exception.id
                              ? { ...item, date: date || "" }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <Switch
                      checked={exception.closed}
                      onChange={(closed) =>
                        setExceptions((current) =>
                          current.map((item) =>
                            item.id === exception.id
                              ? { ...item, closed }
                              : item,
                          ),
                        )
                      }
                    />
                    <span>کل روز بسته باشد</span>
                    {!exception.closed ? (
                      <Button
                        size="small"
                        type="text"
                        icon={<PlusOutlined />}
                        onClick={() =>
                          setExceptions((current) =>
                            current.map((item) =>
                              item.id === exception.id
                                ? {
                                    ...item,
                                    shifts: [
                                      ...item.shifts,
                                      {
                                        id: crypto.randomUUID(),
                                        start: "09:00",
                                        end: "17:00",
                                      },
                                    ],
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        افزودن شیفت ویژه
                      </Button>
                    ) : null}
                  </div>
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() =>
                      setExceptions((current) =>
                        current.filter((item) => item.id !== exception.id),
                      )
                    }
                  >
                    حذف
                  </Button>
                </div>
                {!exception.closed ? (
                  <div className="mt-3 space-y-2">
                    {exception.shifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="grid items-end gap-2 md:grid-cols-[1fr_1fr_auto]"
                      >
                        <SmartFieldRenderer
                          field={makeField(
                            "start",
                            "شروع شیفت",
                            FieldType.TIME,
                          )}
                          value={shift.start}
                          onChange={(start) =>
                            setExceptions((current) =>
                              current.map((item) =>
                                item.id === exception.id
                                  ? {
                                      ...item,
                                      shifts: item.shifts.map((row) =>
                                        row.id === shift.id
                                          ? { ...row, start }
                                          : row,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                          allValues={shift}
                          moduleId="reservations"
                          standalone
                          forceEditMode
                        />
                        <SmartFieldRenderer
                          field={makeField("end", "پایان شیفت", FieldType.TIME)}
                          value={shift.end}
                          onChange={(end) =>
                            setExceptions((current) =>
                              current.map((item) =>
                                item.id === exception.id
                                  ? {
                                      ...item,
                                      shifts: item.shifts.map((row) =>
                                        row.id === shift.id
                                          ? { ...row, end }
                                          : row,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                          allValues={shift}
                          moduleId="reservations"
                          standalone
                          forceEditMode
                        />
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={() =>
                            setExceptions((current) =>
                              current.map((item) =>
                                item.id === exception.id
                                  ? {
                                      ...item,
                                      shifts: item.shifts.filter(
                                        (row) => row.id !== shift.id,
                                      ),
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          حذف
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="استثنایی تعریف نشده است"
          />
        )}
      </Card>
      <Button
        type="primary"
        icon={<SaveOutlined />}
        loading={saving}
        onClick={() => void save()}
      >
        ذخیره تنظیمات رزرواسیون
      </Button>
    </div>
  );
}
