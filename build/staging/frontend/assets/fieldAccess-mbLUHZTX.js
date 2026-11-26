import{M as st,a7 as v,dL as pt,s as B,w as Y,dM as bt,av as ct,dk as gt,dl as yt,U}from"./module-registry-BuqlWO-Q.js";import{c as xt,a as vt}from"./cashBankLedger-B8zVURHD.js";import{f as mt}from"./companySettings-DqYnePve.js";import{g as ht,D as ut,f as ft}from"./listPrintExport-CLRPpxxR.js";import{a as V}from"./server.browser-XVSlFfh1.js";import{i as _t,b as wt}from"./printFieldCatalog-DSONDb_1.js";const K={[vt]:xt},w={...st,...K},kt=new Set(["price_lists","product_bundles"]),Q=t=>kt.has(String(t||"").trim()),J=(t,e)=>{const r=t==="price_lists"?e==null?void 0:e.items:t==="product_bundles"?e==null?void 0:e.products:[];return Array.isArray(r)?r:[]},ve=(t,e)=>{const r=new Set,d=[];return J(t,e).forEach(o=>{const i=String((o==null?void 0:o.product_id)||(o==null?void 0:o.selected_product_id)||"").trim();!i||r.has(i)||(r.add(i),d.push(i))}),d},me=({moduleId:t,record:e,referencesById:r})=>J(t,e).map((d,o)=>{const i=String((d==null?void 0:d.product_id)||(d==null?void 0:d.selected_product_id)||"").trim(),a=r[i]||{},l=ht((a==null?void 0:a.address)||(a==null?void 0:a.name)||(d==null?void 0:d.product_name)||(d==null?void 0:d.selected_product_name)||(d==null?void 0:d.name),"بدون عنوان");return{...a,...d,name:l,image_url:(d==null?void 0:d.image_url)||(a==null?void 0:a.image_url)||"",main_unit:(d==null?void 0:d.main_unit)||(d==null?void 0:d.unit_name)||(a==null?void 0:a.main_unit)||"",catalog_link:(d==null?void 0:d.catalog_link)||(a==null?void 0:a.catalog_link)||"",__print_source_index:o}}),he=t=>{const e=[{key:"image_url",label:"تصویر",type:v.IMAGE},{key:"name",label:"کالا / خدمت",type:v.TEXT}];return t==="price_lists"?[...e,{key:"price",label:"مبلغ نهایی",type:v.PRICE},{key:"currency_label",label:"واحد پول",type:v.TEXT},{key:"unit_name",label:"واحد",type:v.TEXT},{key:"description",label:"توضیحات",type:v.LONG_TEXT}]:[...e,{key:"quantity",label:"تعداد / مقدار",type:v.NUMBER},{key:"main_unit",label:"واحد",type:v.TEXT},{key:"unit_price",label:"قیمت واحد",type:v.PRICE},{key:"discount",label:"تخفیف پکیج",type:v.PERCENTAGE_OR_AMOUNT},{key:"total_price",label:"مبلغ نهایی",type:v.PRICE},{key:"description",label:"توضیحات",type:v.LONG_TEXT}]},At=/^<div(?:\s[^>]*)?>\s*<\/div>$/i,St=/[\s\u00a0\u200b-\u200d\u2060\ufeff]+/g,$t=/<(?:audio|canvas|embed|iframe|img|object|picture|svg|video)\b/i,Tt=()=>`
<div style="display:flex; align-items:center; gap:8px; font-size:9px; color:#64748b; direction:rtl; overflow:hidden; flex-wrap:nowrap;">
  <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; font-size:8.5px;">{{company.address}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.phone}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.email}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.website}}</span>
</div>
`.trim(),ue=t=>{const r=String(t||"").replace(/&nbsp;/gi,"").trim();return r?$t.test(r)?!0:At.test(r)?!1:r.replace(/<[^>]*>/g,"").replace(/&(?:nbsp|#160);/gi,"").replace(St,"").length>0:!1},S=(t,e)=>({label:t,value:e,kind:"field",group:"فیلدهای رکورد"}),c=(t,e)=>({label:t,value:e,kind:"field",group:"طرف حساب"}),z=(t,e)=>({label:t,value:e,kind:"field",group:"اطلاعات کارمند"}),I=(t,e,r,d)=>[S("تاریخ فاکتور","record.invoice_date"),S("وضعیت فاکتور","record.status"),S("جمع کل فاکتور","record.total_invoice_amount"),...t==="customer"?[S("جمع کل به حروف","record.total_invoice_amount_words")]:[],S(r,"record.total_received_amount"),S(d,"record.remaining_balance"),c(`نام ${e}`,`${t}.full_name`),c(`پیشوند ${e}`,`${t}.prefix`),c(t==="customer"?"نام کوچک مشتری":"نام رابط تامین‌کننده",`${t}.first_name`),c(t==="customer"?"نام خانوادگی مشتری":"نام خانوادگی رابط تامین‌کننده",`${t}.last_name`),c(`نام کسب و کار ${e}`,`${t}.business_name`),...t==="customer"?[c("نوع شخص مشتری","customer.person_type")]:[],c(`کد ملی ${e}`,`${t}.national_code`),c(`شناسه ملی ${e}`,`${t}.national_id`),c(`شناسه ملی / کد ملی ${e}`,`${t}.national_identifier`),c(`شماره ثبت ${e}`,`${t}.registration_number`),c(`کد اقتصادی ${e}`,`${t}.economic_code`),c(`کد پستی ${e}`,`${t}.postal_code`),c(`استان ${e}`,`${t}.province`),c(`شهر ${e}`,`${t}.city`),c(`تلفن ${e}`,`${t}.mobile_1`),c(`آدرس ${e}`,`${t}.address`)],N={invoices:()=>I("customer","مشتری","جمع دریافت‌شده","مانده فاکتور"),purchase_invoices:()=>I("supplier","تامین‌کننده","جمع پرداخت‌شده","مانده بدهی"),payroll_slips:()=>[z("کد ملی کارمند","employee.national_code"),z("نام پدر کارمند","employee.father_name"),z("وضعیت تاهل کارمند","employee.marital_status"),z("وضعیت نظام وظیفه کارمند","employee.military_service_status"),z("تعداد فرزندان کارمند","employee.children_count"),z("شماره بیمه کارمند","employee.insurance_number")],product_bundles:()=>[S("جمع قبل از تخفیف پکیج","record.package_gross_total"),S("جمع تخفیف پکیج","record.package_discount_total"),S("مبلغ نهایی پکیج","record.package_final_total"),{label:"جدول خلاصه پکیج",value:"system.package_summary_table",kind:"field",group:"سیستم"}]},zt=t=>{var e;return((e=N[String(t||"").trim()])==null?void 0:e.call(N))||[]},Z="print_templates",tt="kalamapp.print_templates.v1",Ht=15e3,fe=(t,e="portrait")=>t==="ROLL80"?"80mm auto":`${t||"A4"} ${e}`,D=()=>new Date().toISOString(),R={top:8,right:8,bottom:8,left:8},et=new Set(["id","key","created_at","updated_at"]),Mt=new Set(["invoices","purchase_invoices"]),Ft=new Set(["long_text","superlongtext"]),Lt=new Set(["products","billboards","price_lists","product_bundles"]),rt=t=>Lt.has(String(t||"").trim()),Pt=t=>{const e=String((t==null?void 0:t.id)||"").trim(),r=String((t==null?void 0:t.contentHtml)||"");return/_catalog_fullpage_(list_)?landscape$/i.test(e)||r.includes("system.list_catalog_fullpage")},_e=(t,e)=>!Pt(e)||rt(t),q=t=>!t||typeof t!="object"||Array.isArray(t)?{}:t,Ct=(t=[])=>{const e=t.filter(o=>{const i=String((o==null?void 0:o.key)||"").trim(),a=String((o==null?void 0:o.title)||"").trim();return!(!i||!a||et.has(i))}),r=e.slice(0,5),d=e.find(o=>String((o==null?void 0:o.key)||"").trim()==="total_price");return d&&!r.some(o=>String((o==null?void 0:o.key)||"").trim()==="total_price")&&r.push(d),r},dt=t=>Mt.has(t),M="white-space:pre-wrap; word-break:break-word; overflow-wrap:anywhere;",ot=t=>Ft.has(String(t||"").trim().toLowerCase()),O=t=>{const e=Math.max(7,t-3);return Number.isInteger(e)?`${e}px`:`${e.toFixed(1)}px`},x=t=>`font-size:${O(t)}; line-height:1.9; ${M}`,Rt=t=>new Map((Array.isArray(t==null?void 0:t.blocks)?t.blocks:[]).filter(e=>e==null?void 0:e.id).map(e=>{var r;return[String(e.id),String(((r=e==null?void 0:e.titles)==null?void 0:r.fa)||e.id)]})),Et=(t,e)=>{const r=String((e==null?void 0:e.blockId)||"").trim();return String((e==null?void 0:e.location)||"").trim().toLowerCase()==="block"&&r?`بخش: ${Rt(t).get(r)||r}`:"فیلدهای عمومی"},Bt=(t=[],e)=>t.length?t.includes(e):!0,Ot=(t,e=[])=>{const r=w[t];if(!r)return"";const d=[],o=[];return(r.fields||[]).filter(i=>{const a=String((i==null?void 0:i.key)||"").trim();return!a||et.has(a)||!V(r,i)?!1:Bt(e,`record.${a}`)}).forEach(i=>{var n,k,y,g;const a=String((i==null?void 0:i.key)||"").trim(),l=String((i==null?void 0:i.type)||"").toLowerCase()==="image",s=l?`<div style="display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--table-border-color, #d1d5db);border-radius:12px;padding:4px;background:#fff;"><img src="{{record.${a}}}" alt="${((n=i.labels)==null?void 0:n.fa)||a}" style="display:block;width:64px;height:64px;max-width:64px;max-height:64px;object-fit:cover;border-radius:8px;" /></div>`:`{{record.${a}}}`;if(l){d.push(`
        <tr>
          <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${((k=i.labels)==null?void 0:k.fa)||a}</td>
          <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; text-align:center;">${s}</td>
        </tr>
      `);return}if(ot(i==null?void 0:i.type)){o.push(`
<div style="margin-top:8px;">
  <div style="margin:0 0 3px 0; font-size:10px; color:#64748b;">${((y=i.labels)==null?void 0:y.fa)||a}</div>
  <div style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; background:#fff; ${x(11)}">${s}</div>
</div>`.trim());return}d.push(`
        <tr>
          <td style="width:38%; border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">${((g=i.labels)==null?void 0:g.fa)||a}</td>
          <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px 6px;">${s}</td>
        </tr>
      `)}),[d.length?`
<table style="width:100%; border-collapse:collapse; font-size:11px;">
  <tbody>${d.join("")}</tbody>
</table>`.trim():"",o.join("")].filter(Boolean).join(`
`)},Dt=(t,e=[])=>{const r=w[t];return r?(r.blocks||[]).filter(d=>{if(!((d==null?void 0:d.type)===U.TABLE||(d==null?void 0:d.type)===U.GRID_TABLE))return!1;const o=`block.${String((d==null?void 0:d.id)||"").trim()}`;return e.length?e.includes(o)||e.some(i=>i.startsWith(`${o}.`)):!0}).map(d=>_(t,String(d.id||"").trim())).filter(Boolean).join(`
`):""},Nt=t=>t!=="product_bundles"?"":`
<table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:11px;">
  <tbody>
    <tr>
      <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.36);">جمع قبل از تخفیف</td>
      <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.package_gross_total}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="width:25%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.24);">جمع تخفیف</td>
      <td style="width:25%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.package_discount_total}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:800; background:rgba(var(--brand-500-rgb),0.08);">مبلغ نهایی پکیج</td>
      <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:800;">{{record.package_final_total}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
  </tbody>
</table>`.trim(),it=t=>{const e=t==="invoices";return{isSales:e,counterpartyRoot:e?"customer":"supplier",counterpartyTitle:e?"خریدار":"فروشنده",companyTitle:e?"فروشنده":"خریدار",paymentsTitle:e?"دریافت‌ها":"پرداخت‌ها",paymentTypeTitle:e?"نوع دریافت":"نوع پرداخت",paymentTotalTitle:e?"جمع دریافتی‌ها":"جمع پرداختی‌ها",remainingTitle:e?"جمع باقیمانده":"مانده بدهی",officialTitle:e?"فاکتور فروش رسمی":"فاکتور خرید رسمی",unofficialTitle:e?"فاکتور فروش غیررسمی":"فاکتور خرید غیررسمی",practicalA5Title:e?"فاکتور کاربردی A5 فروش":"فاکتور کاربردی A5 خرید",practicalA4Title:e?"فاکتور کاربردی A4 فروش":"فاکتور کاربردی A4 خرید"}},jt=()=>`
    <tr data-print-optional-field="record.global_discount_amount">
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:800; background:rgba(var(--brand-50-rgb),0.52); vertical-align:middle; text-align:center;">تخفیف کل</td>
      <td colspan="5" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:700; background:rgba(var(--brand-50-rgb),0.3); vertical-align:middle; text-align:center;">
        <div style="${M}">{{record.global_discount_display}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:900; background:#fff; text-align:center; vertical-align:middle;">-{{record.global_discount_amount}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
    <tr>
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:800; background:rgba(var(--brand-50-rgb),0.68); vertical-align:middle; text-align:center;">جمع کل</td>
      <td colspan="5" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:700; background:rgba(var(--brand-50-rgb),0.38); vertical-align:middle; text-align:center;">
        <div style="${M}">{{record.total_invoice_amount_words}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 7px; font-weight:900; background:rgba(var(--brand-500-rgb),0.08); text-align:center; vertical-align:middle;">{{record.total_invoice_amount}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
`,qt=(t,e)=>`
    <tr>
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 5px; font-weight:800; background:rgba(var(--brand-50-rgb),0.62);">${t}</td>
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 5px; font-weight:800; background:rgba(var(--brand-500-rgb),0.08); text-align:center;">{{record.total_received_amount}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 5px; font-weight:800; background:rgba(var(--brand-50-rgb),0.62);">${e}</td>
      <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px 5px; font-weight:800; background:rgba(var(--brand-500-rgb),0.08); text-align:center;">{{record.remaining_balance}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
`,G=()=>{if(typeof window>"u")return{modules:{}};try{const t=window.localStorage.getItem(tt);if(!t)return{modules:{}};const e=JSON.parse(t);return{modules:q(e==null?void 0:e.modules)}}catch{return{modules:{}}}},at=t=>{typeof window>"u"||window.localStorage.setItem(tt,JSON.stringify({modules:t,updatedAt:D()}))},f=(t,e="plural")=>{var d,o,i;const r=w[t];return r?e==="singular"?String(((d=r.titles)==null?void 0:d.faSingular)||((o=r.titles)==null?void 0:o.fa)||"").trim():String(((i=r.titles)==null?void 0:i.fa)||"").trim():""},E=()=>F("invoices"),lt=(t,e,r,d)=>{var l,s;const o=w[t],i=(l=o==null?void 0:o.blocks)==null?void 0:l.find(n=>String((n==null?void 0:n.id)||"")===String(e||"")),a=(s=i==null?void 0:i.tableColumns)==null?void 0:s.find(n=>String((n==null?void 0:n.key)||"")===String(r||""));return Y({...a,key:r,labels:(a==null?void 0:a.labels)||{fa:(a==null?void 0:a.title)||d}},{moduleId:t,fallback:d})},Ut=()=>`
<div style="width:100%; direction:rtl; color:#111827; font-size:12px; font-family:inherit;">
  <table style="width:100%; table-layout:fixed; border-collapse:collapse; direction:ltr; border-bottom:1px solid rgba(17,24,39,0.28);">
    <tbody>
      <tr>
        <td style="width:32%; padding:2px 2px 10px 2px; vertical-align:top; direction:rtl; text-align:right; font-size:10.5px; line-height:1.9; color:#374151;">
          <div><span style="font-weight:700;">شماره:</span> {{record.system_code}}</div>
          <div><span style="font-weight:700;">تاریخ:</span> {{record.document_date}}</div>
          <div><span style="font-weight:700;">پیوست:</span> {{record.attachment_count}}</div>
        </td>
        <td style="width:36%; padding:2px 2px 10px 2px; vertical-align:top; direction:rtl; text-align:center; line-height:1.9;">
          <div style="font-weight:800; font-size:13px; margin-bottom:2px;">بسمه تعالی</div>
          <img src="{{company.logo_url}}" alt="لوگو" style="display:block; margin:0 auto; width:40px; height:40px; max-width:40px; max-height:40px; object-fit:contain;" />
        </td>
        <td style="width:32%; padding:2px 2px 10px 2px; vertical-align:top; direction:rtl; text-align:right; line-height:1.9;">
          <div style="font-weight:900; font-size:14px; color:#111827; overflow-wrap:anywhere;">{{company.company_full_name}}</div>
          <div style="font-size:10px; color:#6b7280; overflow-wrap:anywhere;">{{company.trade_name}}</div>
          <div style="font-size:9px; color:#6b7280; overflow-wrap:anywhere;">زمان چاپ: {{system.print_date}}</div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
`.trim(),P=t=>`
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:10px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <img src="{{company.logo_url}}" alt="لوگو" style="display:block; width:48px; height:48px; max-width:48px; max-height:48px; object-fit:contain;" />
          <div style="min-width:0;">
            <div style="font-weight:700; font-size:13px; line-height:1.8; overflow-wrap:anywhere;">{{company.company_full_name}}</div>
            <div style="font-size:11px; color:#6b7280; line-height:1.8; overflow-wrap:anywhere;">{{company.trade_name}}</div>
          </div>
        </div>
      </td>
      <td style="width:32%; vertical-align:middle; text-align:center; border:none; padding:10px 8px; background:rgba(var(--brand-500-rgb),0.08); overflow-wrap:anywhere;">
        <div style="font-weight:800; font-size:17px; line-height:1.8; color:rgb(var(--brand-500-rgb));">${f(t,"singular")||"سند"}</div>
      </td>
      <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:10px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
        <div style="display:flex; flex-direction:column; gap:4px; font-size:12px; line-height:1.8;">
          <div>زمان چاپ: {{system.print_date}}</div>
          <div>تاریخ: {{record.invoice_date}}</div>
          <div>شماره: {{record.system_code}}</div>
        </div>
      </td>
    </tr>
  </tbody>
</table>
`,F=(t="")=>`
${Tt()}
`,_=(t,e)=>{var s;const r=it(t);if(e==="invoiceItems")return`
<table data-print-block="invoiceItems" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:9.8px;">
  <thead>
    <tr style="background:rgba(var(--brand-500-rgb),0.12);">
      <th style="width:5%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ردیف</th>
      <th style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">کالا / شرح</th>
      <th style="width:8%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تعداد</th>
      <th style="width:8%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">واحد</th>
      <th style="width:14%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">قیمت واحد</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تخفیف</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ارزش افزوده</th>
      <th style="width:15%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">جمع ردیف</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__row_index__}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; vertical-align:top; word-break:break-word; overflow-wrap:anywhere;">
        <div style="font-weight:700;">{{row.product_id}}</div>
        <div style="margin-top:2px; font-size:${O(9.8)}; color:#64748b; line-height:1.7; ${M}">{{row.__invoice_item_meta__}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.quantity}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.main_unit}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.unit_price}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__discount_amount__}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.vat}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.total_price}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
    ${jt()}
  </tbody>
</table>
`;if(e==="payments"){const n=r.isSales?"جمع دریافت‌شده":"جمع پرداخت‌شده";return`
<table data-print-block="payments" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:9.6px;">
  <thead>
    <tr style="background:rgba(var(--brand-500-rgb),0.12);">
      <th style="width:5%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ردیف</th>
      <th style="width:13%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">${r.paymentTypeTitle}</th>
      <th data-print-conditional-column="cheque" style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">شماره چک</th>
      <th data-print-conditional-column="cheque" style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">سررسید</th>
      <th data-print-conditional-column="cheque" style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">بانک</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تاریخ</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">مبلغ</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">وضعیت</th>
      <th data-print-conditional-column="cheque" style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">وضعیت چک</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">توضیحات</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__row_index__}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.payment_type}}</td>
      <td data-print-conditional-column="cheque" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_serial_no}}</td>
      <td data-print-conditional-column="cheque" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_due_date}}</td>
      <td data-print-conditional-column="cheque" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_bank_name}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.date}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.amount}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.status}}</td>
      <td data-print-conditional-column="cheque" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.cheque_status}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; word-break:break-word; overflow-wrap:anywhere; ${x(9.6)}">{{row.description}}</td>
    </tr>
    ${qt(n,"جمع باقیمانده")}
  </tbody>
</table>
`}if(t==="product_bundles"&&e==="products")return`
<table data-print-block="products" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:9.8px;">
  <thead>
    <tr style="background:rgba(var(--brand-500-rgb),0.12);">
      <th style="width:6%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ردیف</th>
      <th style="width:36%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">کالا / شرح</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تعداد</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">واحد</th>
      <th style="width:14%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">قیمت واحد</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">تخفیف</th>
      <th style="width:12%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">مبلغ نهایی</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__row_index__}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; vertical-align:top; word-break:break-word; overflow-wrap:anywhere;">
        <div style="font-weight:700;">{{row.product_id}}</div>
        <div style="margin-top:2px; font-size:${O(9.8)}; color:#64748b; line-height:1.7; ${M}">{{row.__invoice_item_meta__}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.quantity}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.main_unit}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.unit_price}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.discount}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.total_price}} <span style="font-size:8.2px; color:#64748b;">{{company.currency_label}}</span></td>
    </tr>
  </tbody>
</table>
`;if(t==="price_lists"&&e==="items")return`
<table data-print-block="items" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:9.8px;">
  <thead>
    <tr style="background:rgba(var(--brand-500-rgb),0.12);">
      <th style="width:6%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">ردیف</th>
      <th style="width:34%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">کالا / شرح</th>
      <th style="width:15%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">قیمت خرید</th>
      <th style="width:11%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">درصد سود</th>
      <th style="width:15%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">مبلغ نهایی</th>
      <th style="width:9%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">واحد پول</th>
      <th style="width:10%; border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; font-weight:800;">واحد</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.__row_index__}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; vertical-align:top; word-break:break-word; overflow-wrap:anywhere;">
        <div style="font-weight:700;">{{row.product_id}}</div>
        <div style="margin-top:2px; font-size:${O(9.8)}; color:#64748b; line-height:1.7; ${M}">{{row.__invoice_item_meta__}}</div>
      </td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.buy_price}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.profit_percentage}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.price}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.currency_label}}</td>
      <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px;">{{row.unit_name}}</td>
    </tr>
  </tbody>
</table>
`;const d=w[t],o=(s=d==null?void 0:d.blocks)==null?void 0:s.find(n=>n.id===e);if(!o||!Array.isArray(o.tableColumns)||o.tableColumns.length===0)return"";const i=Ct(o.tableColumns);if(i.length===0)return"";const a=i.map(n=>`<th style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; overflow-wrap:anywhere;">${lt(t,e,n.key,n.title)}</th>`).join(""),l=i.map(n=>`<td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px 5px; overflow-wrap:anywhere; ${ot(n==null?void 0:n.type)||["description","notes"].includes(String((n==null?void 0:n.key)||"").trim().toLowerCase())?`vertical-align:top; ${x(10.5)}`:""}">{{row.${n.key}}}</td>`).join("");return`
<table data-print-block="${e}" style="width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; color:#111827; font-size:10.5px;">
  <thead><tr>${a}</tr></thead>
  <tbody><tr>${l}</tr></tbody>
</table>
`},It=(t,e)=>{const r=String((t==null?void 0:t.title)||"").trim(),d=String((t==null?void 0:t.contentHtml)||(t==null?void 0:t.content_html)||"").trim();if(!r||!d)return null;const o=String((t==null?void 0:t.id)||"").trim()||`${e}_${Math.random().toString(36).slice(2,10)}`,i=String((t==null?void 0:t.createdAt)||(t==null?void 0:t.created_at)||D()),a=String((t==null?void 0:t.updatedAt)||(t==null?void 0:t.updated_at)||D()),l=String((t==null?void 0:t.paperSize)||(t==null?void 0:t.paper_size)||"A4").toUpperCase(),s=l==="A5"||l==="A6"||l==="A7"||l==="ROLL80"?l:"A4",k=String((t==null?void 0:t.orientation)||"portrait").toLowerCase()==="landscape"?"landscape":"portrait",g=String((t==null?void 0:t.scope)||(t==null?void 0:t.templateScope)||"record").toLowerCase()==="list"?"list":"record",m=Array.isArray(t==null?void 0:t.selectedFieldKeys)?Array.from(new Set(t.selectedFieldKeys.map(p=>String(p||"").trim()).filter(Boolean))):void 0,b=(t==null?void 0:t.isSystem)===!0||(t==null?void 0:t.is_system)===!0||String(o).startsWith("default_"),h=String((t==null?void 0:t.footerHtml)||(t==null?void 0:t.footer_html)||"").trim(),A=String((t==null?void 0:t.renderMode)||(t==null?void 0:t.render_mode)||"standard").trim()==="org_letterhead"?"org_letterhead":"standard",$=String((t==null?void 0:t.backgroundImageUrl)||(t==null?void 0:t.background_image_url)||"").trim()||null,L=String((t==null?void 0:t.sourceTemplateId)||(t==null?void 0:t.source_template_id)||"").trim()||null,T=String((t==null?void 0:t.letterheadId)||(t==null?void 0:t.letterhead_id)||"").trim()||null;return{id:o,title:r,description:String((t==null?void 0:t.description)||""),moduleId:e,scope:g,headerHtml:String((t==null?void 0:t.headerHtml)||(t==null?void 0:t.header_html)||"").trim()||P(e),contentHtml:d,footerHtml:h||F(e),isActive:(t==null?void 0:t.isActive)!==!1,showHeader:(t==null?void 0:t.showHeader)!==!1,showFooter:(t==null?void 0:t.showFooter)!==!1,headerHeight:Number((t==null?void 0:t.headerHeight)||(t==null?void 0:t.header_height)||84),footerHeight:Number((t==null?void 0:t.footerHeight)||(t==null?void 0:t.footer_height)||62),pageMarginTop:Number((t==null?void 0:t.pageMarginTop)??(t==null?void 0:t.page_margin_top)??R.top),pageMarginRight:Number((t==null?void 0:t.pageMarginRight)??(t==null?void 0:t.page_margin_right)??R.right),pageMarginBottom:Number((t==null?void 0:t.pageMarginBottom)??(t==null?void 0:t.page_margin_bottom)??R.bottom),pageMarginLeft:Number((t==null?void 0:t.pageMarginLeft)??(t==null?void 0:t.page_margin_left)??R.left),paperSize:s,orientation:k,isSystem:b,selectedFieldKeys:m,renderMode:A,backgroundImageUrl:$,backgroundSizing:$?"fit":void 0,sourceTemplateId:L,letterheadId:T,isVirtual:(t==null?void 0:t.isVirtual)===!0,createdAt:i,updatedAt:a}},j=t=>{const e=q(t),r=q(e.modules),d={};return Object.entries(r).forEach(([o,i])=>{if(!Array.isArray(i))return;const a=i.map(l=>It(l,o)).filter(l=>!!l);d[o]=a}),d},Gt=t=>{const e={};return Object.entries(t||{}).forEach(([r,d])=>{if(!Array.isArray(d))return;const o=d.filter(i=>(i==null?void 0:i.isSystem)!==!0);o.length>0&&(e[r]=o)}),e},we=async()=>{try{const{data:t,error:e,scope:r}=await pt(B,{connectionType:Z,columns:"id, provider, settings"}),d=t;if(e){const i=String((e==null?void 0:e.code)||"").toUpperCase(),a=String((e==null?void 0:e.message)||"").toLowerCase();if(!(i==="PGRST116"||a.includes("0 rows")))throw e}const o=j((d==null?void 0:d.settings)||{});return Object.keys(o).length>0&&at(o),{rowId:r==="org"&&(d!=null&&d.id)?String(d.id):null,provider:String((d==null?void 0:d.provider)||"tiptap"),templatesByModule:Object.keys(o).length>0?o:j(G()),storage:Object.keys(o).length>0?"remote":"local"}}catch{return{rowId:null,provider:"tiptap",templatesByModule:j(G()),storage:"local"}}},ke=async t=>{const e=Gt(t.templatesByModule);at(e);const r=await ct(B),d=(r==null?void 0:r.id)||null,o=await mt(B);if(!o)return{rowId:null,storage:"local",errorCode:"ORG_CONTEXT_MISSING",errorMessage:"سازمان فعال برای ذخیره قالب چاپ مشخص نیست."};const i={org_id:o,connection_type:Z,provider:t.provider||"tiptap",is_active:!0,updated_by:d,settings:{modules:e}};try{const a=B.from("integration_settings").upsert(i,{onConflict:"org_id,connection_type"}).select("id").single(),{data:l,error:s}=await gt(n=>yt(a,n),Ht);if(s)throw s;return{rowId:l!=null&&l.id?String(l.id):null,storage:"remote"}}catch(a){const l=String((a==null?void 0:a.code)||"");return console.error("Print template remote save failed; local fallback kept.",a),{rowId:t.rowId||null,storage:"local",errorCode:l,errorMessage:String((a==null?void 0:a.message)||a||"unknown")}}},Xt=t=>{if(!t)return[];const e=new Set;return(t!=null&&t.id&&w[t.id]&&!K[t.id]?bt(t.id):t.fields||[]).filter(d=>{if(!(d!=null&&d.key)||!V(t,d))return!1;const o=`record.${d.key}`;return e.has(o)?!1:(e.add(o),!0)}).map(d=>{var o;return{label:Y(d,{moduleId:t==null?void 0:t.id,fallback:d.key}),value:`record.${d.key}`,kind:"field",group:Et(t,d),description:`فیلد ${((o=d.labels)==null?void 0:o.fa)||d.key}`}})},Wt=t=>Xt(w[t]),Yt=t=>{const e=w[t];return e?e.blocks.filter(_t).map(r=>{var d,o;return{label:((d=r.titles)==null?void 0:d.fa)||r.id,value:`block.${r.id}`,kind:"block",group:"بلاک‌ها",description:`بلاک کامل ${((o=r.titles)==null?void 0:o.fa)||r.id}`,insertHtml:_(t,r.id),scopes:["record"]}}):[]},Vt=t=>/^operational_financial_overview_(customer|supplier|employee)$/i.test(String(t||"").trim()),Ae=t=>{const e=[{label:"عنوان مفرد ماژول",value:"module.title",kind:"field",group:"سیستم"},{label:"عنوان جمع ماژول",value:"module.title_plural",kind:"field",group:"سیستم"},{label:"عنوان رکورد",value:"record.name",kind:"field",group:"فیلدهای عمومی"},{label:"کد سیستمی",value:"record.system_code",kind:"field",group:"فیلدهای عمومی"},{label:"تعداد پیوست‌های رکورد",value:"record.attachment_count",kind:"field",group:"فیلدهای عمومی"},{label:"تاریخ ایجاد",value:"record.created_at",kind:"field",group:"فیلدهای عمومی"},{label:"تاریخ آخرین ویرایش",value:"record.updated_at",kind:"field",group:"فیلدهای عمومی"},{label:"ایجادکننده",value:"record.created_by",kind:"field",group:"فیلدهای عمومی"},{label:"آخرین ویرایشگر",value:"record.updated_by",kind:"field",group:"فیلدهای عمومی"},{label:"نام کامل سازمان",value:"company.company_full_name",kind:"field",group:"اطلاعات سازمان"},{label:"نام سازمان",value:"company.company_name",kind:"field",group:"اطلاعات سازمان"},{label:"نام تجاری سازمان",value:"company.trade_name",kind:"field",group:"اطلاعات سازمان"},{label:"لوگوی سازمان",value:"company.logo_url",kind:"field",group:"اطلاعات سازمان"},{label:"شناسه ملی سازمان",value:"company.national_id",kind:"field",group:"اطلاعات سازمان"},{label:"شماره ثبت سازمان",value:"company.registration_number",kind:"field",group:"اطلاعات سازمان"},{label:"کد اقتصادی سازمان",value:"company.economic_code",kind:"field",group:"اطلاعات سازمان"},{label:"واحد پول سازمان",value:"company.currency_label",kind:"field",group:"اطلاعات سازمان"},{label:"کد پستی سازمان",value:"company.postal_code",kind:"field",group:"اطلاعات سازمان"},{label:"تلفن سازمان",value:"company.phone",kind:"field",group:"اطلاعات سازمان"},{label:"آدرس سازمان",value:"company.address",kind:"field",group:"اطلاعات سازمان"},{label:"وب‌سایت سازمان",value:"company.website",kind:"field",group:"اطلاعات سازمان"},{label:"نام مسئول",value:"responsible.name",kind:"field",group:"سیستم"},{label:"تاریخ امروز",value:"system.today_date",kind:"field",group:"سیستم"},{label:"تاریخ و زمان امروز",value:"system.today_datetime",kind:"field",group:"سیستم"},{label:"تاریخ و زمان چاپ",value:"system.print_date",kind:"field",group:"سیستم",scopes:["record","list"]},{label:"جدول فیلدهای دارای مقدار",value:"system.compact_fields_table",kind:"field",group:"سیستم"},{label:"فیلدها بصورت خطی (کاتالوگ)",value:"system.compact_fields_inline",kind:"field",group:"سیستم",scopes:["record"]},{label:"URL تصویر رکورد",value:"system.record_image_url",kind:"field",group:"سیستم",scopes:["record"]},{label:"جدول‌های دارای مقدار",value:"system.compact_tables_blocks",kind:"field",group:"سیستم"},{label:"تصویر رکورد",value:"system.record_image",kind:"field",group:"سیستم"},{label:"کد QR رکورد",value:"system.record_qr",kind:"field",group:"سیستم"},{label:"QR کاتالوگ (سایدبار)",value:"system.catalog_qr_section",kind:"field",group:"سیستم",scopes:["record"]},{label:"نقشه کاتالوگ (سایدبار)",value:"system.catalog_map_section",kind:"field",group:"سیستم",scopes:["record"]},{label:"فیلدهای سایدبار کاتالوگ",value:"system.compact_fields_sidebar",kind:"field",group:"سیستم",scopes:["record"]},{label:"فیلدهای کد (روی تصویر)",value:"system.catalog_code_fields",kind:"field",group:"سیستم",scopes:["record"]},{label:"اقلام کاتالوگ شبکه‌ای رکورد",value:"system.record_catalog_grid",kind:"field",group:"سیستم",scopes:["record"]},{label:"اقلام کاتالوگ تمام‌صفحه رکورد",value:"system.record_catalog_fullpage",kind:"field",group:"سیستم",scopes:["record"]},{label:"شعار سازمان",value:"company.slogan",kind:"field",group:"اطلاعات سازمان"}],r=[{label:"عنوان لیست",value:"system.list_title",kind:"field",group:"لیست چاپی",scopes:["list"]},{label:"تعداد رکوردهای انتخاب‌شده",value:"system.selected_count",kind:"field",group:"لیست چاپی",scopes:["list"]},{label:"تاریخ چاپ لیست",value:"system.print_date",kind:"field",group:"لیست چاپی",scopes:["list"]},{label:"شماره صفحه",value:"system.page_index",kind:"field",group:"لیست چاپی",scopes:["list"]},{label:"تعداد صفحات",value:"system.page_count",kind:"field",group:"لیست چاپی",scopes:["list"]},{label:"جدول لیست",value:"system.list_table",kind:"field",group:"لیست چاپی",scopes:["list"]},{label:"کاتالوگ لیست",value:"system.list_catalog_a4",kind:"field",group:"لیست چاپی",scopes:["list"]},{label:"کاتالوگ تمام‌صفحه لیست",value:"system.list_catalog_fullpage",kind:"field",group:"لیست چاپی",scopes:["list"]},{label:"جدول جمع‌بندی لیست",value:"system.list_summary_table",kind:"field",group:"لیست چاپی",scopes:["list"]}],d=Vt(t)?[{label:"جمع بدهکار",value:"summary.totalDebit",kind:"field",group:"جمع‌بندی وضعیت مالی",scopes:["list"]},{label:"جمع بستانکار",value:"summary.totalCredit",kind:"field",group:"جمع‌بندی وضعیت مالی",scopes:["list"]},{label:"مانده نهایی",value:"summary.finalBalance",kind:"field",group:"جمع‌بندی وضعیت مالی",scopes:["list"]},{label:"مقدار مطلق مانده نهایی",value:"summary.finalBalanceAmount",kind:"field",group:"جمع‌بندی وضعیت مالی",scopes:["list"]},{label:"ماهیت مانده نهایی",value:"summary.finalBalanceSide",kind:"field",group:"جمع‌بندی وضعیت مالی",scopes:["list"]}]:[],o=Wt(t),i=Yt(t),a=zt(t),l=[...e,...r,...o,...i,...a,...d],s=new Set;return l.filter(n=>s.has(n.value)?!1:(s.add(n.value),!0))},Se=t=>{const e=w[t];return Kt(e)},Kt=t=>{if(!t)return[];const e=wt({moduleConfig:t}).map(d=>({key:d.key,label:d.label,group:d.group,kind:d.kind==="table"?"table":"record",blockId:d.blockId,parentKey:d.parentKey,columnKey:d.parentKey?d.key.split(".").slice(2).join("."):void 0})),r=new Set;return e.filter(d=>r.has(d.key)?!1:(r.add(d.key),!0))},$e=t=>{const e=f(t,"singular")||"قالب چاپ";if(dt(t)){const r=it(t),d=_(t,"invoiceItems"),o=_(t,"payments");return`
<div style="padding:0; box-sizing:border-box; direction:rtl; font-family:inherit; color:#111827; line-height:1.9;">
  <h2 style="margin:0 0 8px 0; font-size:18px; color:rgb(var(--brand-500-rgb));">${e}</h2>
  <div style="margin-top:8px;">${d}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:8px;">
    <tbody>
      <tr>
        <td data-print-optional-field="record.description" style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:8px; vertical-align:top;">
          <div style="font-weight:700; margin-bottom:6px;">توضیحات</div>
          <div style="min-height:98px; ${x(12)}">{{record.description}}</div>
        </td>
        <td data-print-optional-field="block.payments" style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:8px; vertical-align:top;">
          <div style="font-weight:700; margin-bottom:6px;">${r.paymentsTitle}</div>
          ${o}
        </td>
      </tr>
    </tbody>
  </table>
</div>
`}return`
<div style="padding:0; box-sizing:border-box; direction:rtl; font-family:inherit; color:#111827; line-height:1.9;">
  <div style="margin:0 0 2px 0; font-size:11px; color:#64748b;">${e}</div>
  <h2 style="margin:0 0 8px 0; font-size:19px; color:rgb(var(--brand-500-rgb));">{{record.name}}</h2>
  <table style="width:100%; border-collapse:collapse; margin-top:8px;">
    <tbody>
      <tr>
        <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.45);">کد</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.system_code}}</td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:8px;">{{system.compact_fields_table}}</div>
  <div style="margin-top:8px;">{{system.compact_tables_blocks}}</div>
  {{system.package_summary_table}}
</div>
`},Qt=(t,e)=>{const r=f(t,"singular")||f(t)||"سند";return{id:`default_${t}_compact_a6`,moduleId:t,scope:"record",title:`${r} - خلاصه A6`,description:"قالب خلاصه برای نمایش فیلدهای دارای مقدار",paperSize:"A6",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!1,headerHeight:78,footerHeight:0,pageMarginTop:8,pageMarginRight:8,pageMarginBottom:8,pageMarginLeft:8,headerHtml:`
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:12px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:24%; border:none; padding:6px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:24px; max-height:24px; object-fit:contain;" />
      </td>
      <td style="width:76%; border:none; padding:6px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:10px; color:#64748b; margin-bottom:2px;">${r}</div>
        <div style="font-size:13px; font-weight:900; color:rgb(var(--brand-500-rgb)); line-height:1.7;">{{record.name}}</div>
        <div style="font-size:10px;">{{record.system_code}}</div>
        <div style="font-size:9px; color:#64748b; margin-top:2px;">زمان چاپ: {{system.print_date}}</div>
      </td>
    </tr>
  </tbody>
</table>
`,contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:6px;">
    {{system.record_image}}
    {{system.record_qr}}
  </div>
  {{system.compact_fields_table}}
  <div style="margin-top:6px;">{{system.compact_tables_blocks}}</div>
  {{system.package_summary_table}}
</div>
`,footerHtml:"",createdAt:e,updatedAt:e}},Jt=(t,e)=>{const r=f(t,"singular")||f(t)||"سند";return{id:`default_${t}_compact_a5`,moduleId:t,scope:"record",title:`${r} - خلاصه A5`,description:"قالب خلاصه A5 برای نمایش فیلدها و جدول‌های دارای مقدار",paperSize:"A5",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!1,headerHeight:74,footerHeight:0,pageMarginTop:7,pageMarginRight:7,pageMarginBottom:7,pageMarginLeft:7,headerHtml:`
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:12px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:18%; border:none; padding:6px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:28px; max-height:28px; object-fit:contain;" />
      </td>
      <td style="width:82%; border:none; padding:6px 8px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:10px; color:#64748b; margin-bottom:2px;">${r}</div>
        <div style="font-size:15px; font-weight:900; color:rgb(var(--brand-500-rgb)); line-height:1.8;">{{record.name}}</div>
        <div style="font-size:10px;">{{record.system_code}}</div>
        <div style="font-size:9px; color:#64748b; margin-top:2px;">زمان چاپ: {{system.print_date}}</div>
      </td>
    </tr>
  </tbody>
</table>
`,contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px;">
    {{system.record_image}}
    {{system.record_qr}}
  </div>
  {{system.compact_fields_table}}
  <div style="margin-top:8px;">{{system.compact_tables_blocks}}</div>
  {{system.package_summary_table}}
</div>
`,footerHtml:"",createdAt:e,updatedAt:e}},Zt=(t,e)=>{const r=f(t,"singular")||f(t)||"سند";return{id:`default_${t}_compact_a4`,moduleId:t,scope:"record",title:`${r} - خلاصه A4`,description:"قالب خلاصه A4 برای نمایش فیلدها و جدول‌های دارای مقدار",paperSize:"A4",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!1,headerHeight:78,footerHeight:0,pageMarginTop:10,pageMarginRight:10,pageMarginBottom:10,pageMarginLeft:10,headerHtml:`
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:12px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:14%; border:none; padding:7px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:34px; max-height:34px; object-fit:contain;" />
      </td>
      <td style="width:86%; border:none; padding:7px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:11px; color:#64748b; margin-bottom:2px;">${r}</div>
        <div style="font-size:18px; font-weight:900; color:rgb(var(--brand-500-rgb)); line-height:1.8;">{{record.name}}</div>
        <div style="font-size:11px;">{{record.system_code}}</div>
        <div style="font-size:9px; color:#64748b; margin-top:2px;">زمان چاپ: {{system.print_date}}</div>
      </td>
    </tr>
  </tbody>
</table>
`,contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit;">
  <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px;">
    {{system.record_image}}
    {{system.record_qr}}
  </div>
  {{system.compact_fields_table}}
  <div style="margin-top:8px;">{{system.compact_tables_blocks}}</div>
  {{system.package_summary_table}}
</div>
`,footerHtml:"",createdAt:e,updatedAt:e}},X=(t,e,r)=>{const d=f(t)||"فهرست",o=r==="landscape"?"افقی":"عمودی";return{id:`default_${t}_list_a4_${r}`,moduleId:t,scope:"list",title:`قالب پرینت جدول A4 ${o}`,description:`قالب سیستمی جدول ${d} در قطع A4 ${o}`,paperSize:"A4",orientation:r,isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:84,footerHeight:44,pageMarginTop:8,pageMarginRight:8,pageMarginBottom:8,pageMarginLeft:8,headerHtml:`
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:14px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:16%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:34px; max-height:34px; object-fit:contain;" />
      </td>
      <td style="width:54%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:15px; font-weight:800; color:rgb(var(--brand-500-rgb));">{{system.list_title}}</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:30%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.22); text-align:right; font-size:11px; line-height:1.8;">
        <div>تاریخ چاپ: {{system.print_date}}</div>
        <div>تعداد رکورد: {{system.selected_count}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit;">
  {{system.list_table}}
  {{system.list_summary_table}}
</div>
`.trim(),footerHtml:`
<div style="display:flex; align-items:center; gap:8px; font-size:9px; color:#64748b; direction:rtl; overflow:hidden; flex-wrap:nowrap;">
  <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; font-size:8.5px;">{{company.address}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.phone}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.email}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.website}}</span>
  <span style="white-space:nowrap; flex-shrink:0; border-right:1px solid rgba(148,163,184,0.4); padding-right:8px; margin-right:4px;">صفحه {{system.page_index}} از {{system.page_count}}</span>
</div>
`.trim(),createdAt:e,updatedAt:e}},Te=(t,e)=>{const r=String(e||"").trim();if(typeof window>"u"||!r||!/<table/i.test(r))return r;try{const d=l=>{const s=String(l.getAttribute("data-print-block")||"").trim();if(s)return s;if(l.querySelector("table"))return"";const n=String(l.innerHTML||"");return n.includes("{{row.__row_index__}}")&&n.includes("{{row.product_id}}")&&n.includes("{{row.quantity}}")&&n.includes("{{row.main_unit}}")&&n.includes("{{row.unit_price}}")&&n.includes("{{row.total_price}}")?"invoiceItems":n.includes("{{row.__row_index__}}")&&n.includes("{{row.payment_type}}")&&n.includes("{{row.amount}}")&&(n.includes("{{row.status}}")||n.includes("{{row.cheque_status}}"))?"payments":""},o=new window.DOMParser,a=o.parseFromString(`<div id="print-block-normalize-root">${r}</div>`,"text/html").getElementById("print-block-normalize-root");return a?(a.querySelectorAll("table").forEach(l=>{var A,$,L,T;const s=d(l);if(!s)return;const n=_(t,s);if(!n)return;const y=o.parseFromString(`<div id="print-block-canonical-root">${n}</div>`,"text/html").querySelector("table[data-print-block]");if(!y)return;const g=($=(A=w[t])==null?void 0:A.blocks)==null?void 0:$.find(p=>String((p==null?void 0:p.id)||"")===s),m=(T=(L=y.tHead)==null?void 0:L.rows)==null?void 0:T[0],b=g==null?void 0:g.tableColumns;m&&Array.isArray(b)&&Array.from(m.cells||[]).forEach((p,C)=>{const u=b[C-1];C<=0||!u||(p.textContent=lt(t,s,String((u==null?void 0:u.key)||""),String((u==null?void 0:u.title)||(u==null?void 0:u.key)||"")))});const h=l.getAttribute("data-border-color")||l.style.getPropertyValue("--table-border-color")||l.style.borderColor||"";if(h){y.setAttribute("data-border-color",h);const p=String(y.getAttribute("style")||"").trim();y.setAttribute("style",`${p}${p?";":""}--table-border-color:${h};border-color:${h};`)}l.replaceWith(y)}),a.innerHTML):r}catch{return r}},te=(t,e=ut)=>{if(Q(t))return"{{system.record_catalog_fullpage}}";const r=t==="billboards";return ft({imageUrl:"{{system.record_image_url}}",primaryTitle:r?"{{record.address}}":"{{record.name}}",codeFieldsHtml:"{{system.catalog_code_fields}}",watermarkText:"{{company.company_name_en}}",sidebarFieldsHtml:"{{system.compact_fields_sidebar}}",logoUrl:"{{company.logo_url}}",companyName:"{{company.company_full_name}}",slogan:"{{company.slogan}}",phone:"{{company.phone}}",email:"{{company.email}}",website:"{{company.website}}",companyAddress:"{{company.address}}",todayDate:"{{system.print_date}}",qrSectionHtml:"{{system.catalog_qr_section}}",mapSectionHtml:r?"{{system.catalog_map_section}}":"",imageDisplayMode:e,isFirstPage:!0})},ee=(t,e)=>({id:`default_${t}_catalog_fullpage_landscape`,moduleId:t,scope:"record",title:"کاتالوگ تمام صفحه",description:"قالب کاتالوگی تک‌برگه A4 افقی با تصویر بزرگ — مناسب ارسال به مشتریان",paperSize:"A4",orientation:"landscape",isActive:!0,isSystem:!0,showHeader:!1,showFooter:!1,pageMarginTop:0,pageMarginRight:0,pageMarginBottom:0,pageMarginLeft:0,headerHtml:"",footerHtml:"",contentHtml:te(t),createdAt:e,updatedAt:e}),re=(t,e)=>({id:`default_${t}_catalog_grid`,moduleId:t,scope:"record",title:"کاتالوگ شبکه‌ای",description:"قالب کارت شبکه‌ای برای چاپ یک رکورد با تصویر و فیلدهای انتخاب‌شده",paperSize:"A4",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,pageMarginTop:10,pageMarginRight:10,pageMarginBottom:10,pageMarginLeft:10,headerHtml:'<div style="direction:rtl;text-align:right;font-size:15px;font-weight:800;color:rgb(var(--brand-500-rgb));">{{company.company_full_name}}</div>',footerHtml:'<div style="direction:rtl;text-align:center;color:#64748b;font-size:9px;">{{company.phone}} · {{company.website}}</div>',contentHtml:Q(t)?"{{system.record_catalog_grid}}":`<div style="direction:rtl;border:1px solid rgba(148,163,184,.45);border-radius:18px;padding:18px;background:linear-gradient(135deg,rgba(var(--brand-50-rgb),.8),#fff);font-family:inherit;">
  <div style="display:flex;gap:16px;align-items:flex-start;">
    <div style="width:42%;min-height:180px;border-radius:14px;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="{{system.record_image_url}}" alt="تصویر رکورد" style="max-width:100%;max-height:240px;object-fit:contain;" /></div>
    <div style="flex:1;"><h1 style="margin:0 0 8px;font-size:23px;color:rgb(var(--brand-500-rgb));">{{record.name}}</h1><div style="font-size:11px;color:#64748b;line-height:1.9;">{{system.compact_fields_inline}}</div></div>
  </div>
  <div style="margin-top:16px;">{{system.compact_fields_sidebar}}</div>
</div>`,createdAt:e,updatedAt:e}),de=(t,e)=>({id:`default_${t}_catalog_fullpage_list_landscape`,moduleId:t,scope:"list",title:"کاتالوگ تمام صفحه — لیست",description:"هر رکورد یک صفحه کامل A4 افقی کاتالوگی — مناسب ارسال فهرست محصولات/تابلوها به مشتریان",paperSize:"A4",orientation:"landscape",isActive:!0,isSystem:!0,showHeader:!1,showFooter:!1,pageMarginTop:0,pageMarginRight:0,pageMarginBottom:0,pageMarginLeft:0,headerHtml:"",footerHtml:"",contentHtml:"{{system.list_catalog_fullpage}}",createdAt:e,updatedAt:e}),oe=(t,e)=>{const r=f(t)||"فهرست";return{id:`default_${t}_catalog_a4_portrait`,moduleId:t,scope:"list",title:"کاتالوگ A4 عمودی",description:`قالب سیستمی کاتالوگی ${r} در قطع A4 عمودی با ۶ کارت در هر صفحه`,paperSize:"A4",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:84,footerHeight:40,pageMarginTop:8,pageMarginRight:8,pageMarginBottom:8,pageMarginLeft:8,headerHtml:`
<table style="width:100%; border-collapse:collapse; direction:rtl; border:1px solid rgba(148,163,184,0.3); border-radius:14px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:16%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.45); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:34px; max-height:34px; object-fit:contain;" />
      </td>
      <td style="width:54%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:15px; font-weight:800; color:rgb(var(--brand-500-rgb));">{{system.list_title}}</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:30%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.22); text-align:right; font-size:11px; line-height:1.8;">
        <div>تاریخ چاپ: {{system.print_date}}</div>
        <div>تعداد رکورد: {{system.selected_count}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit;">
  {{system.list_catalog_a4}}
  {{system.list_summary_table}}
</div>
`.trim(),footerHtml:`
<div style="display:flex; align-items:center; gap:8px; font-size:9px; color:#64748b; direction:rtl; overflow:hidden; flex-wrap:nowrap;">
  <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; font-size:8.5px;">{{company.address}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.phone}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.email}}</span>
  <span style="white-space:nowrap; flex-shrink:0; direction:ltr;">{{company.website}}</span>
  <span style="white-space:nowrap; flex-shrink:0; border-right:1px solid rgba(148,163,184,0.4); padding-right:8px; margin-right:4px;">صفحه {{system.page_index}} از {{system.page_count}}</span>
</div>
`.trim(),createdAt:e,updatedAt:e}},ie=t=>({id:"default_secretariat_official_letter_a4",moduleId:"secretariat_documents",scope:"record",title:"نامه رسمی اداری A4",description:"سربرگ رسمی دبیرخانه با تاریخ، شماره و پیوست",paperSize:"A4",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:112,footerHeight:30,pageMarginTop:14,pageMarginRight:16,pageMarginBottom:10,pageMarginLeft:16,headerHtml:Ut().trim(),contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:12.5px; line-height:2.25; padding:4px 4px 0 4px;">
  <div style="text-align:right; margin-bottom:16px;">
    <div><span style="font-weight:800;">موضوع:</span> <span style="font-weight:700;">{{record.name}}</span></div>
    <div><span style="font-weight:800;">از:</span> {{system.letter_sender_display}}</div>
    <div><span style="font-weight:800;">به:</span> {{system.letter_recipient_display}}</div>
  </div>
  <div style="min-height:470px; text-align:right; padding:0 2px; ${x(13)}">{{record.body}}</div>
</div>
`.trim(),footerHtml:`
<div style="direction:rtl; width:100%; border-top:1px solid rgba(17,24,39,0.22); padding-top:5px; color:#4b5563; font-size:9px; line-height:1.7; text-align:center; overflow-wrap:anywhere;">
  <span>آدرس: {{company.address}}</span>
  <span style="margin:0 8px;">|</span>
  <span>تلفن: {{company.phone}}</span>
  <span style="margin:0 8px;">|</span>
  <span>سایت: {{company.website}}</span>
</div>
`.trim(),createdAt:t,updatedAt:t}),ae=t=>({id:"default_delivery_form_operational_a4",moduleId:"delivery_forms",scope:"record",title:"فرم تحویل عملیاتی A4",description:"قالب چاپ رسمی برای فرم‌های تحویل با امضا و اقلام",paperSize:"A4",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:84,footerHeight:84,pageMarginTop:10,pageMarginRight:10,pageMarginBottom:10,pageMarginLeft:10,headerHtml:`
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:18%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.42); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:42px; max-height:42px; object-fit:contain;" />
      </td>
      <td style="width:50%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:14px; font-weight:900; color:rgb(var(--brand-500-rgb));">فرم تحویل / رسید</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:32%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.24); line-height:1.9;">
        <div>زمان تحویل: {{record.delivery_date}}</div>
        <div>شماره: {{record.system_code}}</div>
        <div>وضعیت: {{record.status}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.9;">
  <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">عنوان فرم</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.name}}</td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">نوع فرم</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.form_type}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تحویل‌دهنده</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.delivered_by_employee_id}} {{record.delivered_by_customer_id}} {{record.delivered_by_supplier_id}} {{record.external_delivered_by}} {{record.delivered_by_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تحویل‌گیرنده</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.received_by_employee_id}} {{record.received_by_customer_id}} {{record.received_by_supplier_id}} {{record.external_received_by}} {{record.received_by_id}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">محل تحویل</td>
        <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.location_text}}</td>
      </tr>
    </tbody>
  </table>
  ${_("delivery_forms","items")}
  <div style="margin-top:8px; border:1px solid var(--table-border-color, #d1d5db); background:rgba(var(--brand-50-rgb),0.12); padding:8px;">
    <div style="font-weight:800; color:rgb(var(--brand-500-rgb)); margin-bottom:4px;">یادداشت‌ها و شرایط تحویل</div>
    <div style="${x(11)}">{{record.notes}}</div>
  </div>
</div>
`.trim(),footerHtml:F("stock_transfers").trim(),createdAt:t,updatedAt:t}),le=t=>({id:"default_stock_transfer_voucher_a4",moduleId:"stock_transfers",scope:"record",title:"حواله انبار A4",description:"قالب چاپ عملیاتی حواله و تردد کالا با تمرکز روی ورود/خروج و مسئولیت تحویل",paperSize:"A4",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:82,footerHeight:84,pageMarginTop:10,pageMarginRight:10,pageMarginBottom:10,pageMarginLeft:10,headerHtml:`
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:16%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.42); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:38px; max-height:38px; object-fit:contain;" />
      </td>
      <td style="width:52%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:14px; font-weight:900; color:rgb(var(--brand-500-rgb));">حواله / تردد کالا</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:32%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.24); line-height:1.9;">
        <div>تاریخ: {{record.transfer_date}}</div>
        <div>شماره: {{record.system_code}}</div>
        <div>نوع: {{record.transfer_type}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.9;">
  <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">عنوان حواله</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.name}}</td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">وضعیت</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.status}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">کالا</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.product_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مقدار</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.delivered_qty}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مبدا</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.source_warehouse_id}} / {{record.from_shelf_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مقصد</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.target_warehouse_id}} / {{record.to_shelf_id}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تحویل‌دهنده</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.sender_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تحویل‌گیرنده</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.receiver_id}}</td>
      </tr>
    </tbody>
  </table>
  <div style="border:1px solid var(--table-border-color, #d1d5db); padding:8px; background:rgba(var(--brand-50-rgb),0.12);">
    <div style="font-weight:800; color:rgb(var(--brand-500-rgb)); margin-bottom:4px;">یادداشت‌ها</div>
    <div style="${x(11)}">{{record.notes}}</div>
  </div>
</div>
`.trim(),footerHtml:F("stock_transfers").trim(),createdAt:t,updatedAt:t}),ne=t=>({id:"default_employee_contract_formal_a4",moduleId:"employee_contracts",scope:"record",title:"قرارداد کارمند A4",description:"قالب رسمی قرارداد کارکنان با مشخصات طرفین",paperSize:"A4",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:84,footerHeight:84,pageMarginTop:10,pageMarginRight:10,pageMarginBottom:10,pageMarginLeft:10,headerHtml:`
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:18%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.42); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:40px; max-height:40px; object-fit:contain;" />
      </td>
      <td style="width:52%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:14px; font-weight:900; color:rgb(var(--brand-500-rgb));">قرارداد کارمند</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:30%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.24); line-height:1.9;">
        <div>شماره: {{record.system_code}}</div>
        <div>شروع: {{record.start_date}}</div>
        <div>پایان: {{record.end_date}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:2;">
  <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">عنوان قرارداد</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.name}}</td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">نوع قرارداد</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.contract_type}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">کارمند</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_id}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">سمت</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.title}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">محل کار</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.work_location}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مبلغ پایه</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.base_salary}} <span style="font-size:9px; color:#64748b;">{{company.currency_label}}</span></td>
      </tr>
    </tbody>
  </table>
  <div style="min-height:430px; padding:8px 4px; ${x(12)}">{{record.body}}</div>
</div>
`.trim(),footerHtml:F("employee_contracts").trim(),createdAt:t,updatedAt:t}),W=(t,e="portrait")=>({id:e==="landscape"?"default_payroll_slip_formal_a4_landscape":"default_payroll_slip_formal_a4",moduleId:"payroll_slips",scope:"record",title:e==="landscape"?"فیش حقوقی رسمی A4 افقی":"فیش حقوقی رسمی A4",description:e==="landscape"?"قالب رسمی افقی فیش حقوقی با فضای بیشتر برای ردیف‌ها و پرداخت‌ها":"قالب رسمی فیش حقوقی با ردیف‌ها و پرداخت‌ها",paperSize:"A4",orientation:e,isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:e==="landscape"?72:84,footerHeight:e==="landscape"?72:84,pageMarginTop:e==="landscape"?8:10,pageMarginRight:e==="landscape"?8:10,pageMarginBottom:e==="landscape"?8:10,pageMarginLeft:e==="landscape"?8:10,headerHtml:`
<table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
  <tbody>
    <tr>
      <td style="width:18%; border:none; padding:8px; background:rgba(var(--brand-50-rgb),0.42); text-align:center; vertical-align:middle;">
        <img src="{{company.logo_url}}" alt="لوگو" style="max-width:40px; max-height:40px; object-fit:contain;" />
      </td>
      <td style="width:52%; border:none; padding:8px 10px; background:rgba(var(--brand-500-rgb),0.08);">
        <div style="font-size:14px; font-weight:900; color:rgb(var(--brand-500-rgb));">فیش حقوقی</div>
        <div style="font-size:11px; color:#64748b;">{{company.company_full_name}}</div>
      </td>
      <td style="width:30%; border:none; padding:8px 10px; background:rgba(var(--brand-50-rgb),0.24); line-height:1.9;">
        <div>شماره: {{record.system_code}}</div>
        <div>از: {{record.period_start}}</div>
        <div>تا: {{record.period_end}}</div>
      </td>
    </tr>
  </tbody>
</table>
`.trim(),contentHtml:`
<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.9;">
  <table style="width:100%; border-collapse:collapse; margin-bottom:8px;">
    <tbody>
      <tr>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">کارمند</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_id}}</td>
        <td style="width:18%; border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.32);">وضعیت</td>
        <td style="width:32%; border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.status}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">کد ملی</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_national_code}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">نام پدر</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_father_name}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">وضعیت تاهل</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_marital_status}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">وضعیت نظام وظیفه</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_military_service_status}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">تعداد فرزند</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_children_count}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">شماره بیمه</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.employee_insurance_number}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">حقوق پایه</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.base_salary}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">کارکرد</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.task_wage_total}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">مزایا</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.bonus_total}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">جمع حقوق و مزایا</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.earnings_total}}</td>
      </tr>
      <tr>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">جمع کسورات</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.deduction_total}}</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">ناخالص</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:6px;">{{record.earnings_total}}</td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:700; background:rgba(var(--brand-50-rgb),0.28);">خالص پرداختی</td>
        <td colspan="2" style="border:1px solid var(--table-border-color, #d1d5db); padding:6px; font-weight:800;">{{record.gross_amount}}</td>
      </tr>
    </tbody>
  </table>
  ${_("payroll_slips","lines")}
  <div style="margin-top:8px;">${_("payroll_slips","payments")}</div>
  <div style="margin-top:8px; border:1px solid var(--table-border-color, #d1d5db); background:rgba(var(--brand-50-rgb),0.12); padding:8px;">
    <div style="font-weight:800; color:rgb(var(--brand-500-rgb)); margin-bottom:4px;">توضیحات</div>
    <div style="${x(11)}">{{record.notes}}</div>
  </div>
</div>
`.trim(),footerHtml:F("payroll_slips").trim(),createdAt:t,updatedAt:t}),se=(t,e="all")=>{const r=D(),d=Zt(t,r),o=Jt(t,r),i=Qt(t,r),a=X(t,r,"portrait"),l=X(t,r,"landscape"),s=oe(t,r),n=rt(t)?[re(t,r),ee(t,r),de(t,r)]:[],k=t==="secretariat_documents"?[ie(r)]:t==="delivery_forms"?[ae(r)]:t==="stock_transfers"?[le(r)]:t==="employee_contracts"?[ne(r)]:t==="payroll_slips"?[W(r),W(r,"landscape")]:[],y=t==="products"?["A6","A7"].map(p=>({id:`default_product_label_${p.toLowerCase()}`,moduleId:t,scope:"record",title:`لیبل محصول ${p}`,description:`لیبل آمادهٔ محصول در قطع استاندارد ${p} با تصویر و QR قابل انتخاب`,paperSize:p,orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!1,showFooter:!1,headerHeight:0,footerHeight:0,pageMarginTop:p==="A7"?4:6,pageMarginRight:p==="A7"?4:6,pageMarginBottom:p==="A7"?4:6,pageMarginLeft:p==="A7"?4:6,headerHtml:"",contentHtml:`<div style="direction:rtl;box-sizing:border-box;min-height:${p==="A7"?"92":"136"}mm;border:1.2px solid #0f172a;border-radius:10px;padding:${p==="A7"?"5":"7"}mm;background:#fff;color:#111827;display:flex;flex-direction:column;justify-content:space-between;font-family:inherit;">
  <div>
    <div data-print-optional-field="record.name" style="font-size:${p==="A7"?"14":"18"}px;line-height:1.55;font-weight:900;word-break:break-word;">{{record.name}}</div>
    <div data-print-optional-field="record.system_code" style="margin-top:2px;font-size:${p==="A7"?"9":"11"}px;color:#475569;direction:ltr;text-align:right;">{{record.system_code}}</div>
  </div>
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:6px;margin-top:5px;">
    <div data-print-optional-field="system.record_image" style="max-width:52%;line-height:0;overflow:hidden;border-radius:7px;">{{system.record_image}}</div>
    <div data-print-optional-field="system.record_qr" style="line-height:0;">{{system.record_qr}}</div>
  </div>
</div>`,footerHtml:"",createdAt:r,updatedAt:r})):[];if(!dt(t)){const p=[...k,...y,...n,d,o,i,a,l,s];return e==="all"?p:p.filter(C=>C.scope===e)}const g=_(t,"invoiceItems"),m=_(t,"payments"),b=t==="purchase_invoices"?"supplier":"customer",h=t==="purchase_invoices"?"فروشنده":"خریدار",A=t==="purchase_invoices"?"خریدار":"فروشنده",$=t==="purchase_invoices"?"پرداخت‌ها":"دریافت‌ها",T=[...t==="invoices"?[{id:"default_retail_invoice_a5",moduleId:t,scope:"record",title:"فاکتور فروشگاهی A5",description:"قالب جمع‌وجور فروشگاهی برای چاپ A5 با اقلام، جمع و دریافت‌ها",paperSize:"A5",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!1,showFooter:!1,headerHeight:0,footerHeight:0,pageMarginTop:7,pageMarginRight:7,pageMarginBottom:7,pageMarginLeft:7,headerHtml:"",contentHtml:`<div style="direction:rtl;color:#111827;font-family:inherit;font-size:10px;line-height:1.7;">
  <div style="text-align:center;border-bottom:2px solid rgb(var(--brand-500-rgb));padding-bottom:5px;">
    <div style="font-size:16px;font-weight:900;color:rgb(var(--brand-600-rgb));">{{company.company_full_name}}</div>
    <div style="margin-top:2px;font-size:13px;font-weight:800;">فاکتور فروش</div>
    <div style="font-size:9px;color:#64748b;">{{record.system_code}} · {{record.issue_date}}</div>
  </div>
  <div style="display:flex;justify-content:space-between;gap:8px;margin:6px 0;">
    <span data-print-optional-field="record.customer_id">مشتری: {{customer.full_name}}</span>
    <span data-print-optional-field="record.customer_id">{{customer.mobile_1}}</span>
  </div>
  <div data-print-optional-field="block.invoiceItems">${g}</div>
  <div data-print-optional-field="block.payments" style="margin-top:6px;">${m}</div>
  <div data-print-optional-field="record.description" style="margin-top:6px;padding:5px;border:1px solid var(--table-border-color,#d1d5db);border-radius:6px;">{{record.description}}</div>
  <div style="margin-top:8px;text-align:center;font-size:9px;color:#64748b;">{{company.phone}} {{company.address}}</div>
</div>`,footerHtml:"",createdAt:r,updatedAt:r},{id:"default_retail_invoice_roll80",moduleId:t,scope:"record",title:"فاکتور فروشگاهی رول ۸۰ میلی‌متری",description:"قالب فیش حرارتی استاندارد برای چاپگرهای فروشگاهی ۸۰ میلی‌متری",paperSize:"ROLL80",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!1,showFooter:!1,headerHeight:0,footerHeight:0,pageMarginTop:3,pageMarginRight:3,pageMarginBottom:3,pageMarginLeft:3,headerHtml:"",contentHtml:`<div style="direction:rtl;color:#111827;font-family:inherit;font-size:9px;line-height:1.65;width:74mm;box-sizing:border-box;">
  <div style="text-align:center;border-bottom:1px dashed #475569;padding-bottom:4px;">
    <div style="font-size:13px;font-weight:900;">{{company.company_full_name}}</div>
    <div style="font-weight:800;">فاکتور فروش</div>
    <div style="font-size:8px;">{{record.system_code}} · {{record.issue_date}}</div>
  </div>
  <div data-print-optional-field="record.customer_id" style="padding:4px 0;border-bottom:1px dashed #94a3b8;">مشتری: {{customer.full_name}} {{customer.mobile_1}}</div>
  <div data-print-optional-field="block.invoiceItems" style="margin-top:4px;">${g}</div>
  <div data-print-optional-field="block.payments" style="margin-top:4px;border-top:1px dashed #94a3b8;padding-top:4px;">${m}</div>
  <div data-print-optional-field="record.description" style="margin-top:4px;font-size:8px;">{{record.description}}</div>
  <div style="margin-top:6px;border-top:1px dashed #475569;padding-top:4px;text-align:center;font-size:8px;">{{company.phone}}<br/>سپاس از خرید شما</div>
</div>`,footerHtml:"",createdAt:r,updatedAt:r}]:[],{id:"default_invoice_unofficial",moduleId:t,scope:"record",title:t==="purchase_invoices"?"فاکتور خرید غیررسمی":"فاکتور فروش غیررسمی",description:"نسخه پیش‌فرض A4 افقی برای چاپ غیررسمی",paperSize:"A4",orientation:"landscape",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:74,footerHeight:50,pageMarginTop:8,pageMarginRight:8,pageMarginBottom:8,pageMarginLeft:8,headerHtml:P(t).trim(),contentHtml:`<div style="direction:rtl; color:#111827; font-family:inherit;">
  <table style="width:100%; border-collapse:collapse; font-size:11px; line-height:1.8;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; background:rgba(var(--brand-50-rgb),0.18); vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${A}</div>
          <table style="width:100%; border-collapse:collapse; font-size:10px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.company_full_name}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">تلفن</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.phone}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${h}</div>
          <table style="width:100%; border-collapse:collapse; font-size:10px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.full_name}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">تلفن</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.mobile_1}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کسب‌وکار</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.business_name}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:6px;">${g}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
    <tbody>
      <tr>
        <td data-print-optional-field="record.description" style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">توضیحات</div>
          <div style="min-height:52px; ${x(11)}">{{record.description}}</div>
        </td>
        <td data-print-optional-field="block.payments" style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">${$}</div>
          ${m}
        </td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),footerHtml:E().trim(),createdAt:r,updatedAt:r},{id:"default_invoice_official",moduleId:t,scope:"record",title:t==="purchase_invoices"?"فاکتور خرید رسمی":"فاکتور فروش رسمی",description:"نسخه پیش‌فرض A4 افقی با فیلدهای رسمی فروشنده و خریدار",paperSize:"A4",orientation:"landscape",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:74,footerHeight:50,pageMarginTop:8,pageMarginRight:8,pageMarginBottom:8,pageMarginLeft:8,headerHtml:P(t).trim(),contentHtml:`<div style="direction:rtl; color:#111827; font-family:inherit;">
  <table style="width:100%; border-collapse:collapse; font-size:11px; line-height:1.8;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top; background:rgba(var(--brand-50-rgb),0.18);">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">مشخصات ${A}</div>
          <table style="width:100%; border-collapse:collapse; font-size:10px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.company_full_name}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">شناسه ملی</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.national_id}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">شماره ثبت</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.registration_number}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد اقتصادی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.economic_code}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد پستی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.postal_code}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">تلفن</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.phone}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{company.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">مشخصات ${h}</div>
          <table style="width:100%; border-collapse:collapse; font-size:10px;">
            <tbody>
              <tr>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نوع</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.person_type}}</td>
                <td style="width:20%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.32); font-weight:700;">نام</td>
                <td style="width:30%; border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.full_name}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کسب‌وکار</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.business_name}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">شناسه/ملی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.national_identifier}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">شماره ثبت</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.registration_number}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد اقتصادی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.economic_code}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">کد پستی</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.postal_code}}</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">تلفن</td>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.mobile_1}}</td>
              </tr>
              <tr>
                <td style="border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.28); font-weight:700;">نشانی</td>
                <td colspan="3" style="border:1px solid var(--table-border-color, #d1d5db); padding:4px;">{{${b}.address}}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:6px;">${g}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
    <tbody>
      <tr>
        <td data-print-optional-field="record.description" style="width:54%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">شرح / توضیحات</div>
          <div style="min-height:52px; ${x(11)}">{{record.description}}</div>
        </td>
        <td data-print-optional-field="block.payments" style="width:46%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:4px; color:rgb(var(--brand-500-rgb));">${$}</div>
          ${m}
        </td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),footerHtml:E().trim(),createdAt:r,updatedAt:r},{id:"default_invoice_practical_a5",moduleId:t,scope:"record",title:t==="purchase_invoices"?"فاکتور کاربردی A5 خرید":"فاکتور کاربردی A5 فروش",description:"نسخه فشرده A5 عمودی برای جا دادن اقلام بیشتر",paperSize:"A5",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:78,footerHeight:54,pageMarginTop:7,pageMarginRight:7,pageMarginBottom:7,pageMarginLeft:7,headerHtml:P(t).trim(),contentHtml:`<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.75;">
  <table style="width:100%; border-collapse:collapse; font-size:10px;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.16); vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${A}</div>
          <div>{{company.company_full_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{company.address}}</div>
          <div style="font-size:9px; color:#64748b;">{{company.phone}}</div>
        </td>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${h}</div>
          <div>{{${b}.full_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{${b}.business_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{${b}.address}}</div>
          <div style="font-size:9px; color:#64748b;">{{${b}.mobile_1}} {{${b}.mobile_2}}</div>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:6px;">${g}</div>
  <div style="margin-top:6px;">${m}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:10px;">
    <tbody>
      <tr data-print-optional-field="record.description">
        <td style="width:26%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; font-weight:800; background:rgba(var(--brand-50-rgb),0.32);">توضیحات</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px; ${x(10)}">{{record.description}}</td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),footerHtml:E().trim(),createdAt:r,updatedAt:r},{id:"default_invoice_practical_a4",moduleId:t,scope:"record",title:t==="purchase_invoices"?"فاکتور کاربردی A4 خرید":"فاکتور کاربردی A4 فروش",description:"نسخه کاربردی A4 با چیدمان فشرده",paperSize:"A4",orientation:"portrait",isActive:!0,isSystem:!0,showHeader:!0,showFooter:!0,headerHeight:78,footerHeight:54,pageMarginTop:7,pageMarginRight:7,pageMarginBottom:7,pageMarginLeft:7,headerHtml:P(t).trim(),contentHtml:`<div style="direction:rtl; color:#111827; font-family:inherit; font-size:11px; line-height:1.75;">
  <table style="width:100%; border-collapse:collapse; font-size:10px;">
    <tbody>
      <tr>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; background:rgba(var(--brand-50-rgb),0.16); vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${A}</div>
          <div>{{company.company_full_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{company.address}}</div>
          <div style="font-size:9px; color:#64748b;">{{company.phone}}</div>
        </td>
        <td style="width:50%; border:1px solid var(--table-border-color, #d1d5db); padding:4px; vertical-align:top;">
          <div style="font-weight:800; margin-bottom:3px; color:rgb(var(--brand-500-rgb));">مشخصات ${h}</div>
          <div>{{${b}.full_name}}</div>
          <div style="font-size:9px; color:#64748b;">{{${b}.address}}</div>
          <div style="font-size:9px; color:#64748b;">{{${b}.mobile_1}} {{${b}.mobile_2}}</div>
        </td>
      </tr>
    </tbody>
  </table>
  <div style="margin-top:6px;">${g}</div>
  <div style="margin-top:6px;">${m}</div>
  <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:10px;">
    <tbody>
      <tr data-print-optional-field="record.description">
        <td style="width:22%; border:1px solid var(--table-border-color, #d1d5db); padding:5px; font-weight:800; background:rgba(var(--brand-50-rgb),0.32);">توضیحات</td>
        <td style="border:1px solid var(--table-border-color, #d1d5db); padding:5px; ${x(10)}">{{record.description}}</td>
      </tr>
    </tbody>
  </table>
</div>`.trim(),footerHtml:E().trim(),createdAt:r,updatedAt:r},d,o,i,a,l,s];return e==="all"?T:T.filter(p=>p.scope===e)},ze=(t,e=[])=>{const r=se(t);if(r.length===0)return e;const d=[...e],o=new Map(d.map((i,a)=>[i.id,a]));return r.forEach(i=>{const a=o.get(i.id);if(a===void 0){d.push(i),o.set(i.id,d.length-1);return}const l=d[a];String(l.id||"").startsWith("default_")&&(d[a]={...i,isActive:l.isActive,selectedFieldKeys:Array.isArray(l.selectedFieldKeys)&&l.selectedFieldKeys.length>0?l.selectedFieldKeys:i.selectedFieldKeys,backgroundImageUrl:l.backgroundImageUrl||i.backgroundImageUrl||null,backgroundSizing:l.backgroundSizing||i.backgroundSizing,isSystem:!0,createdAt:l.createdAt||i.createdAt,updatedAt:l.updatedAt||i.updatedAt})}),d},He=(t,e)=>{if(!(e!=null&&e.isSystem))return e;const r=Array.isArray(e.selectedFieldKeys)?e.selectedFieldKeys.map(o=>String(o||"").trim()).filter(Boolean):[],d=o=>String(o||"").replace(/{{\s*system\.compact_fields_table\s*}}/g,Ot(t,r)).replace(/{{\s*system\.compact_tables_blocks\s*}}/g,Dt(t,r)).replace(/{{\s*system\.package_summary_table\s*}}/g,Nt(t));return{...e,selectedFieldKeys:void 0,headerHtml:d(e.headerHtml),contentHtml:d(e.contentHtml),footerHtml:d(e.footerHtml)}},H=t=>String(t||"").trim(),nt=(t,e)=>{const r=H(t);if(!r)return!1;if(!e)return!0;if(r==="responsible.name")return e("assignee_id")!==!1;if(r.startsWith("record.")){const d=H(r.replace(/^record\./,""));return d?e(d)!==!1:!0}if(r.startsWith("block.")){const[,d,...o]=r.split("."),i=H(d);if(!i)return!0;if(e(i)===!1)return!1;const a=H(o.join("."));return a?e(a)!==!1&&e(`${i}.${a}`)!==!1:!0}return!0},Me=(t,e)=>(t||[]).filter(r=>nt(String((r==null?void 0:r.value)||""),e)),Fe=(t,e)=>(t||[]).filter(r=>nt(String((r==null?void 0:r.key)||""),e)),Le=(t,e)=>{const r=new Set(Array.from(e).map(o=>H(o)).filter(Boolean)),d=Array.isArray(t)?t:[];return Array.from(new Set(d.map(o=>H(o)).filter(o=>o&&r.has(o))))};export{w as P,Fe as a,Se as b,F as c,P as d,se as e,Me as f,Ae as g,He as h,_e as i,f as j,$e as k,we as l,ze as m,Te as n,ke as o,ve as p,nt as q,Kt as r,Le as s,ue as t,fe as u,me as v,he as w,Q as x,te as y};
