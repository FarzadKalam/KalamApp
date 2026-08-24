import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Divider, Spin, Typography } from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { supabasePublic } from "../supabaseClient";

const { Text, Title } = Typography;

type PaymentDetails = {
  amount?: number;
  currency?: string;
  ref_id?: string | null;
  paid_at?: string | null;
};
type ClubBenefit = {
  title: string;
  message: string;
  amount?: number;
  currency?: string;
  discount_code?: string | null;
};

const formatAmount = (amount: number, currency?: string) =>
  `${Math.max(0, Number(amount) || 0).toLocaleString("fa-IR")} ${String(currency || "IRR").toUpperCase() === "IRT" ? "تومان" : "ریال"}`;

const PaymentCallbackPage = () => {
  const [status, setStatus] = useState<"loading" | "success" | "failed">(
    "loading",
  );
  const [message, setMessage] = useState("در حال بررسی نتیجه پرداخت...");
  const [returnUrl, setReturnUrl] = useState("/tazesystem");
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [clubBenefits, setClubBenefits] = useState<ClubBenefit[]>([]);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  useEffect(() => {
    let cancelled = false;
    const loadResult = async () => {
      try {
        const isFinalResult = Boolean(params.get("payment_result"));
        const { data, error } = await supabasePublic.functions.invoke(
          "payment-gateway",
          {
            body: isFinalResult
              ? { action: "get_callback_result", tx: params.get("tx") || "" }
              : {
                  action: "verify_callback",
                  tx: params.get("tx") || "",
                  authority:
                    params.get("Authority") || params.get("authority") || "",
                  status: params.get("Status") || params.get("status") || "",
                },
          },
        );
        if (cancelled) return;
        setReturnUrl(
          String(data?.return_url || "/tazesystem").trim() || "/tazesystem",
        );
        setPayment(
          data?.payment && typeof data.payment === "object"
            ? data.payment
            : null,
        );
        setClubBenefits(
          Array.isArray(data?.club_benefits) ? data.club_benefits : [],
        );
        if (error || data?.success === false) {
          setStatus("failed");
          setMessage(
            String(data?.message || "پرداخت ناموفق بود یا تأیید نشد."),
          );
          return;
        }
        setStatus("success");
        setMessage(String(data?.message || "پرداخت با موفقیت تأیید و ثبت شد."));
      } catch (err: any) {
        if (!cancelled) {
          setStatus("failed");
          setMessage(String(err?.message || "بررسی پرداخت ناموفق بود."));
        }
      }
    };
    void loadResult();
    return () => {
      cancelled = true;
    };
  }, [params]);

  const paidAt =
    payment?.paid_at && !Number.isNaN(new Date(payment.paid_at).getTime())
      ? new Date(payment.paid_at).toLocaleString("fa-IR")
      : null;

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-emerald-50 px-4 py-10 font-[Peyda] dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950"
    >
      <Card className="w-full max-w-lg overflow-hidden rounded-3xl border-0 shadow-xl shadow-slate-200/70 dark:shadow-black/30">
        <section className="flex flex-col items-center px-2 pb-3 pt-5 text-center">
          {status === "loading" ? (
            <span className="rounded-full bg-slate-100 p-5 dark:bg-slate-800">
              <Spin size="large" />
            </span>
          ) : status === "success" ? (
            <span className="rounded-full bg-emerald-100 p-4 text-6xl leading-none text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircleOutlined />
            </span>
          ) : (
            <span className="rounded-full bg-rose-100 p-4 text-6xl leading-none text-rose-600 dark:bg-rose-950 dark:text-rose-400">
              <CloseCircleOutlined />
            </span>
          )}
          <Title
            level={3}
            className="!mb-2 !mt-5 !text-slate-800 dark:!text-slate-100"
          >
            {status === "loading"
              ? "در حال نهایی‌سازی پرداخت"
              : status === "success"
                ? "پرداخت شما با موفقیت انجام شد"
                : "نتیجه پرداخت نیاز به پیگیری دارد"}
          </Title>
          <Text className="max-w-md leading-8 text-slate-600 dark:text-slate-300">
            {message}
          </Text>
          {status === "success" ? (
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <SafetyCertificateOutlined />
              دریافت فاکتور به‌صورت آنلاین ثبت شد
            </div>
          ) : null}

          {payment ? (
            <div className="mt-6 w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-right dark:border-slate-700 dark:bg-slate-800/70">
              <div className="flex items-center justify-between gap-4">
                <Text type="secondary">مبلغ پرداخت</Text>
                <Text
                  strong
                  className="!text-base !text-slate-800 dark:!text-slate-100"
                >
                  {formatAmount(payment.amount || 0, payment.currency)}
                </Text>
              </div>
              {payment.ref_id || paidAt ? <Divider className="!my-3" /> : null}
              {payment.ref_id ? (
                <div className="flex items-center justify-between gap-4">
                  <Text type="secondary">کد پیگیری</Text>
                  <Text
                    strong
                    copyable={{ text: payment.ref_id, icon: <CopyOutlined /> }}
                  >
                    {payment.ref_id}
                  </Text>
                </div>
              ) : null}
              {paidAt ? (
                <div className="mt-3 flex items-center justify-between gap-4">
                  <Text type="secondary">زمان پرداخت</Text>
                  <Text>{paidAt}</Text>
                </div>
              ) : null}
            </div>
          ) : null}

          {clubBenefits.length > 0 ? (
            <div className="mt-5 w-full space-y-3 text-right">
              <Text
                strong
                className="block px-1 !text-slate-700 dark:!text-slate-200"
              >
                هدیه‌ها و مزایای باشگاه مشتریان
              </Text>
              {clubBenefits.map((benefit, index) => (
                <div
                  key={`${benefit.title}-${index}`}
                  className="rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/40"
                >
                  <Text
                    strong
                    className="block !text-amber-800 dark:!text-amber-200"
                  >
                    {benefit.title}
                  </Text>
                  <Text className="mt-1 block leading-7 text-amber-900/80 dark:text-amber-100">
                    {benefit.message}
                  </Text>
                  {benefit.amount ? (
                    <Text className="mt-2 block font-semibold !text-amber-800 dark:!text-amber-200">
                      {formatAmount(benefit.amount, benefit.currency)}
                    </Text>
                  ) : null}
                  {benefit.discount_code ? (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-white/75 px-3 py-2 dark:bg-slate-900/50">
                      <Text type="secondary">کد تخفیف</Text>
                      <Text
                        strong
                        copyable={{
                          text: benefit.discount_code,
                          icon: <CopyOutlined />,
                        }}
                      >
                        {benefit.discount_code}
                      </Text>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {status === "failed" ? (
            <Alert
              type="warning"
              showIcon
              className="mt-5 w-full text-right"
              message="اگر مبلغ از حساب شما کم شده است، این صفحه را نگه دارید و از طریق کد پیگیری با پشتیبانی تماس بگیرید."
            />
          ) : null}
          <Button
            type="primary"
            size="large"
            className="!mt-7 min-w-48"
            icon={<ArrowLeftOutlined />}
            onClick={() => window.location.replace(returnUrl)}
          >
            بازگشت به فاکتور
          </Button>
        </section>
      </Card>
    </main>
  );
};

export default PaymentCallbackPage;
