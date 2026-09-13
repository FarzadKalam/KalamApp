import { useEffect, useMemo, useRef, useState } from "react";
import {
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Modal,
  Space,
  Tag,
  Tooltip,
  Switch,
} from "antd";
import {
  CheckCircleOutlined,
  CloseOutlined,
  CreditCardOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import SmartFieldRenderer from "../SmartFieldRenderer";
import QrScanPopover from "../QrScanPopover";
import { invoicesConfig } from "../../modules/invoicesConfig";
import { customerModule } from "../../modules/customerConfig";
import { supabase } from "../../supabaseClient";
import { applyInvoiceFinalizationInventory } from "../../utils/invoiceInventoryWorkflow";
import { getTodayLocalDateValue } from "../../utils/defaultValues";
import { buildClientFallbackSystemCode } from "../../utils/systemCode";
import {
  getCachedAuthUser,
  fetchSessionBootstrap,
} from "../../utils/sessionCache";

type Item = {
  key: string;
  id: string;
  source: "products" | "product_bundles";
  name: string;
  image_url?: string;
  unit_price: number;
  quantity: number;
  main_unit?: string;
  stock?: number | null;
  price_list_id?: string;
};
type Cart = {
  id: string;
  title: string;
  status: string;
  general: boolean;
  customer_id?: string;
  mobile?: string;
  prefix?: string;
  first_name?: string;
  last_name?: string;
  items: Item[];
  payment?: {
    amount: number;
    type: string;
    target_account?: string;
    responsible_id?: string;
  };
  successId?: string;
};
const makeCart = (): Cart => ({
  id: crypto.randomUUID(),
  title: "فروش جدید",
  status: "final",
  general: false,
  items: [],
});
const n = (value: any) => Number(value || 0) || 0;
const field = (key: string) =>
  invoicesConfig.fields.find((item) => item.key === key) as any;
const customerField = (key: string) =>
  customerModule.fields.find((item) => item.key === key) as any;
const paymentField = (key: string) =>
  invoicesConfig.blocks
    ?.find((block: any) => block.id === "payments")
    ?.tableColumns?.find((item: any) => item.key === key) as any;

export default function RetailInvoiceWorkspace({
  onClose,
}: {
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const searchRef = useRef<any>(null);
  const [carts, setCarts] = useState<Cart[]>([makeCart()]);
  const [activeId, setActiveId] = useState("");
  const [catalog, setCatalog] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [retailSettings, setRetailSettings] = useState<Record<string, any>>({});
  const cart = carts.find((item) => item.id === activeId) || carts[0];
  const update = (patch: Partial<Cart>) =>
    setCarts((all) =>
      all.map((item) => (item.id === cart.id ? { ...item, ...patch } : item)),
    );
  const total = useMemo(
    () =>
      (cart?.items || []).reduce(
        (sum, item) => sum + n(item.quantity) * n(item.unit_price),
        0,
      ),
    [cart],
  );
  const unitSummary = useMemo(
    () =>
      Object.entries(
        (cart?.items || []).reduce<Record<string, number>>(
          (all, item) => ({
            ...all,
            [item.main_unit || "واحد"]:
              n(all[item.main_unit || "واحد"]) + n(item.quantity),
          }),
          {},
        ),
      ),
    [cart],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await fetchSessionBootstrap(supabase, { force: true });
      const user = await getCachedAuthUser(supabase);
      const { data: companySettings } = await supabase
        .from("company_settings")
        .select("retail_invoice_settings")
        .limit(1)
        .maybeSingle();
      if (alive)
        setRetailSettings(companySettings?.retail_invoice_settings || {});
      const key = `kalamapp:retail-invoice:v1:${session.orgId}:${user?.id}`;
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) || "");
        if (saved.carts?.length) {
          setCarts(saved.carts);
          setActiveId(saved.activeId || saved.carts[0].id);
        } else setActiveId(carts[0].id);
      } catch {
        setActiveId(carts[0].id);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    void (async () => {
      const session = await fetchSessionBootstrap(supabase);
      const user = await getCachedAuthUser(supabase);
      sessionStorage.setItem(
        `kalamapp:retail-invoice:v1:${session.orgId}:${user?.id}`,
        JSON.stringify({ carts, activeId }),
      );
    })();
  }, [carts, activeId, ready]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadCatalog(), 220);
    return () => window.clearTimeout(timer);
  }, [query, retailSettings.default_price_list_id]);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    )
      return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        void save();
      } else if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "n"
      ) {
        event.preventDefault();
        addCart();
      } else if (event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        openQuickPayment();
      } else if (event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "Escape") {
        setDetailsOpen(false);
        setPaymentOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      document.querySelectorAll("kbd").forEach((node) => {
        (node as HTMLElement).style.display = media.matches ? "none" : "";
      });
      document.querySelectorAll(".anticon-info-circle").forEach((icon) => {
        const button = icon.closest("button") as HTMLElement | null;
        if (button) button.style.display = media.matches ? "none" : "";
      });
    };
    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      document.querySelectorAll("kbd").forEach((node) => {
        (node as HTMLElement).style.display = "";
      });
    };
  }, []);
  const loadCatalog = async () => {
    const text = query.trim();
    const filter = (q: any) => (text ? q.ilike("name", `%${text}%`) : q);
    const defaultPriceListId = String(
      retailSettings.default_price_list_id || "",
    ).trim();
    const [products, bundles, priceList] = await Promise.all([
      filter(
        supabase
          .from("products")
          .select(
            "id,name,image_url,sell_price,stock,main_unit,retail_quick_add_enabled,retail_display_order",
          )
          .eq("status", "active")
          .order("retail_quick_add_enabled", { ascending: false })
          .order("retail_display_order", { ascending: true, nullsFirst: false })
          .order("name")
          .limit(40),
      ),
      filter(
        supabase
          .from("product_bundles")
          .select(
            "id,name,image_url,sell_price,retail_quick_add_enabled,retail_display_order",
          )
          .eq("status", "active")
          .order("retail_quick_add_enabled", { ascending: false })
          .order("retail_display_order", { ascending: true, nullsFirst: false })
          .order("name")
          .limit(40),
      ),
      defaultPriceListId
        ? supabase
            .from("price_lists")
            .select("id,items")
            .eq("id", defaultPriceListId)
            .eq("status", "active")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const priceByProductId = new Map<string, number>();
    (Array.isArray(priceList.data?.items) ? priceList.data.items : []).forEach(
      (item: any) => {
        const productId = String(item?.product_id || "").trim();
        const price = Number(item?.price);
        if (productId && Number.isFinite(price))
          priceByProductId.set(productId, price);
      },
    );
    const productRows = (products.data || []).map((item: any) => ({
      ...item,
      sell_price: priceByProductId.has(String(item.id))
        ? priceByProductId.get(String(item.id))
        : item.sell_price,
      price_list_id: priceByProductId.has(String(item.id))
        ? defaultPriceListId
        : null,
    }));
    const productIds = productRows
      .map((item: any) => String(item.id))
      .filter(Boolean);
    const { data: productFiles } = productIds.length
      ? await supabase
          .from("file_entries")
          .select(
            "record_id,metadata,file_assets(target_url,file_type,mime_type)",
          )
          .eq("module_id", "products")
          .in("record_id", productIds)
          .eq("is_deleted", false)
      : { data: [] as any[] };
    const starredImageByProductId = new Map<string, string>();
    (productFiles || []).forEach((entry: any) => {
      const metadata =
        entry?.metadata && typeof entry.metadata === "object"
          ? entry.metadata
          : {};
      const asset = entry?.file_assets || {};
      const imageUrl = String(asset?.target_url || "").trim();
      const isImage =
        String(asset?.mime_type || "").startsWith("image/") ||
        String(asset?.file_type || "") === "image";
      if (metadata?.main_image?.starred === true && isImage && imageUrl)
        starredImageByProductId.set(String(entry.record_id), imageUrl);
    });
    setCatalog([
      ...productRows.map((item: any) => ({
        ...item,
        image_url:
          starredImageByProductId.get(String(item.id)) || item.image_url,
        source: "products",
      })),
      ...(bundles.data || []).map((item: any) => ({
        ...item,
        source: "product_bundles",
      })),
    ]);
  };
  const addCart = () => {
    const next = makeCart();
    setCarts((all) => [...all, next]);
    setActiveId(next.id);
  };
  const closeCart = (cartId: string) =>
    setCarts((all) => {
      const remaining = all.filter((item) => item.id !== cartId);
      const next = remaining.length ? remaining : [makeCart()];
      if (activeId === cartId) setActiveId(next[0].id);
      return next;
    });
  const openQuickPayment = () => {
    const configuredTypes = Array.isArray(
      retailSettings.default_payment_methods,
    )
      ? retailSettings.default_payment_methods
      : [];
    const configuredAccount = String(
      retailSettings.default_receiving_account_id ||
        retailSettings.default_account_id ||
        "",
    ).trim();
    update({
      payment: {
        amount: total,
        type: String(configuredTypes[0] || "cash"),
        target_account: configuredAccount || undefined,
        responsible_id: cart.payment?.responsible_id,
      },
    });
    setPaymentOpen(true);
  };
  const addItem = (row: any) => {
    const found = cart.items.find(
      (item) => item.id === row.id && item.source === row.source,
    );
    update({
      items: found
        ? cart.items.map((item) =>
            item === found ? { ...item, quantity: item.quantity + 1 } : item,
          )
        : [
            ...cart.items,
            {
              key: crypto.randomUUID(),
              id: row.id,
              source: row.source,
              name: row.name,
              image_url: row.image_url,
              unit_price: n(row.sell_price),
              quantity: 1,
              main_unit: row.main_unit,
              stock: row.stock,
              price_list_id: row.price_list_id || undefined,
            },
          ],
    });
  };
  const scan = async (result: any) => {
    const source =
      result.moduleId === "product_bundles" ? "product_bundles" : "products";
    if (!result.recordId) return setQuery(result.raw);
    const { data } = await supabase
      .from(source)
      .select("id,name,image_url,sell_price,stock,main_unit")
      .eq("id", result.recordId)
      .maybeSingle();
    if (!data) return message.warning("محصول اسکن‌شده یافت نشد.");
    setQuery(data.name);
    setCatalog([{ ...data, source }]);
  };
  const findCustomer = async () => {
    const value = String(cart.mobile || "").replace(/\D/g, "");
    if (value.length < 8) return;
    const { data } = await supabase
      .from("customers")
      .select("id,full_name,mobile_1")
      .ilike("mobile_1", `%${value}%`)
      .limit(3);
    if (data?.length === 1) {
      update({ customer_id: data[0].id });
      message.success(`مشتری «${data[0].full_name}» انتخاب شد.`);
    }
  };
  const save = async () => {
    if (!cart.items.length) {
      message.warning("حداقل یک قلم انتخاب کنید.");
      return;
    }
    setSaving(true);
    try {
      let customerId = cart.customer_id;
      if (cart.general) {
        const { data, error } = await supabase.rpc(
          "ensure_retail_general_customer",
        );
        if (error) throw error;
        customerId = String(data);
      } else if (!customerId) {
        if (!cart.first_name?.trim() || !cart.last_name?.trim())
          throw new Error("نام و نام خانوادگی مشتری را کامل کنید.");
        const { data, error } = await supabase
          .from("customers")
          .insert({
            prefix: cart.prefix || null,
            first_name: cart.first_name,
            last_name: cart.last_name,
            full_name: [cart.prefix, cart.first_name, cart.last_name]
              .filter(Boolean)
              .join(" "),
            mobile_1: cart.mobile || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        customerId = data.id;
      }
      const invoiceItems = cart.items.map((item) => ({
        product_id: item.source === "products" ? item.id : null,
        package_id: item.source === "product_bundles" ? item.id : null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
        main_unit: item.main_unit,
        price_list_id: item.price_list_id || null,
      }));
      const user = await getCachedAuthUser(supabase);
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          name: "فروش فروشگاهی",
          system_code: await buildClientFallbackSystemCode(
            supabase,
            "invoices",
            "invoices",
          ),
          customer_id: customerId,
          status: cart.status,
          invoice_date: getTodayLocalDateValue(),
          invoiceItems,
          payments: cart.payment?.amount
            ? [
                {
                  amount: cart.payment.amount,
                  payment_type: cart.payment.type,
                  target_account: cart.payment.target_account || null,
                  responsible_id:
                    cart.payment.responsible_id || user?.id || null,
                  date: getTodayLocalDateValue(),
                },
              ]
            : [],
        })
        .select("id")
        .single();
      if (error) throw error;
      await applyInvoiceFinalizationInventory({
        supabase: supabase as any,
        moduleId: "invoices",
        recordId: data.id,
        previousStatus: null,
        nextStatus: cart.status,
        invoiceItems,
        userId: user?.id || null,
      });
      update({ successId: data.id });
    } catch (error: any) {
      message.error(String(error.message || "ثبت فاکتور ناموفق بود."));
    } finally {
      setSaving(false);
    }
  };
  if (!ready || !cart)
    return <div className="p-10 text-center">در حال آماده‌سازی…</div>;
  if (cart.successId)
    return (
      <Card className="mx-auto mt-10 max-w-lg text-center">
        <CheckCircleOutlined className="text-4xl text-emerald-500" />
        <h2>فاکتور با موفقیت ثبت شد</h2>
        <Space>
          <Button type="primary" href={`/invoices/${cart.successId}`}>
            مشاهده فاکتور
          </Button>
          <Button onClick={() => closeCart(cart.id)}>بستن تب</Button>
        </Space>
      </Card>
    );
  const lineSummary = (
    <div className="space-y-2">
      {cart.items.map((item) => (
        <div
          key={item.key}
          className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"
        >
          <div className="flex items-center justify-between gap-2">
            <b className="truncate">{item.name}</b>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() =>
                update({
                  items: cart.items.filter((row) => row.key !== item.key),
                })
              }
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <InputNumber
              value={item.quantity}
              min={0.001}
              onChange={(quantity) =>
                update({
                  items: cart.items.map((row) =>
                    row.key === item.key
                      ? { ...row, quantity: n(quantity) }
                      : row,
                  ),
                })
              }
            />
            <InputNumber
              value={item.unit_price}
              min={0}
              onChange={(unit_price) =>
                update({
                  items: cart.items.map((row) =>
                    row.key === item.key
                      ? { ...row, unit_price: n(unit_price) }
                      : row,
                  ),
                })
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div dir="rtl" className="mx-auto max-w-[1600px] pb-28 md:p-5">
      <header className="mb-4 rounded-2xl border border-blue-100 bg-gradient-to-l from-blue-50 to-white p-3 shadow-sm dark:border-blue-900 dark:from-blue-950/30 dark:to-slate-950">
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 dark:border-slate-700">
          <div className="flex max-w-full flex-1 items-end gap-1 overflow-x-auto pb-0.5">
            {carts.map((item) => (
              <div
                key={item.id}
                role="tab"
                aria-selected={item.id === activeId}
                className={`group flex shrink-0 items-center gap-1 rounded-t-xl border border-b-0 px-3 py-2 text-sm transition ${item.id === activeId ? "border-blue-300 bg-white font-bold text-blue-700 shadow-sm dark:border-blue-700 dark:bg-slate-900 dark:text-blue-300" : "border-transparent bg-slate-100 text-slate-600 hover:bg-white dark:bg-slate-800 dark:text-slate-300"}`}
              >
                <button
                  type="button"
                  className="max-w-28 truncate text-right"
                  onClick={() => setActiveId(item.id)}
                >
                  {item.title}
                </button>
                <button
                  type="button"
                  aria-label={`بستن ${item.title}`}
                  className="grid size-5 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-rose-600 dark:hover:bg-slate-700"
                  onClick={() => closeCart(item.id)}
                >
                  <CloseOutlined className="text-[10px]" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="text"
            className="mb-0.5 shrink-0"
            icon={<PlusOutlined />}
            onClick={addCart}
          >
            تب تازه <kbd className="hidden md:inline">Ctrl+Shift+N</kbd>
          </Button>
          <div className="mb-0.5 mr-auto shrink-0">
            <Tooltip title="راهنمای میانبرها">
              <Button
                type="text"
                icon={<InfoCircleOutlined />}
                onClick={() => setHelpOpen(true)}
              />
            </Tooltip>
            <Button type="text" onClick={onClose}>
              حالت عادی
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Switch
                checked={cart.general}
                onChange={(checked) =>
                  update({
                    general: checked,
                    customer_id: undefined,
                  })
                }
              />
              <span>ثبت به‌عنوان مشتری عمومی</span>
            </div>
          </div>
          {!cart.general ? (
            <>
              <Input
                placeholder="شماره تماس مشتری"
                value={cart.mobile}
                onBlur={() => void findCustomer()}
                onChange={(event) =>
                  update({ mobile: event.target.value, customer_id: undefined })
                }
              />
              <SmartFieldRenderer
                field={customerField("prefix")}
                value={cart.prefix}
                onChange={(prefix) => update({ prefix })}
                allValues={cart}
                moduleId="customers"
                standalone
                forceEditMode
              />
              <SmartFieldRenderer
                field={customerField("first_name")}
                value={cart.first_name}
                onChange={(first_name) => update({ first_name })}
                allValues={cart}
                moduleId="customers"
                standalone
                forceEditMode
              />
              <SmartFieldRenderer
                field={customerField("last_name")}
                value={cart.last_name}
                onChange={(last_name) => update({ last_name })}
                allValues={cart}
                moduleId="customers"
                standalone
                forceEditMode
              />
            </>
          ) : null}
          <SmartFieldRenderer
            field={field("status")}
            value={cart.status}
            onChange={(status) => update({ status })}
            allValues={cart}
            moduleId="invoices"
            standalone
            forceEditMode
          />
        </div>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_370px]">
        <main>
          <Card className="rounded-2xl" title="انتخاب کالا و پکیج">
            <div className="flex gap-2">
              <Input
                ref={searchRef}
                prefix={<SearchOutlined />}
                value={query}
                placeholder="جست‌وجوی کالا یا پکیج (Alt+F)"
                onChange={(event) => setQuery(event.target.value)}
              />
              <QrScanPopover
                label="اسکن QR"
                onScan={(result) => void scan(result)}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {catalog.map((row) => (
                <button
                  type="button"
                  key={`${row.source}-${row.id}`}
                  className="min-h-36 overflow-hidden rounded-2xl bg-white p-3 text-right shadow-sm transition hover:shadow-md dark:bg-slate-900"
                  onClick={() => addItem(row)}
                >
                  {row.image_url ? (
                    <img
                      src={row.image_url}
                      alt=""
                      className="mb-3 h-24 w-full rounded-xl bg-slate-100 object-cover dark:bg-slate-800"
                      loading="lazy"
                    />
                  ) : null}
                  <b className="block min-h-11 overflow-hidden text-sm leading-5">
                    {row.name}
                  </b>
                  {row.source === "product_bundles" ? (
                    <Tag className="mt-2" color="cyan">
                      پکیج
                    </Tag>
                  ) : null}
                  <div className="mt-2 font-black text-blue-700">
                    {n(row.sell_price).toLocaleString("fa-IR")}
                  </div>
                  {row.stock != null ? (
                    <small>موجودی: {row.stock}</small>
                  ) : null}
                </button>
              ))}
            </div>
            {!catalog.length ? <Empty description="قلمی یافت نشد" /> : null}
          </Card>
        </main>
        <aside className="hidden lg:block">
          <Card className="sticky top-4 rounded-2xl" title="خلاصه فاکتور">
            {lineSummary}
            <div className="mt-4 flex justify-between text-lg font-black">
              <span>جمع کل</span>
              <span>{total.toLocaleString("fa-IR")}</span>
            </div>
            <Button
              block
              className="mt-3"
              icon={<CreditCardOutlined />}
              onClick={openQuickPayment}
            >
              ثبت دریافت <kbd>Alt+P</kbd>
            </Button>
            <Button
              block
              type="primary"
              className="mt-2"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => void save()}
            >
              ذخیره فاکتور <kbd>Ctrl+Enter</kbd>
            </Button>
          </Card>
        </aside>
      </div>
      <div className="fixed bottom-[calc(var(--app-mobile-footer-height,64px)+env(safe-area-inset-bottom)+8px)] left-2 right-2 z-[999] rounded-2xl bg-white/95 p-2 shadow-2xl backdrop-blur lg:hidden dark:bg-slate-900/95">
        <div className="flex items-center justify-between text-xs">
          {unitSummary.map(([unit, amount]) => (
            <span key={unit}>
              {amount} {unit}
            </span>
          ))}
          <b>{total.toLocaleString("fa-IR")}</b>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Button onClick={() => setDetailsOpen(true)}>مشاهده بیشتر</Button>
          <Button icon={<CreditCardOutlined />} onClick={openQuickPayment}>
            دریافت
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => void save()}
          >
            ذخیره
          </Button>
        </div>
      </div>
      <Drawer
        title="اقلام و اطلاعات فاکتور"
        placement="bottom"
        height="75vh"
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      >
        {lineSummary}
      </Drawer>
      <Modal
        title="ثبت دریافت سریع"
        open={paymentOpen}
        onCancel={() => setPaymentOpen(false)}
        onOk={() => setPaymentOpen(false)}
      >
        <div className="grid gap-3">
          <SmartFieldRenderer
            field={paymentField("amount")}
            value={cart.payment?.amount}
            onChange={(amount) =>
              update({
                payment: {
                  ...cart.payment,
                  amount: n(amount),
                  type: cart.payment?.type || "cash",
                },
              })
            }
            allValues={cart.payment || {}}
            moduleId="invoices"
            standalone
            forceEditMode
          />
          <SmartFieldRenderer
            field={paymentField("payment_type")}
            value={cart.payment?.type || "cash"}
            onChange={(type) =>
              update({
                payment: {
                  ...cart.payment,
                  amount: cart.payment?.amount || total,
                  type: String(type || "cash"),
                },
              })
            }
            allValues={cart.payment || {}}
            moduleId="invoices"
            standalone
            forceEditMode
          />
          <SmartFieldRenderer
            field={paymentField("target_account")}
            value={cart.payment?.target_account}
            onChange={(target_account) =>
              update({
                payment: {
                  ...cart.payment,
                  amount: cart.payment?.amount || total,
                  type: cart.payment?.type || "cash",
                  target_account,
                },
              })
            }
            allValues={cart.payment || {}}
            moduleId="invoices"
            standalone
            forceEditMode
          />
        </div>
      </Modal>
      <Modal
        title="میانبرها"
        open={helpOpen}
        footer={null}
        onCancel={() => setHelpOpen(false)}
      >
        <p>Ctrl+Enter ذخیره فاکتور</p>
        <p>Ctrl+Shift+N تب جدید</p>
        <p>Alt+P ثبت دریافت</p>
        <p>Alt+F جست‌وجوی کالا</p>
      </Modal>
    </div>
  );
}
