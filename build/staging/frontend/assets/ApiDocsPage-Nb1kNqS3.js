import{j as e}from"./brand-loading-DylTKg69.js";import{a as b,y as C,bY as O,ch as B,bZ as z,A as U,b$ as $}from"./ant-icons-vendor-Uj5X7Obb.js";import{M as E,p as L,a7 as S}from"./module-registry-BuqlWO-Q.js";import{_ as P}from"./App-DCKYogf8.js";import{T as H}from"./index-C5-r2qPC.js";import{M as D}from"./index-Cpg8VDTC.js";import{A as v}from"./TextArea-B2hzuXo9.js";import{F as R}from"./Table-lnmkSsP2.js";import{T as q}from"./index-CfxqHCSb.js";import{T as g}from"./index-DtzaLaXC.js";import{I as N}from"./index-B6NI-hO5.js";import"./supabase-vendor-DND0E3BL.js";import"./index-DsrJeAd4.js";import"./editor-vendor-B8AwQmYb.js";import"./popupContainer-CMeusm6O.js";import"./progress-NXNJwGNJ.js";import"./PublicThemeBoundary-CK4v_-mW.js";import"./PwaInstallPrompt-YFA7sO94.js";import"./index-DFG28JlS.js";import"./index-XG9GQXra.js";import"./index-B14dTq-J.js";import"./addEventListener-Bb4CYqFv.js";import"./index-C2TA9I7n.js";import"./index-BXZpe1co.js";import"./uploadProgressStore-YgYUYREk.js";import"./messageAttachments-BKGmyu9J.js";import"./colors-BfO6A7M_.js";import"./index-hZlHz5xy.js";import"./index-Bk1QGZTs.js";import"./index-ClG64FBI.js";import"./index-DlDTUH9V.js";import"./index-CjDSSr6-.js";import"./Pagination-_QH198Gb.js";import"./fa-CbQAMVtZ.js";const{Sider:w,Content:M}=P,{Title:o,Text:_,Paragraph:u}=H,G=L.supabaseUrl||"{SUPABASE_URL}",k=`${G}/functions/v1/api-gateway`,T=[{key:"crm",label:"فروش و CRM",plan:"basic",modules:["customers","suppliers","invoices","purchase_invoices","sales_return_invoices","purchase_return_invoices","price_lists","delivery_forms","marketing_leads","personas"]},{key:"warehouse",label:"محصولات و انبار",plan:"basic",modules:["products","product_bundles","warehouses","shelves","stock_transfers","barters"]},{key:"production",label:"تولید",plan:"enterprise",modules:["production_orders","production_boms","production_group_orders"]},{key:"accounting",label:"حسابداری",plan:"professional",modules:["fiscal_years","chart_of_accounts","journal_entries","accounting_event_rules","cost_centers","cash_boxes","bank_accounts","petty_funds","cheques","cash_bank_operations","expense_documents","assets"]},{key:"hr",label:"منابع انسانی",plan:"professional",modules:["employees","attendance_logs","work_schedules","leave_requests","overtime_requests","mission_requests","employee_advances","employee_bonus_requests","employee_penalty_requests","employee_contracts","payroll_slips","recruitment_applicants","job_descriptions"]},{key:"process",label:"پروژه و فرآیند",plan:"enterprise",modules:["projects","tasks","process_templates","process_runs","instructions","web_forms","surveys","secretariat_documents"]}],F={basic:{label:"پلن پایه",color:"blue"},professional:{label:"پلن حرفه‌ای",color:"purple"},enterprise:{label:"پلن سازمانی",color:"gold"}},K={text:"متن",long_text:"متن بلند",superlongtext:"متن خیلی بلند",number:"عدد",price:"قیمت",percentage:"درصد",checkbox:"بله/خیر",date:"تاریخ",time:"زمان",datetime:"تاریخ و زمان",select:"انتخابی",multi_select:"چند انتخابی",status:"وضعیت",relation:"ارتباط",multi_relation:"ارتباط چندگانه",user:"کاربر",image:"تصویر",phone:"تلفن",link:"لینک",json:"JSON",tags:"برچسب",stock:"موجودی",location:"موقعیت",checklist:"چک‌لیست",progress_stages:"مراحل پیشرفت",percentage_or_amount:"درصد یا مبلغ",readonly_lookup:"نمایشی"},W=({method:i})=>{const r={GET:"#52c41a",POST:"#1677ff",PATCH:"#fa8c16",DELETE:"#ff4d4f"};return e.jsx("span",{style:{background:r[i]??"#666",color:"#fff",borderRadius:4,padding:"2px 8px",fontFamily:"monospace",fontSize:12,fontWeight:700,letterSpacing:1,display:"inline-block",minWidth:60,textAlign:"center"},children:i})},n=({code:i})=>{const[r,p]=b.useState(!1),d=()=>{navigator.clipboard.writeText(i).then(()=>{p(!0),setTimeout(()=>p(!1),1500)})};return e.jsxs("div",{style:{position:"relative",marginBottom:16},children:[e.jsx("pre",{style:{background:"#0d1117",color:"#e6edf3",borderRadius:8,padding:"16px 40px 16px 16px",fontSize:12.5,lineHeight:1.7,overflowX:"auto",margin:0,direction:"ltr",textAlign:"left"},children:i}),e.jsx(N,{size:"small",type:"text",style:{position:"absolute",top:6,right:6,color:"#8b949e"},onClick:d,children:r?"✓":"کپی"})]})},J=()=>e.jsxs("div",{children:[e.jsx(o,{level:2,children:"API تازه سیستم"}),e.jsx(u,{children:"از طریق این API می‌توانید به داده‌های سازمان خود (مشتریان، فاکتورها، کارمندان و...) دسترسی داشته باشید و با سیستم‌های دیگر یکپارچه شوید."}),e.jsx(v,{type:"info",showIcon:!0,message:"نقطه پایانی واحد",description:e.jsxs("span",{children:["همه درخواست‌ها به آدرس ",e.jsx("code",{style:{direction:"ltr",display:"inline-block"},children:k})," ارسال می‌شوند."]}),style:{marginBottom:24}}),e.jsx(o,{level:4,children:"ویژگی‌های اصلی"}),e.jsxs("ul",{style:{paddingRight:20,lineHeight:2},children:[e.jsx("li",{children:"دسترسی به تمام ماژول‌های سازمانی (بر اساس پلن)"}),e.jsx("li",{children:"فیلتر پیشرفته، جستجو، مرتب‌سازی، صفحه‌بندی"}),e.jsx("li",{children:"خواندن و نوشتن — GET، POST، PATCH، DELETE"}),e.jsx("li",{children:"Expand کردن روابط (مثلاً نام مشتری در فاکتور)"}),e.jsx("li",{children:"جداسازی کامل داده — هر org فقط داده خود را می‌بیند"})]})]}),X=()=>e.jsxs("div",{children:[e.jsx(o,{level:2,children:"احراز هویت"}),e.jsxs(u,{children:["توکن API را از بخش ",e.jsx("strong",{children:"تنظیمات > اتصالات > توکن‌های API"})," دریافت کنید و در هدر هر درخواست ارسال کنید."]}),e.jsx(o,{level:4,children:"هدر احراز هویت"}),e.jsx(n,{code:"Authorization: Bearer {API_TOKEN}"}),e.jsx(o,{level:4,children:"نمونه با JavaScript (fetch)"}),e.jsx(n,{code:`const response = await fetch('${k}', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    table: 'customers',
    method: 'GET',
    limit: 20,
    offset: 0,
  }),
});
const { data, count, error } = await response.json();`}),e.jsx(o,{level:4,children:"نمونه با curl"}),e.jsx(n,{code:`curl -X POST '${k}' \\
  -H 'Authorization: Bearer YOUR_API_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"table":"customers","method":"GET","limit":20}'`}),e.jsx(v,{type:"warning",showIcon:!0,message:"امنیت توکن",description:"توکن API را در کد منبع عمومی قرار ندهید. از متغیرهای محیطی یا vault استفاده کنید.",style:{marginTop:16}})]}),Y=()=>e.jsxs("div",{children:[e.jsx(o,{level:2,children:"ویژگی‌های کوئری"}),e.jsx(o,{level:4,children:"فیلتر"}),e.jsxs(u,{children:["با استفاده از ",e.jsx("code",{children:"filters"})," می‌توانید نتایج را محدود کنید:"]}),e.jsx(n,{code:`{
  "table": "invoices",
  "method": "GET",
  "filters": {
    "status": { "op": "eq", "value": "confirmed" },
    "created_at": { "op": "gte", "value": "2024-01-01" },
    "total_amount": { "op": "gt", "value": 1000000 }
  }
}`}),e.jsx(R,{size:"small",pagination:!1,dataSource:[{op:"eq",desc:"برابر",ex:'"status": { "op": "eq", "value": "active" }'},{op:"neq",desc:"نابرابر",ex:'"status": { "op": "neq", "value": "deleted" }'},{op:"gt",desc:"بزرگ‌تر",ex:'"amount": { "op": "gt", "value": 0 }'},{op:"gte",desc:"بزرگ‌تر یا مساوی",ex:'"date": { "op": "gte", "value": "2024-01-01" }'},{op:"lt",desc:"کوچک‌تر",ex:'"qty": { "op": "lt", "value": 10 }'},{op:"lte",desc:"کوچک‌تر یا مساوی",ex:'"qty": { "op": "lte", "value": 100 }'},{op:"like",desc:"شامل (حساس)",ex:'"name": { "op": "like", "value": "%علی%" }'},{op:"ilike",desc:"شامل (غیرحساس)",ex:'"name": { "op": "ilike", "value": "%ali%" }'},{op:"in",desc:"در لیست",ex:'"status": { "op": "in", "value": ["a","b"] }'},{op:"is",desc:"null یا not null",ex:'"deleted_at": { "op": "is", "value": null }'}],columns:[{title:"عملگر",dataIndex:"op",width:80,render:i=>e.jsx("code",{children:i})},{title:"توضیح",dataIndex:"desc",width:160},{title:"مثال",dataIndex:"ex",render:i=>e.jsx("code",{style:{fontSize:11},children:i})}],rowKey:"op",style:{marginBottom:24}}),e.jsx(o,{level:4,children:"جستجو (search)"}),e.jsx(n,{code:`{
  "table": "customers",
  "method": "GET",
  "search": {
    "columns": ["full_name", "mobile_1", "business_name"],
    "query": "علی"
  }
}`}),e.jsx(o,{level:4,children:"مرتب‌سازی (order)"}),e.jsx(n,{code:`{
  "table": "invoices",
  "method": "GET",
  "order": { "column": "created_at", "ascending": false }
}`}),e.jsx(o,{level:4,children:"صفحه‌بندی (pagination)"}),e.jsx(n,{code:`{
  "table": "products",
  "method": "GET",
  "limit": 50,
  "offset": 0
}`}),e.jsxs(u,{type:"secondary",children:["حداکثر ",e.jsx("code",{children:"limit"})," قابل استفاده: ۱۰۰۰ رکورد در هر درخواست."]}),e.jsx(o,{level:4,children:"انتخاب فیلدها (select)"}),e.jsx(u,{children:"می‌توانید فقط فیلدهای موردنیاز را دریافت کنید و روابط را expand کنید:"}),e.jsx(n,{code:`{
  "table": "invoices",
  "method": "GET",
  "select": "id,system_code,status,total_amount,customer_id(id,full_name,mobile_1)"
}`}),e.jsx(o,{level:4,children:"Relation fields"}),e.jsxs(u,{children:["فیلدهایی که به جدول دیگری اشاره دارند (نوع ",e.jsx("code",{children:"relation"})," یا ",e.jsx("code",{children:"user"}),") می‌توانند در ",e.jsx("code",{children:"select"}),"با پرانتز expand شوند:"]}),e.jsx(n,{code:`// خواندن فاکتور با اطلاعات مشتری
{
  "table": "invoices",
  "select": "id,system_code,customer_id(id,full_name,mobile_1),items,total_amount"
}

// فیلتر بر اساس relation
{
  "table": "invoices",
  "filters": { "customer_id": { "op": "eq", "value": "UUID-OF-CUSTOMER" } }
}

// ایجاد رکورد با relation
{
  "table": "invoices",
  "method": "POST",
  "body": { "customer_id": "UUID", "items": [...], "invoice_date": "2024-01-01" }
}`})]}),Z=()=>e.jsxs("div",{children:[e.jsx(o,{level:2,children:"Webhooks خروجی"}),e.jsxs(u,{children:["با تعریف webhook در ",e.jsx("strong",{children:"تنظیمات > اتصالات"}),"، تازه سیستم رویدادها را بلادرنگ به سرور شما ارسال می‌کند."]}),e.jsx(o,{level:4,children:"فرمت Payload"}),e.jsx(n,{code:`{
  "event": "invoices.created",   // table.verb (created|updated|deleted)
  "table": "invoices",
  "record_id": "uuid-of-record",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "id": "...",
    "org_id": "...",
    "status": "draft",
    // ... سایر فیلدهای رکورد
  }
}`}),e.jsx(o,{level:4,children:"تأیید امضا (HMAC-SHA256)"}),e.jsxs(u,{children:["هر درخواست با هدر ",e.jsx("code",{children:"X-TazeSystem-Signature: sha256={HMAC}"})," امضا می‌شود. secret را از صفحه تعریف webhook دریافت کنید."]}),e.jsx(q,{items:[{key:"node",label:"Node.js",children:e.jsx(n,{code:`const crypto = require('crypto');

function verifySignature(payload, secret, signatureHeader) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

// در Express:
app.post('/webhooks/taze', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['x-tazesystem-signature'];
  if (!verifySignature(req.body, process.env.WEBHOOK_SECRET, sig)) {
    return res.status(401).send('Unauthorized');
  }
  const event = JSON.parse(req.body);
  console.log('Event:', event.event, event.data);
  res.sendStatus(200);
});`})},{key:"python",label:"Python",children:e.jsx(n,{code:`import hmac
import hashlib

def verify_signature(payload: bytes, secret: str, signature: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

# در Flask:
@app.route('/webhooks/taze', methods=['POST'])
def webhook():
    sig = request.headers.get('X-TazeSystem-Signature', '')
    if not verify_signature(request.data, WEBHOOK_SECRET, sig):
        abort(401)
    event = request.json
    print(f"Event: {event['event']}", event['data'])
    return '', 200`})}]})]}),Q=({moduleId:i,plan:r})=>{var A;const p=E[i];if(!p)return e.jsx(v,{type:"error",message:`ماژول ${i} پیدا نشد`});const d=p.table??i,m=((A=p.titles)==null?void 0:A.fa)??i,f=F[r],j=(p.fields??[]).filter(t=>!["org_id","deleted_at"].includes(t.key)),l=t=>K[t]??t,a=t=>[S.RELATION,S.MULTI_RELATION,S.USER].includes(t),h=[{title:"کلید (key)",dataIndex:"key",width:160,render:t=>e.jsx("code",{style:{fontSize:12},children:t})},{title:"عنوان فارسی",dataIndex:["labels","fa"],width:150,render:(t,s)=>{var c;return t??((c=s==null?void 0:s.label)==null?void 0:c.fa)??s.key}},{title:"نوع",dataIndex:"type",width:120,render:(t,s)=>{var y;const c=l(t);if(a(t)){const I=((y=s==null?void 0:s.relationConfig)==null?void 0:y.targetModule)??(s==null?void 0:s.targetModule)??"";return e.jsxs("span",{children:[e.jsx(g,{icon:e.jsx($,{}),color:"blue",children:c}),I&&e.jsxs(_,{type:"secondary",style:{fontSize:11},children:["→ ",I]})]})}return e.jsx(g,{children:c})}},{title:"ملاحظه",key:"note",render:(t,s)=>{const c=[];return s.isKey&&c.push("عنوان اصلی"),s.required&&c.push("الزامی"),s.nature==="system"&&c.push("خودکار"),s.nature==="predefined"&&c.push("سیستمی"),c.map(y=>e.jsx(g,{style:{fontSize:11},children:y},y))}}],x=i==="invoices"||i==="purchase_invoices";return e.jsxs("div",{children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:8},children:[e.jsx(o,{level:2,style:{margin:0},children:m}),f&&e.jsx(g,{color:f.color,children:f.label})]}),e.jsxs(_,{type:"secondary",style:{fontFamily:"monospace",display:"block",marginBottom:24},children:["جدول: ",d]}),e.jsx("div",{style:{marginBottom:24},children:[{method:"GET",desc:"دریافت لیست رکوردها (با فیلتر و صفحه‌بندی)"},{method:"POST",desc:"ایجاد رکورد جدید"},{method:"PATCH",desc:"ویرایش رکورد (با فیلتر مشخص‌کننده)"},{method:"DELETE",desc:"حذف رکورد (با فیلتر مشخص‌کننده)"}].map(({method:t,desc:s})=>e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12,marginBottom:8},children:[e.jsx(W,{method:t}),e.jsx("code",{style:{flex:1,fontSize:12,direction:"ltr",textAlign:"left"},children:k}),e.jsx(_,{type:"secondary",style:{fontSize:12},children:s})]},t))}),e.jsx(q,{items:[{key:"get",label:"GET — دریافت",children:e.jsx(n,{code:`// دریافت ${m}
{
  "table": "${d}",
  "method": "GET",
  "select": "*",
  "order": { "column": "created_at", "ascending": false },
  "limit": 50,
  "offset": 0
}`})},{key:"post",label:"POST — ایجاد",children:e.jsx(n,{code:`// ایجاد ${m} جدید
{
  "table": "${d}",
  "method": "POST",
  "body": {
    ${j.filter(t=>t.nature!=="system"&&t.nature!=="predefined").slice(0,5).map(t=>{var s;return`"${t.key}": null  // ${((s=t.labels)==null?void 0:s.fa)??t.key}`}).join(`,
    `)}
  }
}`})},{key:"patch",label:"PATCH — ویرایش",children:e.jsx(n,{code:`// ویرایش ${m}
{
  "table": "${d}",
  "method": "PATCH",
  "filters": { "id": { "op": "eq", "value": "RECORD_UUID" } },
  "body": {
    // فیلدهایی که می‌خواهید تغییر دهید
  }
}`})},{key:"delete",label:"DELETE — حذف",children:e.jsx(n,{code:`// حذف ${m}
{
  "table": "${d}",
  "method": "DELETE",
  "filters": { "id": { "op": "eq", "value": "RECORD_UUID" } }
}`})}]}),x&&e.jsx(v,{type:"info",showIcon:!0,style:{marginBottom:16},message:"فیلدهای JSONB در فاکتور",description:e.jsxs("div",{children:[e.jsxs("div",{children:[e.jsx("code",{children:"items"})," — آیتم‌های فاکتور (آرایه JSON): ",e.jsx("code",{children:JSON.stringify([{product_id:"uuid",qty:1,unit_price:1e5,discount:0}])})]}),e.jsxs("div",{style:{marginTop:6},children:[e.jsx("code",{children:"payments"})," — جدول دریافت‌ها (آرایه JSON): ",e.jsx("code",{children:JSON.stringify([{payment_type:"cash",amount:5e4,date:"2024-01-01",status:"confirmed"}])})]})]})}),e.jsx(o,{level:4,children:"فیلدها"}),e.jsx(R,{rowKey:"key",columns:h,dataSource:j,size:"small",pagination:!1,scroll:{x:600},style:{marginBottom:32}})]})},V=[{key:"intro",label:"مقدمه",icon:e.jsx(B,{})},{key:"auth",label:"احراز هویت",icon:e.jsx(z,{})},{key:"features",label:"ویژگی‌های کوئری",icon:e.jsx(U,{})},{key:"webhooks",label:"Webhooks",icon:e.jsx(O,{})}],Be=({isAdmin:i=!1})=>{const[r,p]=b.useState("intro"),[d,m]=b.useState(!1),f=b.useMemo(()=>[...V.map(l=>({key:l.key,label:l.label,icon:l.icon})),{type:"divider"},...T.map(l=>({key:l.key,label:l.label,icon:e.jsx(C,{}),children:l.modules.filter(a=>!!E[a]).map(a=>{var h,x;return{key:`module:${a}`,label:((x=(h=E[a])==null?void 0:h.titles)==null?void 0:x.fa)??a}})}))],[]),j=()=>{if(r==="intro")return e.jsx(J,{});if(r==="auth")return e.jsx(X,{});if(r==="features")return e.jsx(Y,{});if(r==="webhooks")return e.jsx(Z,{});if(r.startsWith("module:")){const l=r.slice(7),a=T.find(h=>h.modules.some(x=>x===l));return e.jsx(Q,{moduleId:l,plan:(a==null?void 0:a.plan)??"basic"})}return null};return e.jsxs(P,{style:{minHeight:"100vh",background:"#fff",direction:"rtl"},children:[e.jsxs(w,{width:260,collapsible:!0,collapsed:d,onCollapse:m,style:{background:"#fafafa",borderLeft:"1px solid #f0f0f0",overflow:"auto",height:"100vh",position:"sticky",top:0,right:0},theme:"light",children:[!d&&e.jsx("div",{style:{padding:"16px 16px 8px",borderBottom:"1px solid #f0f0f0",marginBottom:4},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8},children:[e.jsx(O,{style:{fontSize:20,color:"#1677ff"}}),e.jsx(_,{strong:!0,style:{fontSize:14},children:"API تازه سیستم"})]})}),e.jsx(D,{mode:"inline",selectedKeys:[r],defaultOpenKeys:T.map(l=>l.key),items:f,onClick:({key:l})=>p(l),style:{borderInlineEnd:"none",fontSize:13}})]}),e.jsx(M,{style:{padding:"40px 48px",maxWidth:900,margin:"0 auto",flex:1},children:j()})]})};export{Be as default};
