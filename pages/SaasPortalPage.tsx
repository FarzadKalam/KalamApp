import React from "react";
import { Button, Card } from "antd";
import { ArrowLeftOutlined, CloudServerOutlined, LoginOutlined, RocketOutlined } from "@ant-design/icons";

const SaasPortalPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-5 py-12">
        <div className="grid w-full gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-[32px] border border-slate-200 bg-white/90 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
              <RocketOutlined />
              ورودی ابری تازه سیستم
            </div>
            <h1 className="mt-6 text-4xl font-black leading-[1.35] text-slate-950 md:text-5xl">
              راه‌اندازی دمو و ورود به سازمان‌ها از اینجا
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">
              این آدرس ورودی SaaS تازه سیستم است. از اینجا می‌توانید وارد پنل شوید، درخواست دمو ثبت کنید
              و در فاز بعدی سازمان جدید بسازید یا اشتراک را مدیریت کنید.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/login">
                <Button
                  type="primary"
                  size="large"
                  icon={<LoginOutlined />}
                  className="!h-12 !rounded-2xl !border-none !bg-slate-950 !px-6 !font-black hover:!bg-slate-800"
                >
                  ورود به پنل
                </Button>
              </a>
              <a href="https://tazesystem.ir/demo">
                <Button
                  size="large"
                  icon={<ArrowLeftOutlined />}
                  className="!h-12 !rounded-2xl !border-slate-300 !px-6 !font-black !text-slate-900 hover:!border-slate-950"
                >
                  درخواست دمو
                </Button>
              </a>
            </div>
          </div>

          <div className="grid gap-4">
            <Card className="rounded-[28px] border-0 shadow-[0_22px_60px_rgba(15,23,42,0.10)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <CloudServerOutlined />
                </div>
                <div>
                  <div className="text-lg font-black text-slate-950">ساختار فعلی</div>
                  <div className="text-sm text-slate-500">Shared App + Shared DB + org_id</div>
                </div>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                <p>`kalamapp.ir` برای سازمان داخلی شما می‌ماند.</p>
                <p>`tazesystem.ir` سایت عمومی و صفحه معرفی محصول است.</p>
                <p>`*.tazesystem.ir` برای دموها و مشتری‌ها با تفکیک بر اساس `org_id` استفاده می‌شود.</p>
              </div>
            </Card>

            <Card className="rounded-[28px] border-0 shadow-[0_22px_60px_rgba(15,23,42,0.10)]">
              <div className="text-lg font-black text-slate-950">گام بعدی</div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
                <p>فرم ثبت‌نام و درخواست دمو روی همین آدرس اضافه می‌شود.</p>
                <p>بعد از آن resolver ساب‌دامین به سازمان و وضعیت trial/readonly را کامل می‌کنیم.</p>
                <p>هم‌زمان باید RLS و ایزولیشن tenantها برای shared-db سخت‌گیرانه نهایی شود.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaasPortalPage;
