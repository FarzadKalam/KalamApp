import { useState } from "react";
import { App, Button, Form, Input, Select } from "antd";
import { supabase } from "../supabaseClient";
import { runWorkflowsForEvent } from "../utils/workflowRuntime";

type InquiryFormValues = {
  prefix?: string;
  first_name: string;
  last_name: string;
  business_name?: string;
  phone: string;
  description?: string;
};

const PREFIX_OPTIONS = [
  { label: "آقای", value: "آقای" },
  { label: "خانم", value: "خانم" },
  { label: "دکتر", value: "دکتر" },
  { label: "مهندس", value: "مهندس" },
];

const InquiryForm = () => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<InquiryFormValues>();
  const { message } = App.useApp();

  const handleSubmit = async (values: InquiryFormValues) => {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        prefix: values.prefix || null,
        first_name: (values.first_name || "").trim(),
        last_name: (values.last_name || "").trim(),
        business_name: values.business_name || null,
        mobile_1: values.phone || null,
        lead_source: "scan",
        rank: "normal",
      };

      if (values.description) {
        payload.notes = values.description;
      }

      let insertedRecord: Record<string, any> | null = null;
      let { data: inserted, error } = await supabase
        .from("customers")
        .insert(payload)
        .select("*")
        .single();
      insertedRecord = inserted || null;

      if (error && error.code === "PGRST204") {
        const fallbackPayload = { ...payload } as Record<string, unknown>;
        const errText = String(error.message || "").toLowerCase();
        if (errText.includes("notes")) delete fallbackPayload.notes;
        if (errText.includes("lead_source")) delete fallbackPayload.lead_source;

        ({ data: inserted, error } = await supabase
          .from("customers")
          .insert(fallbackPayload)
          .select("*")
          .single());
        insertedRecord = inserted || null;

        if (error && error.code === "PGRST204") {
          const safePayload = { ...payload } as Record<string, unknown>;
          delete safePayload.notes;
          delete safePayload.lead_source;
          ({ data: inserted, error } = await supabase
            .from("customers")
            .insert(safePayload)
            .select("*")
            .single());
          insertedRecord = inserted || null;
        }
      }

      if (error) {
        throw error;
      }

      await runWorkflowsForEvent({
        moduleId: "customers",
        event: "create",
        currentRecord: insertedRecord || (payload as Record<string, any>),
      });

      message.success("درخواست شما ثبت شد.");
      form.resetFields();
    } catch (err: any) {
      console.error(err);
      message.error("ثبت درخواست ناموفق بود.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-neutral-50 to-stone-100 p-4 md:p-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-[28px] border border-amber-100/70 bg-white/95 shadow-[0_18px_50px_rgba(124,92,61,0.12)] backdrop-blur overflow-hidden">
          <div className="relative border-b border-amber-100/70 bg-gradient-to-br from-amber-50 via-white to-stone-50 px-6 py-8 md:px-10">
            <div
              className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(197,143,96,0.25),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(45,35,27,0.12),transparent_30%)]"
              aria-hidden="true"
            />

            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-100/70 px-3 py-1 text-[11px] font-semibold text-amber-900 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Mehrbanoo Leather Company
                </div>
                <div>
                  <div className="text-3xl md:text-4xl font-black text-amber-900 leading-tight">
                    تولیدی چرم مهربانو
                  </div>
                  <div className="mt-2 text-sm md:text-base text-stone-500">
                    استعلام، مشاوره و ثبت درخواست محصولات چرمی و هدایای تبلیغاتی
                  </div>
                </div>
              </div>

              <div className="w-full md:w-72 rounded-2xl bg-white/80 backdrop-blur border border-amber-100/70 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-amber-900">
                  <span className="font-semibold">راه‌های ارتباطی</span>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold">Online</span>
                </div>
                <div className="space-y-3 text-sm text-stone-700">
                  <a
                    href="https://mehrbaanoo.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 shadow-[0_8px_18px_rgba(197,143,96,0.12)] transition hover:-translate-y-[1px]"
                  >
                    <span className="h-8 w-8 rounded-xl bg-amber-600 text-white flex items-center justify-center text-[11px] font-black">W</span>
                    <div className="flex-1 overflow-hidden">
                      <div className="font-semibold text-amber-900">وب‌سایت مهربانو</div>
                      <div className="truncate text-[12px] text-amber-800/80">www.mehrbaanoo.com</div>
                    </div>
                    <span className="text-[11px] text-amber-800">مشاهده</span>
                  </a>
                  <a
                    href="https://www.instagram.com/marjanmohamadi1369/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 shadow-sm transition hover:-translate-y-[1px]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-400 text-white text-[11px] font-black">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9A4.5 4.5 0 0 1 16.5 21h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3Zm9 2h-9A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5Zm-4.5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm5.25-.75a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                        />
                      </svg>
                    </span>
                    <div className="flex-1 overflow-hidden">
                      <div className="font-semibold text-rose-800">اینستاگرام</div>
                      <div className="truncate text-[12px] text-rose-700/80">marjanmohamadi1369@</div>
                    </div>
                    <span className="text-[11px] text-rose-700">مشاهده</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-8 md:px-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-base md:text-lg font-bold text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              درخواست استعلام و مشاوره
            </div>

            <Form layout="vertical" onFinish={handleSubmit} form={form}>
              <div className="grid grid-cols-5 gap-3">
                <Form.Item label="پیشوند" name="prefix" className="col-span-1">
                  <Select allowClear options={PREFIX_OPTIONS} placeholder="پیشوند" />
                </Form.Item>
                <Form.Item
                  label="نام"
                  name="first_name"
                  className="col-span-4"
                  rules={[{ required: true, message: "نام را وارد کنید." }]}
                >
                  <Input placeholder="مثال: مریم" />
                </Form.Item>
              </div>

              <Form.Item
                label="نام خانوادگی"
                name="last_name"
                rules={[{ required: true, message: "نام خانوادگی را وارد کنید." }]}
              >
                <Input placeholder="مثال: رضایی" />
              </Form.Item>

              <Form.Item label="نام کسب و کار" name="business_name">
                <Input placeholder="مثال: فروشگاه چرم آوا" />
              </Form.Item>

              <Form.Item
                label="تلفن تماس"
                name="phone"
                rules={[{ required: true, message: "تلفن تماس را وارد کنید." }]}
              >
                <Input placeholder="مثال: 09123456780" />
              </Form.Item>

              <Form.Item label="توضیحات" name="description">
                <Input.TextArea rows={4} />
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={loading} className="bg-amber-700 hover:!bg-amber-600">
                ثبت درخواست
              </Button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InquiryForm;
