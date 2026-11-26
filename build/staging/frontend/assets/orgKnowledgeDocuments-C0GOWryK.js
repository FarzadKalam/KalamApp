import{l as $}from"./companySettings-DqYnePve.js";import{ar as T,E as v}from"./module-registry-BuqlWO-Q.js";import{p as w,s as E,a as M}from"./printAsPdf-4vEDQFze.js";import{p as A}from"./printInIframe-bCKQ84hU.js";const z=e=>{if(!e||!e.trim())return"";if(!/<[a-z]/i.test(e))return e.trim();const t=document.createElement("div");return t.innerHTML=e,t.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, tr").forEach(i=>{i.insertAdjacentText("beforebegin",`
`)}),t.querySelectorAll("br").forEach(i=>{i.replaceWith(`
`)}),(t.textContent||"").replace(/\n{3,}/g,`

`).trim()},_=e=>Array.isArray(e)?Array.from(new Set(e.map(t=>String(t||"").trim()).filter(Boolean))):[],Y=(e,t,r,i)=>{const o=_(e),n=_(t);if(o.length===0&&n.length===0)return"همه سازمان";const s=new Map(r.map(a=>[a.value,a.label])),l=new Map(i.map(a=>[a.value,a.label])),c=[...o.slice(0,2).map(a=>s.get(a)).filter(Boolean),...n.slice(0,2).map(a=>l.get(a)).filter(Boolean)];if(c.length>0){const a=Math.max(0,o.length+n.length-c.length);return a>0?`${c.join("، ")} +${a.toLocaleString("fa-IR")}`:c.join("، ")}return[o.length?`${o.length.toLocaleString("fa-IR")} شخص`:"",n.length?`${n.length.toLocaleString("fa-IR")} نقش`:""].filter(Boolean).join("، ")},B="business_model_canvas",g="business_model_canvas",y="بوم کسب و کار",h=[{key:"key_partners",title:"شرکای کلیدی",shortTitle:"شرکا",helper:"تامین‌کنندگان، همکاران راهبردی و بازیگرانی که بدون آن‌ها اجرای مدل سخت می‌شود.",placeholder:`مثال: تامین‌کننده اصلی مواد اولیه
مثال: شریک توزیع در استان‌ها`,desktopClassName:"xl:col-[1/3] xl:row-[1/5]",accentClassName:"from-[#f6efe6] via-[#fff8f0] to-[#f8efe5]"},{key:"key_activities",title:"فعالیت‌های کلیدی",shortTitle:"فعالیت‌ها",helper:"مهم‌ترین کارهایی که باید عالی انجام شوند تا ارزش پیشنهادی تحویل شود.",placeholder:`مثال: طراحی و توسعه محصول
مثال: فروش و پیگیری مشتریان`,desktopClassName:"xl:col-[3/5] xl:row-[1/3]",accentClassName:"from-[#eef6eb] via-[#f9fff7] to-[#ecf8ef]"},{key:"key_resources",title:"منابع کلیدی",shortTitle:"منابع",helper:"دارایی‌ها، تیم، دانش، ابزارها و زیرساخت‌هایی که مدل به آن‌ها وابسته است.",placeholder:`مثال: تیم فروش باتجربه
مثال: برند شناخته‌شده`,desktopClassName:"xl:col-[3/5] xl:row-[3/5]",accentClassName:"from-[#ebf4ff] via-[#f7fbff] to-[#eef6ff]"},{key:"value_propositions",title:"ارزش‌های پیشنهادی",shortTitle:"ارزش پیشنهادی",helper:"دلیل اصلی انتخاب شما توسط مشتری؛ چه مسئله‌ای را حل می‌کنید و چه ارزشی خلق می‌شود.",placeholder:`مثال: تحویل سریع‌تر از رقبا
مثال: کاهش خطای اجرایی برای مشتری`,desktopClassName:"xl:col-[5/7] xl:row-[1/5]",accentClassName:"from-[#fff0d8] via-[#fff8ed] to-[#ffefda]"},{key:"customer_relationships",title:"ارتباط با مشتری",shortTitle:"ارتباط",helper:"شیوه جذب، نگهداشت و توسعه رابطه با مشتری در طول زمان.",placeholder:`مثال: پشتیبانی واتساپی
مثال: مدیر حساب اختصاصی`,desktopClassName:"xl:col-[7/9] xl:row-[1/3]",accentClassName:"from-[#f7ebff] via-[#fcf7ff] to-[#f7eeff]"},{key:"channels",title:"کانال‌ها",shortTitle:"کانال‌ها",helper:"مسیرهایی که از آن‌ها مشتری شما را پیدا می‌کند، خرید می‌کند یا خدمت را دریافت می‌کند.",placeholder:`مثال: اینستاگرام
مثال: فروش مستقیم سازمانی`,desktopClassName:"xl:col-[7/9] xl:row-[3/5]",accentClassName:"from-[#e9f8f7] via-[#f5fffe] to-[#eaf8f7]"},{key:"customer_segments",title:"بخش‌های مشتریان",shortTitle:"بخش‌ها",helper:"گروه‌های اصلی مشتری که برایشان ارزش خلق می‌کنید و باید جداگانه فهم شوند.",placeholder:`مثال: شرکت‌های تولیدی متوسط
مثال: فروشگاه‌های زنجیره‌ای`,desktopClassName:"xl:col-[9/11] xl:row-[1/5]",accentClassName:"from-[#fdecef] via-[#fff7f8] to-[#fceef1]"},{key:"cost_structure",title:"ساختار هزینه‌ها",shortTitle:"هزینه‌ها",helper:"مهم‌ترین هزینه‌های ثابت و متغیر مدل کسب‌وکار شما.",placeholder:`مثال: حقوق تیم اجرایی
مثال: تبلیغات و جذب مشتری`,desktopClassName:"xl:col-[1/6] xl:row-[5/7]",accentClassName:"from-[#f2efe9] via-[#faf8f4] to-[#f2eee7]"},{key:"revenue_streams",title:"جریان‌های درآمدی",shortTitle:"درآمد",helper:"روش‌های اصلی درآمدزایی و اینکه مشتری بابت چه چیزی پول می‌پردازد.",placeholder:`مثال: فروش اشتراک ماهانه
مثال: کارمزد اجرا`,desktopClassName:"xl:col-[6/11] xl:row-[5/7]",accentClassName:"from-[#edf5e7] via-[#f8fff4] to-[#eef8eb]"}],H=e=>String(e||"").replace(/\r\n/g,`
`).trim(),u=e=>String(e||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"),I=()=>({key_partners:[],key_activities:[],key_resources:[],value_propositions:[],customer_relationships:[],channels:[],customer_segments:[],cost_structure:[],revenue_streams:[]}),O=e=>{const t=I();if(!e||typeof e!="object")return t;const r=e;return h.forEach(i=>{const o=Array.isArray(r[i.key])?r[i.key]:[];t[i.key]=o.map(H).filter(Boolean)}),t},D=e=>h.some(t=>e[t.key].length>0),q=e=>{const t=D(e),r=t?"این بوم کسب و کار توسط سازمان تکمیل شده است و می‌تواند به‌عنوان بخشی از دانش سازمان برای هوش مصنوعی استفاده شود.":"این بوم کسب و کار هنوز تکمیل نشده است و فعلاً فقط قالب استاندارد آن برای سازمان ثبت شده است.",i=h.map(s=>{const l=e[s.key],c=l.length>0?l.map(a=>`- ${a}`):["- تکمیل نشده"];return`${s.title}
${c.join(`
`)}`}),o=[y,"",r,"",...i.flatMap((s,l)=>l===0?[s]:["",s])].join(`
`),n=`
    <div dir="rtl" data-system-key="${g}">
      <h1>${u(y)}</h1>
      <p>${u(r)}</p>
      ${h.map(s=>{const l=e[s.key],c=(l.length>0?l:["تکمیل نشده"]).map(a=>`<li>${u(a)}</li>`).join("");return`
          <section>
            <h2>${u(s.title)}</h2>
            <ul>${c}</ul>
          </section>
        `}).join("")}
    </div>
  `.trim();return{body:o,body_html:n,metadata:{system_key:g,is_system_default:!0,canvas_layout:"osterwalder_standard",canvas_version:1,completion_ratio:Math.round(h.filter(s=>e[s.key].length>0).length/h.length*100),sections:e,default_template:!t}}},R=e=>O(e==null?void 0:e.sections),W=e=>{var t;return String((e==null?void 0:e.document_type)||"").trim()===B||String(((t=e==null?void 0:e.metadata)==null?void 0:t.system_key)||"").trim()===g},f=e=>String(e||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"),b=e=>String(e||"").replace(/[\\/:*?"<>|]/g,"_").replace(/\s+/g," ").trim()||"سند دانش سازمان",x=()=>{const e=new Date().toISOString(),t=T(e,"YYYY/MM/DD HH:mm")||"";return t?v(t):v(e)},k=(e,t,r)=>`
  <table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:10px; border:1px solid rgba(148,163,184,0.28); border-radius:12px; overflow:hidden;">
    <tbody>
      <tr>
        <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:5px 7px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
          <div style="display:flex; align-items:flex-start; gap:8px;">
            ${e.logoUrl?`<img src="${f(e.logoUrl)}" alt="لوگو" style="display:block; width:34px; height:34px; max-width:34px; max-height:34px; object-fit:contain;" />`:""}
            <div style="min-width:0;">
              <div style="font-weight:700; font-size:11px; line-height:1.55; overflow-wrap:anywhere;">${f(e.companyName||"سازمان")}</div>
              ${e.tradeName?`<div style="font-size:9px; color:#6b7280; line-height:1.55; overflow-wrap:anywhere;">${f(e.tradeName)}</div>`:""}
            </div>
          </div>
        </td>
        <td style="width:32%; vertical-align:middle; text-align:center; border:none; padding:5px 8px; background:rgba(var(--brand-500-rgb),0.08); overflow-wrap:anywhere;">
          <div style="font-weight:800; font-size:14px; line-height:1.55; color:rgb(var(--brand-500-rgb));">${f(t)}</div>
        </td>
        <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:5px 7px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
          <div style="display:flex; flex-direction:column; gap:2px; font-size:9px; line-height:1.55;">
            <div>زمان چاپ: ${f(r)}</div>
            ${e.phone?`<div>تلفن: ${f(e.phone)}</div>`:""}
            ${e.website?`<div style="direction:ltr; text-align:left;">${f(e.website)}</div>`:""}
          </div>
        </td>
      </tr>
    </tbody>
  </table>
`.trim(),d=(e,t)=>{const r=e.map(s=>String(s||"").trim()).filter(Boolean),i=Math.max(18,Math.floor(t*1.45)),o=r.reduce((s,l)=>s+Math.max(1,Math.ceil(l.length/i)),0),n=r.length>0?o*4.8+r.length*.9:7;return Math.max(25,Math.ceil(13+n+7))},m=e=>e.length?`
    <ul style="margin:0; padding:0 14px 0 0; list-style:disc; line-height:1.8; overflow:visible; overflow-wrap:anywhere; word-break:break-word;">
      ${e.map(t=>`<li style="margin:0 0 1.2mm; overflow:visible; overflow-wrap:anywhere; word-break:break-word;">${f(t)}</li>`).join("")}
    </ul>
  `.trim():'<div style="color:#94a3b8;">تکمیل نشده</div>',p=(e,t)=>{const r=h.find(i=>i.key===e);return r?`
    <div style="min-height:${t}mm; height:auto; box-sizing:border-box; border:1px solid #94a3b8; padding:3.5mm 3mm; display:flex; flex-direction:column; overflow:visible; overflow-wrap:anywhere; word-break:break-word; break-inside:avoid; page-break-inside:avoid;">
      <div style="font-weight:800; font-size:12.5px; margin-bottom:2mm;">${f(r.title)}</div>
      <div style="font-size:10.5px; color:#111827; overflow:visible; overflow-wrap:anywhere; word-break:break-word;">__CONTENT__</div>
    </div>
  `.trim():""},F=async e=>{const r=(await $(e)).data||{};return{companyName:String(r.company_full_name||r.company_name||"سازمان").trim(),tradeName:String(r.trade_name||"").trim(),logoUrl:String(r.logo_url||"").trim(),phone:String(r.phone||r.mobile||"").trim(),website:String(r.website||"").trim()}},G=e=>{const t=x();return`
    <div class="invoice-custom-print-shell" dir="rtl">
      <div class="print-template-page" style="width:210mm; min-height:297mm; box-sizing:border-box; padding:12mm; background:#fff; color:#111827; direction:rtl;">
        ${k(e.company,e.title,t)}
        <div style="margin-top:10mm; font-family:inherit; direction:rtl; line-height:1.95; font-size:12px;">
          ${e.bodyHtml}
        </div>
      </div>
    </div>
  `.trim()},J=e=>{const t=x(),r={narrow:47,medium:53,wide:55},i={key_partners:d(e.sections.key_partners,r.narrow),key_activities:d(e.sections.key_activities,r.medium),key_resources:d(e.sections.key_resources,r.medium),value_propositions:d(e.sections.value_propositions,r.wide),customer_relationships:d(e.sections.customer_relationships,r.medium),channels:d(e.sections.channels,r.medium),customer_segments:d(e.sections.customer_segments,r.narrow),cost_structure:d(e.sections.cost_structure,150),revenue_streams:d(e.sections.revenue_streams,150)},o=p("key_partners",i.key_partners).replace("__CONTENT__",m(e.sections.key_partners)),n=p("key_activities",i.key_activities).replace("__CONTENT__",m(e.sections.key_activities)),s=p("key_resources",i.key_resources).replace("__CONTENT__",m(e.sections.key_resources)),l=p("value_propositions",i.value_propositions).replace("__CONTENT__",m(e.sections.value_propositions)),c=p("customer_relationships",i.customer_relationships).replace("__CONTENT__",m(e.sections.customer_relationships)),a=p("channels",i.channels).replace("__CONTENT__",m(e.sections.channels)),S=p("customer_segments",i.customer_segments).replace("__CONTENT__",m(e.sections.customer_segments)),N=p("cost_structure",i.cost_structure).replace("__CONTENT__",m(e.sections.cost_structure)),C=p("revenue_streams",i.revenue_streams).replace("__CONTENT__",m(e.sections.revenue_streams));return`
    <div class="invoice-custom-print-shell" dir="rtl">
      <div class="print-template-page" style="width:297mm; min-height:210mm; box-sizing:border-box; padding:5mm; background:#fff; color:#111827; direction:rtl;">
        ${k(e.company,y,t)}
        <div style="margin-top:2.5mm;">
          <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <tbody>
              <tr>
                <td style="width:19%; vertical-align:top; padding:0;">${o}</td>
                <td style="width:21%; vertical-align:top; padding:0 0 0 0;">
                  <div style="display:flex; flex-direction:column; gap:0;">
                    ${n}
                    ${s}
                  </div>
                </td>
                <td style="width:21%; vertical-align:top; padding:0;">${l}</td>
                <td style="width:20.5%; vertical-align:top; padding:0;">
                  <div style="display:flex; flex-direction:column; gap:0;">
                    ${c}
                    ${a}
                  </div>
                </td>
                <td style="width:18.5%; vertical-align:top; padding:0;">${S}</td>
              </tr>
              <tr>
                <td colspan="3" style="vertical-align:top; padding:0;">${N}</td>
                <td colspan="2" style="vertical-align:top; padding:0;">${C}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `.trim()},Q=async e=>{await w({pageSize:e.pageSize,sourceHtml:e.sourceHtml,title:e.title,filename:b(e.filename||e.title)})},X=async e=>{if(E()){const t=M(e.title);await w({pageSize:e.pageSize,sourceHtml:e.sourceHtml,title:e.title,filename:b(e.title),targetWindow:t,openInPdfViewer:!0});return}await A({pageSize:e.pageSize,sourceHtml:e.sourceHtml,title:e.title})},L=e=>{const t=String(e||"").replace(/\r\n/g,`
`).split(/\n{2,}/).map(n=>n.trim()).filter(Boolean),r=[];let i="";const o=1200;return t.forEach(n=>{if(!i){i=n;return}if(`${i}

${n}`.length<=o){i=`${i}

${n}`;return}r.push(i),i=n}),i&&r.push(i),r.length===0&&e.trim()&&r.push(e.trim().slice(0,o)),r.flatMap(n=>{if(n.length<=o)return[n];const s=[];for(let l=0;l<n.length;l+=o)s.push(n.slice(l,l+o));return s})},P=e=>{let t=5381;for(let r=0;r<e.length;r+=1)t=(t<<5)+t+e.charCodeAt(r),t&=4294967295;return Math.abs(t).toString(16)},Z=async(e,t)=>{const{error:r}=await e.from("document_chunks").delete().eq("document_id",t.id);if(r)throw r;if(t.status!=="active"||t.use_for_ai===!1)return;const i=t.body_html?z(t.body_html):t.body||"",o=L(i);if(o.length===0)return;const n=o.map((l,c)=>{var a;return{document_id:t.id,chunk_index:c,content:l,content_hash:P(l),token_estimate:Math.ceil(l.length/4),status:"active",allowed_user_ids:_(t.allowed_user_ids),allowed_role_ids:_(t.allowed_role_ids),metadata:{document_title:t.title,document_type:t.document_type||"general",system_key:((a=t==null?void 0:t.metadata)==null?void 0:a.system_key)||null}}}),{error:s}=await e.from("document_chunks").insert(n);if(s)throw s},ee=async(e,t)=>{const{data:r,error:i}=await e.functions.invoke("ai-assistant",{body:{action:"embed_document_chunks",documentId:t.id}});if(i)throw i;if(r!=null&&r.error)throw new Error(String(r.error));return r};export{B,y as a,G as b,g as c,Q as d,q as e,Y as f,I as g,z as h,W as i,ee as j,h as k,F as l,D as m,_ as n,R as o,X as p,J as q,Z as r};
