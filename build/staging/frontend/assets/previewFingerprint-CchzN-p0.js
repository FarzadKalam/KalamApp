import{j as e}from"./brand-loading-DylTKg69.js";import{bJ as Le,c3 as me,ae as ue,aE as ft,a as l,aD as bt,bt as vt,cX as yt,aG as wt}from"./ant-icons-vendor-Uj5X7Obb.js";import{r as jt}from"./editor-vendor-B8AwQmYb.js";import{q as kt,o as Nt}from"./printAsPdf-4vEDQFze.js";import{r as St}from"./server.browser-XVSlFfh1.js";import{e as Ct}from"./printFieldCatalog-DSONDb_1.js";import{A as De}from"./AdaptiveSelectField-kVPKLLuK.js";import{A as zt}from"./AdaptiveIdentityPicker-_pO-wdLJ.js";import{I as d,A as Rt,Q as Et}from"./index-B6NI-hO5.js";import{E as $e}from"./index-ClG64FBI.js";import{T as de}from"./index-DtzaLaXC.js";import{C as xe}from"./index-Cpg8VDTC.js";import{S as Ie}from"./index-B1qsES6w.js";import{I as Be}from"./index-C2TA9I7n.js";import{M as At}from"./index-COm0fgxD.js";import{T as Pt}from"./index-CfxqHCSb.js";const $t=[{label:"کاربر سازمان",value:"profiles"},{label:"کارمند",value:"employees"},{label:"مشتری",value:"customers"},{label:"تامین‌کننده",value:"suppliers"}],Bt=a=>{switch(a.kind){case"ceo":return a.sourceDescription.replace(/\s+سازمان$/,"")||"مدیر سازمان";case"current_user":return"کاربر جاری";case"record_assignee":return"مسئول";case"record_relation":return"رابطه رکورد";case"selected_signer":return"انتخاب مستقیم";default:return"دستی"}},Lt=({rows:a,quickAddOptions:m,signatureOptionsByRow:c,onAddRow:b,onRemoveRow:S,onMoveRow:E,onToggleEnabled:A,onToggleAutomatic:u,onChangeName:V,onChangeSubtitle:U,onChangeSignerModule:p,onChangeSignerId:K,onSearchSignerOptions:F,onSave:C,saving:J=!1})=>e.jsxs("div",{className:"print-signature-pane",children:[e.jsxs("div",{className:"print-signature-toolbar",children:[e.jsx("div",{className:"print-signature-toolbar-copy",children:"چیدمان پیش‌نمایش و چاپ نهایی از همین ترتیب تبعیت می‌کند."}),e.jsxs("div",{className:"print-signature-toolbar-actions",children:[m.map(n=>e.jsx(d,{size:"small",icon:e.jsx(Le,{}),disabled:n.disabled,onClick:()=>b(n.key),children:n.label},n.key)),C?e.jsx(d,{type:"primary",size:"small",onClick:()=>{C()},loading:J,children:"ذخیره تغییرات"}):null]})]}),a.length===0?e.jsx("div",{className:"print-signature-empty",children:e.jsx($e,{image:$e.PRESENTED_IMAGE_SIMPLE,description:"هنوز ردیفی برای مهر و امضا تعریف نشده است."})}):e.jsx("div",{className:"print-signature-list",children:a.map((n,v)=>e.jsxs("div",{className:"print-signature-card",children:[e.jsxs("div",{className:"print-signature-card-header",children:[e.jsxs("div",{className:"print-signature-card-meta",children:[e.jsx("span",{className:"print-signature-card-index",children:v+1}),e.jsx(de,{color:n.automatic?"blue":"default",children:Bt(n)}),n.sourceDescription?e.jsx("span",{className:"print-signature-card-source",children:n.sourceDescription}):null,n.enabled?null:e.jsx(de,{children:"غیرفعال"}),n.enabled&&n.unresolved?e.jsx(de,{color:"orange",children:"بدون مقدار"}):null]}),e.jsxs("div",{className:"print-signature-card-actions",children:[e.jsx(d,{size:"small",icon:e.jsx(me,{}),disabled:v===0,onClick:()=>E(n.id,"up")}),e.jsx(d,{size:"small",icon:e.jsx(ue,{}),disabled:v===a.length-1,onClick:()=>E(n.id,"down")}),e.jsx(d,{size:"small",danger:!0,icon:e.jsx(ft,{}),onClick:()=>S(n.id)})]})]}),e.jsxs("div",{className:"print-signature-card-body",children:[e.jsxs("div",{className:"print-signature-auto-row",children:[e.jsx(xe,{checked:n.enabled,onChange:s=>A(n.id,s.target.checked),children:"نمایش امضا"}),e.jsx(xe,{checked:n.automatic,disabled:!n.enabled,onChange:s=>u(n.id,s.target.checked),children:"خودکار"})]}),n.enabled&&n.automatic&&n.kind==="selected_signer"?e.jsxs("div",{className:"print-signature-grid",children:[e.jsxs("div",{children:[e.jsx("div",{className:"print-signature-label",children:"نوع امضاکننده"}),e.jsx(Ie,{block:!0,size:"middle",value:n.signerModule||"customers",onChange:s=>p(n.id,s),options:$t})]}),e.jsxs("div",{children:[e.jsx("div",{className:"print-signature-label",children:"رکورد امضاکننده"}),n.signerModule==="profiles"?e.jsx(zt,{value:n.signerId||void 0,valueMode:"raw",scopes:["user"],onChange:s=>K(n.id,typeof s=="string"?s:null),allowClear:!0,placeholder:"انتخاب کاربر سازمان",pickerTitle:"انتخاب امضاکننده"}):e.jsx(De,{value:n.signerId||void 0,onChange:s=>K(n.id,s||null),options:c[n.id]||[],showSearch:!0,allowClear:!0,placeholder:"انتخاب کنید",optionFilterProp:"label",onSearch:s=>{const te=n.signerModule||"customers";F(n.id,te,s)},onFocus:()=>{const s=n.signerModule||"customers";F(n.id,s,"",n.signerId||null)}})]})]}):null,e.jsxs("div",{className:"print-signature-grid",children:[e.jsxs("div",{children:[e.jsx("div",{className:"print-signature-label",children:"زیرنویس نام امضا کننده"}),e.jsx(Be,{value:n.subtitleValue,disabled:!n.enabled,onChange:s=>U(n.id,s.target.value),placeholder:"مثلاً: امضای مدیر سازمان"})]}),e.jsxs("div",{children:[e.jsx("div",{className:"print-signature-label",children:"نام امضا کننده"}),e.jsx(Be,{value:n.nameValue,disabled:!n.enabled,onChange:s=>V(n.id,s.target.value),placeholder:"نام و نام خانوادگی"})]})]})]})]},n.id))})]}),Dt=500,It=(a="A4",m="portrait")=>{const c=a==="ROLL80"?{width:80,height:297}:a==="A7"?{width:74,height:105}:a==="A6"?{width:105,height:148}:a==="A5"?{width:148,height:210}:{width:210,height:297};return m==="landscape"?{mmWidth:c.height,mmHeight:c.width}:{mmWidth:c.width,mmHeight:c.height}},Gt=({isPrintModalOpen:a,onClose:m,onPrint:c,onPreparePrint:b,onSendInternalPdf:S,onSavePdfToRecord:E,onRefreshPreview:A,onGenerateFinalPdfPreview:u,previewContentVersion:V="",printTemplates:U,selectedTemplateId:p,onSelectTemplate:K,canEditPrintTemplates:F=!1,onEditTemplate:C,renderPrintCard:J,printMode:n,printableFields:v=[],selectedPrintFields:s={},onTogglePrintField:te=()=>{},onTogglePrintFieldGroup:Oe=()=>{},onMovePrintField:he=()=>{},imageDisplayMode:M="fit",onChangeImageDisplayMode:Fe=()=>{},onSavePrintFields:fe,savingPrintFields:be=!1,allowFieldSelectionTab:Me=!1,showImageDisplayModeControl:We=!1,printSignatureRows:W=[],printSignatureQuickAddOptions:He=[],signatureOptionsByRow:_e={},onAddPrintSignatureRow:qe=()=>{},onRemovePrintSignatureRow:Te=()=>{},onMovePrintSignatureRow:Ve=()=>{},onTogglePrintSignatureEnabled:Ue=()=>{},onTogglePrintSignatureAutomatic:Ke=()=>{},onChangePrintSignatureName:Je=()=>{},onChangePrintSignatureSubtitle:Xe=()=>{},onChangePrintSignatureSignerModule:Ye=()=>{},onChangePrintSignatureSignerId:Ze=()=>{},onSearchPrintSignatureOptions:Qe=()=>Promise.resolve(),previewMeta:y,modalZIndex:ie=1e3})=>{const{message:X}=Rt.useApp(),{token:g}=Et.useToken(),[z,ve]=l.useState("preview"),[Ge,ye]=l.useState(!1),[et,we]=l.useState(!1),[tt,je]=l.useState(!1),[ke,Ne]=l.useState(!1),[P,Y]=l.useState(1),[re,$]=l.useState(null),[ne,R]=l.useState(null),[Se,H]=l.useState(""),[it,rt]=l.useState(0),w=l.useRef(new Map),j=l.useRef(new Map),_=l.useRef(null),B=l.useRef(0),Ce=l.useRef(u),ae=l.useRef(async()=>null),le=l.useRef(null),L=l.useRef(null),[h,nt]=l.useState(()=>typeof window<"u"?window.innerWidth<768:!1),at=typeof CSS<"u"&&typeof CSS.supports=="function"&&CSS.supports("zoom","1");l.useEffect(()=>{if(!n)return;const t=()=>{document.body.classList.remove("print-mode")};return window.addEventListener("afterprint",t),document.body.classList.add("print-mode"),()=>{window.removeEventListener("afterprint",t),document.body.classList.remove("print-mode")}},[n]),l.useEffect(()=>{if(typeof window>"u")return;const t=()=>nt(window.innerWidth<768);return t(),window.addEventListener("resize",t),()=>window.removeEventListener("resize",t)},[]);const lt=!!p&&!!Me&&v.length>0,st=!!p,se=Object.prototype.hasOwnProperty.call(s,p),k=l.useMemo(()=>{const t=St({fields:v,selectedKeys:s[p]||[],hasExplicitSelection:se});return se?Ct(t,v):t},[se,v,s,p]),Z=l.useMemo(()=>new Set(k),[k]),ze=k.length,x=l.useMemo(()=>JSON.stringify({templateId:p,source:V,fields:k,imageDisplayMode:M,signatures:W.map(t=>({id:t.id,kind:t.kind,enabled:t.enabled,automatic:t.automatic,signerModule:t.signerModule,signerId:t.signerId,nameValue:t.nameValue,subtitleValue:t.subtitleValue}))}),[k,M,V,W,p]),ot=l.useMemo(()=>JSON.stringify({templateId:p,fields:k,imageDisplayMode:M,signatures:W.map(t=>({id:t.id,kind:t.kind,enabled:t.enabled,automatic:t.automatic,signerModule:t.signerModule,signerId:t.signerId,nameValue:t.nameValue,subtitleValue:t.subtitleValue}))}),[k,M,W,p]),pt=l.useMemo(()=>U.map(t=>({value:t.id,label:t.title,title:t.title,description:t.description,isSystem:t.isSystem})),[U]),oe=l.useCallback((t,i)=>{t.preventDefault(),t.stopPropagation(),C==null||C(i)},[C]),Re=l.useCallback(t=>{const i=t.data||t,r=String((i==null?void 0:i.value)||(t==null?void 0:t.value)||"").trim();return e.jsxs("div",{className:"print-template-option",children:[e.jsxs("div",{className:"print-template-option-copy",children:[e.jsxs("div",{className:"print-template-option-title",children:[e.jsx("span",{children:i==null?void 0:i.title}),i!=null&&i.isSystem?e.jsx("span",{className:"print-template-system-tag",children:"سیستمی"}):null]}),i!=null&&i.description?e.jsx("div",{className:"print-template-option-desc",children:i.description}):null]}),!(i!=null&&i.isSystem)&&F&&r?e.jsx(d,{type:"text",size:"small",icon:e.jsx(bt,{}),title:"ویرایش قالب در تب جدید","aria-label":`ویرایش قالب ${i.title||""}`,className:"print-template-option-edit",onMouseDown:o=>oe(o,r),onClick:o=>oe(o,r)}):null]})},[F,oe]),ct=l.useMemo(()=>{const t=new Map;return v.forEach(i=>{const r=String((i==null?void 0:i.group)||"سایر فیلدها").trim()||"سایر فیلدها";t.set(r,[...t.get(r)||[],i])}),Array.from(t.entries()).map(([i,r])=>({group:i,fields:r}))},[v]),Q=l.useMemo(()=>{const t=new Map(v.map(i=>[String((i==null?void 0:i.key)||"").trim(),i]));return k.map(i=>t.get(String(i||"").trim())).filter(Boolean)},[k,v]),G=It((y==null?void 0:y.paperSize)||"A4",(y==null?void 0:y.orientation)||"portrait"),pe=G.mmWidth*96/25.4,dt=G.mmHeight*96/25.4,ce=l.useCallback(()=>{const t=le.current;if(!t)return;const r=Math.max(120,t.clientWidth-28)/pe,o=Math.max(.35,Math.min(1.6,r));Y(Math.round(o*100)/100)},[pe]);l.useEffect(()=>{Ce.current=u},[u]);const ee=l.useCallback(t=>{const i=w.current.get(t);i&&(URL.revokeObjectURL(i.url),w.current.delete(t))},[]),D=l.useCallback(async(t=!1)=>{const i=Ce.current;if(!i)return null;t&&ee(x);const r=w.current.get(x);if(r)return H(""),R(null),$(r.url),r;const o=j.current.get(x);if(o)return o;const N=_.current;if(N){let f;return f=N.catch(()=>null).then(async()=>{const O=w.current.get(x);if(O)return O;j.current.get(x)===f&&j.current.delete(x);const T=await ae.current(!1);if(!T)throw new Error("ساخت PDF نهایی انجام نشد.");return T}).finally(()=>{j.current.get(x)===f&&j.current.delete(x)}),j.current.set(x,f),f}const I=++B.current;$(null),H(""),R({percent:5,label:"در حال آماده‌سازی پیش‌نمایش نهایی…"});const q=i(f=>{I===B.current&&R(f)}).then(f=>{const O={...f,url:URL.createObjectURL(f.blob)};for(w.current.set(x,O);w.current.size>8;){const T=w.current.keys().next().value;if(!T)break;ee(T)}return I===B.current&&($(O.url),R(null)),O}).catch(f=>{throw I===B.current&&(console.error("Generate final PDF preview failed",f),$(null),R(null),H("ساخت پیش‌نمایش نهایی PDF ناموفق بود. دوباره تلاش کنید.")),f}).finally(()=>{j.current.get(x)===q&&j.current.delete(x),_.current===q&&(_.current=null)});return j.current.set(x,q),_.current=q,q},[x,ee]);l.useEffect(()=>{ae.current=D},[D]),l.useEffect(()=>{if(!a||z!=="preview"||!u)return;const t=w.current.get(x);if(t){H(""),R(null),$(t.url);return}$(null),H(""),R({percent:3,label:"در حال همگام‌سازی اطلاعات قالب…"});const i=window.setTimeout(()=>{ae.current(!1).catch(()=>{})},Dt);return()=>{window.clearTimeout(i),B.current+=1}},[z,ot,it,a,!!u]),l.useEffect(()=>()=>{B.current+=1,w.current.forEach(t=>URL.revokeObjectURL(t.url)),w.current.clear(),j.current.clear(),_.current=null},[]),l.useEffect(()=>{if(!a||z!=="preview")return;let t=0;const i=window.requestAnimationFrame(()=>{t=window.requestAnimationFrame(ce)}),r=()=>ce();return window.addEventListener("resize",r),()=>{window.cancelAnimationFrame(i),window.cancelAnimationFrame(t),window.removeEventListener("resize",r)}},[z,ce,a,p]),l.useEffect(()=>{if(!a||z!=="preview")return;const t=window.requestAnimationFrame(()=>{kt(le.current||document)});return()=>window.cancelAnimationFrame(t)},[z,a,p,P]);const Ee=async(t=!1)=>{if(!(!A&&!u)){ye(!0);try{A&&await A(),await new Promise(i=>window.requestAnimationFrame(()=>i())),u&&(ee(x),rt(i=>i+1)),t||X.success("پیش‌نمایش چاپ به‌روز شد")}catch(i){console.error("Refresh print preview failed",i),t||X.error("به‌روزرسانی پیش‌نمایش ناموفق بود")}finally{ye(!1)}}},Ae=async()=>{if(!fe)return;if(await fe()===!1){X.error("ذخیره تنظیمات ناموفق بود");return}X.success("تنظیمات چاپی ذخیره شد"),await Ee(!0)};l.useEffect(()=>{a||Ne(!1)},[a]);const Pe=t=>{if(t.length<2)return null;const i=t[0],r=t[1];return Math.hypot(r.clientX-i.clientX,r.clientY-i.clientY)},mt=()=>{m()},ut=async()=>{let t;try{await Promise.resolve(b==null?void 0:b()),u&&(t=await D()||void 0)}catch(i){console.error("Prepare or reuse preview PDF failed",i)}m(),window.setTimeout(()=>{Promise.resolve(c(t)).catch(i=>{console.error("Print failed",i)})},0)},xt=async()=>{if(S){we(!0);try{const t=u&&await D()||void 0;await S(t)}finally{we(!1)}}},gt=async()=>{if(E){je(!0);try{const t=u&&await D()||void 0;await E(t)}finally{je(!1)}}},ht=e.jsxs("div",{className:"print-template-selector",children:[e.jsx("span",{className:"print-template-selector-label",children:"قالب"}),e.jsx(De,{value:p||void 0,onChange:t=>{K(t),ve("preview")},showSearch:!0,allowClear:!1,className:"print-template-mobile-select",placeholder:"انتخاب قالب چاپ",listHeight:320,virtual:!0,optionFilterProp:"label",adaptiveMode:"auto",pickerTitle:"انتخاب قالب چاپ",mobileSearchPlaceholder:"جستجو در قالب‌های چاپ",popupMatchSelectWidth:!0,overlayZIndexBase:12020,popupClassName:"print-template-mobile-popup",popupStyle:{"--print-template-popup-bg":g.colorBgElevated,"--print-template-popup-text":g.colorText,"--print-template-popup-muted":g.colorTextSecondary,"--print-template-popup-border":g.colorBorderSecondary},optionDisplayFallback:t=>String((t==null?void 0:t.title)||(t==null?void 0:t.label)||(t==null?void 0:t.value)||""),filterOption:(t,i)=>{const r=t.trim().toLowerCase();if(!r)return!0;const o=String((i==null?void 0:i.title)||"").toLowerCase(),N=String((i==null?void 0:i.description)||"").toLowerCase();return o.includes(r)||N.includes(r)},options:pt,optionRender:Re,renderMobileOption:Re})]});return e.jsxs(e.Fragment,{children:[a?e.jsx(At,{title:"انتخاب قالب چاپ",open:!0,onCancel:mt,onOk:ut,footer:(t,{CancelBtn:i,OkBtn:r})=>e.jsxs("div",{className:`flex ${h?"flex-col-reverse items-stretch gap-2":"items-center justify-end gap-2"}`,children:[e.jsx(i,{}),S?e.jsx(d,{onClick:()=>{xt()},loading:et,children:"ارسال مستقیم"}):null,E?e.jsx(d,{onClick:()=>{gt()},loading:tt,children:"ذخیره در نرم افزار"}):null,e.jsx(r,{})]}),okText:h&&b?"باز کردن PDF نهایی":"چاپ",cancelText:"انصراف",width:h?"100vw":"min(1440px, calc(100vw - 32px))",destroyOnHidden:!0,centered:!1,zIndex:ie,rootClassName:"print-select-modal",style:h?{top:0,paddingBottom:0,maxWidth:"100vw"}:{top:16,paddingBottom:0},styles:{mask:{zIndex:ie},wrapper:{zIndex:ie+1},header:{background:g.colorBgElevated,borderBottom:`1px solid ${g.colorBorderSecondary}`,marginBottom:0,paddingBottom:14},content:h?{borderRadius:0,display:"flex",flexDirection:"column",minHeight:"100dvh",maxHeight:"100dvh",height:"100dvh",paddingBottom:0,overflow:"hidden",background:g.colorBgElevated}:{background:g.colorBgElevated},body:{padding:0,...h?{flex:"1 1 auto",minHeight:0,maxHeight:"none",overflow:"hidden"}:{height:"calc(100vh - 140px)",maxHeight:"calc(100vh - 140px)",overflow:"hidden"}},footer:h?{flex:"0 0 auto",position:"sticky",bottom:0,zIndex:2,padding:"12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",marginTop:0,borderTop:`1px solid ${g.colorBorderSecondary}`,background:g.colorBgElevated,backdropFilter:"blur(12px)"}:{borderTop:`1px solid ${g.colorBorderSecondary}`,background:g.colorBgElevated}},children:e.jsx("div",{className:"print-select-shell",style:{background:g.colorBgLayout},children:e.jsxs("div",{className:"print-preview-shell",children:[e.jsxs("div",{className:"print-modal-controls-row",children:[ht,e.jsx(d,{type:"text",size:"small",className:"print-modal-refresh",icon:e.jsx(vt,{}),onClick:()=>{Ee()},loading:Ge,disabled:!A&&!u,title:"به‌روزرسانی پیش‌نمایش نهایی","aria-label":"به‌روزرسانی پیش‌نمایش نهایی"})]}),e.jsx(Pt,{activeKey:z,onChange:t=>{ve(t)},tabPosition:"top",destroyOnHidden:!0,tabBarGutter:h?18:32,style:{height:"100%",display:"flex",flexDirection:"column"},tabBarStyle:{margin:0,padding:h?"0 12px":"0 16px",borderBottom:`1px solid ${g.colorBorderSecondary}`,direction:"rtl"},items:[{key:"preview",label:e.jsxs("span",{className:"inline-flex items-center gap-2",style:{direction:"rtl"},children:[e.jsx(wt,{}),"پیش‌نمایش"]}),children:e.jsxs("div",{className:"print-preview-pane",children:[e.jsxs("div",{className:"print-preview-toolbar",children:[e.jsxs("div",{className:"print-preview-meta",children:[e.jsx("span",{children:(y==null?void 0:y.paperSize)||"A4"}),e.jsx("span",{children:((y==null?void 0:y.orientation)||"portrait")==="landscape"?"افقی":"عمودی"}),e.jsx("span",{children:u?"PDF نهایی":`${Math.round(P*100)}%`})]}),e.jsx("div",{className:"print-preview-actions",children:u?null:e.jsxs(e.Fragment,{children:[e.jsx(d,{size:"small",icon:e.jsx(yt,{}),onClick:()=>Y(t=>Math.max(.5,Math.round((t-.1)*10)/10)),title:"کوچک‌نمایی"}),e.jsx(d,{size:"small",icon:e.jsx(Le,{}),onClick:()=>Y(t=>Math.min(1.8,Math.round((t+.1)*10)/10)),title:"بزرگ‌نمایی"})]})})]}),e.jsx("div",{className:"print-preview-stage",ref:le,onTouchStart:t=>{L.current=t.touches.length>=2?Pe(t.touches):null},onTouchMove:t=>{if(t.touches.length<2)return;t.preventDefault();const i=Pe(t.touches),r=L.current;if(!i||!r){L.current=i;return}const o=(i-r)/180;Math.abs(o)<.015||(Y(N=>Math.max(.35,Math.min(1.8,Math.round((N+o)*100)/100))),L.current=i)},onTouchEnd:()=>{L.current=null},onTouchCancel:()=>{L.current=null},children:u?e.jsx("div",{style:{width:"100%",height:"100%",minHeight:"100%",padding:h?8:12,boxSizing:"border-box"},dir:"rtl",children:ne?e.jsxs("div",{style:{maxWidth:420,margin:"48px auto",textAlign:"right"},children:[e.jsx("p",{style:{marginBottom:12,color:"#475569"},children:ne.label}),e.jsx("div",{style:{height:8,borderRadius:999,overflow:"hidden",background:"#e2e8f0"},children:e.jsx("div",{style:{width:`${Math.max(0,Math.min(100,ne.percent))}%`,height:"100%",background:"#4f46e5",transition:"width .25s ease"}})})]}):Se?e.jsxs("div",{style:{maxWidth:420,margin:"48px auto",textAlign:"center",color:"#b91c1c"},children:[e.jsx("p",{children:Se}),e.jsx(d,{onClick:()=>{D(!0).catch(()=>{})},children:"تلاش دوباره"})]}):re?h?e.jsxs("div",{style:{maxWidth:440,margin:"32px auto",padding:"20px 16px",border:"1px solid #e2e8f0",borderRadius:16,textAlign:"center",background:"#fff"},children:[e.jsx("p",{style:{margin:"0 0 16px",color:"#475569",lineHeight:1.9},children:"پیش‌نمایش و خروجی نهایی یک فایل هستند. برای نمایش کامل، PDF را در نمایشگر خود گوشی باز کنید."}),e.jsx(d,{type:"primary",block:!0,href:re,target:"_blank",rel:"noopener noreferrer",children:"نمایش تمام‌صفحه PDF نهایی"})]}):e.jsx("iframe",{src:re,title:"پیش‌نمایش نهایی PDF",style:{width:"100%",height:"calc(100vh - 275px)",minHeight:620,border:0,background:"#fff"}}):null}):e.jsx("div",{className:"print-preview-canvas",children:e.jsx("div",{className:"print-preview-zoom-frame",style:{width:`${Math.round(pe*P)}px`,minHeight:`${Math.round(dt*P)}px`,maxWidth:"none",overflow:"visible"},children:e.jsx("div",{className:"print-preview-scale",style:{width:`${G.mmWidth}mm`,minHeight:`${G.mmHeight}mm`,...at?{zoom:P}:{transform:`scale(${P})`,transformOrigin:"top left"}},children:n?null:J()})})})})]})},...lt?[{key:"fields",label:e.jsx("span",{style:{direction:"rtl"},children:`فیلدهای قابل چاپ ${ze>0?`(${ze})`:"(هیچ‌کدام)"}`}),children:e.jsxs("div",{className:"print-fields-pane",children:[e.jsxs("div",{className:"print-fields-toolbar",children:[e.jsx("div",{className:"print-fields-meta",children:"فقط گزینه‌های انتخاب‌شده در چاپ نهایی نمایش داده می‌شوند."}),e.jsxs("div",{className:"print-fields-toolbar-actions",children:[e.jsx(d,{size:"small",onClick:()=>Ne(t=>!t),disabled:Q.length===0,icon:ke?e.jsx(me,{}):e.jsx(ue,{}),children:"ترتیب فیلدها"}),e.jsx(d,{size:"small",type:"primary",onClick:Ae,loading:be,children:"ذخیره تغییرات"})]})]}),e.jsxs("div",{className:"print-fields-scroll",children:[We?e.jsxs("div",{className:"print-image-mode-panel",children:[e.jsx("div",{className:"print-image-mode-header",children:e.jsx("div",{className:"print-image-mode-title",children:"نوع نمایش تصویر"})}),e.jsx(Ie,{block:h,size:"middle",value:M,onChange:t=>Fe(p,t),options:[{label:"فیت",value:"fit"},{label:"اندازه واقعی",value:"actual"}]})]}):null,ke&&Q.length>0?e.jsxs("div",{className:"print-selected-fields-panel",children:[e.jsx("div",{className:"print-selected-fields-title",children:"ترتیب چاپ فیلدهای انتخاب‌شده"}),e.jsx("div",{className:"print-selected-fields-list",children:Q.map((t,i)=>{var r;return e.jsxs("div",{className:"print-selected-field-row",children:[e.jsx("span",{className:"print-selected-field-label",children:((r=t==null?void 0:t.labels)==null?void 0:r.fa)||(t==null?void 0:t.label)||(t==null?void 0:t.key)}),e.jsxs("div",{className:"print-selected-field-actions",children:[e.jsx(d,{size:"small",icon:e.jsx(me,{}),onClick:o=>{o.stopPropagation(),he(p,t.key,"up")},disabled:i===0}),e.jsx(d,{size:"small",icon:e.jsx(ue,{}),onClick:o=>{o.stopPropagation(),he(p,t.key,"down")},disabled:i===Q.length-1})]})]},`selected-${t.key}`)})})]}):null,e.jsx("div",{className:"print-fields-groups",children:ct.map(({group:t,fields:i})=>e.jsxs("div",{className:"print-fields-group",children:[e.jsxs("div",{className:"print-fields-group-header",children:[e.jsx("div",{className:"print-fields-group-title",children:t}),e.jsx(xe,{checked:i.length>0&&i.every(r=>Z.has(r.key)),indeterminate:i.some(r=>Z.has(r.key))&&!i.every(r=>Z.has(r.key)),onChange:()=>Oe(p,t),children:"قابل چاپ"})]}),e.jsx("div",{className:"print-fields-grid",children:i.map(r=>{var I;const o=Z.has(r.key),N=(r==null?void 0:r.hasValue)===!1;return e.jsxs("div",{onClick:()=>te(p,r.key),className:`print-field-card ${o?"selected":""} ${N?"empty":""}`,children:[e.jsx("div",{className:"print-field-checkbox",children:o?"✓":""}),e.jsxs("div",{className:"print-field-card-body",children:[e.jsx("span",{children:((I=r==null?void 0:r.labels)==null?void 0:I.fa)||(r==null?void 0:r.label)||(r==null?void 0:r.key)}),N?e.jsx("small",{children:"بدون مقدار"}):null]})]},r.key)})})]},t))})]})]})}]:[],...st?[{key:"signatures",label:e.jsx("span",{style:{direction:"rtl"},children:"مهر و امضا"}),children:e.jsx("div",{className:"print-fields-pane",children:e.jsx("div",{className:"print-fields-scroll",children:e.jsx(Lt,{rows:W,quickAddOptions:He,signatureOptionsByRow:_e,onAddRow:qe,onRemoveRow:Te,onMoveRow:Ve,onToggleEnabled:Ue,onToggleAutomatic:Ke,onChangeName:Je,onChangeSubtitle:Xe,onChangeSignerModule:Ye,onChangeSignerId:Ze,onSearchSignerOptions:Qe,onSave:Ae,saving:be})})})}]:[]]})]})})}):null,typeof document<"u"?jt.createPortal(e.jsx("div",{id:"print-root","aria-hidden":!n,style:n?{display:"block",position:"fixed",top:0,left:"-200vw",width:"max-content",maxWidth:"none",opacity:0,pointerEvents:"none",zIndex:-1,overflow:"hidden"}:{display:"none"},children:n?J():null}),document.body):null,e.jsx("style",{children:`
        .print-select-modal,
        .print-select-modal *,
        .print-select-modal .ant-modal,
        .print-select-modal .ant-modal-mask,
        .print-select-modal .ant-modal-wrap {
          animation-duration: 0s !important;
          transition-duration: 0s !important;
        }
        .print-select-shell {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto minmax(0, 1fr);
          height: 100%;
          min-height: 0;
          background: transparent;
        }
        .print-template-system-tag {
          font-size: 10px;
          line-height: 1;
          border-radius: 999px;
          border: 1px solid rgba(16, 185, 129, 0.45);
          background: rgba(16, 185, 129, 0.14);
          color: #065f46;
          padding: 2px 8px;
        }
        .dark .print-template-system-tag {
          border-color: rgba(52, 211, 153, 0.5);
          background: rgba(6, 95, 70, 0.35);
          color: #a7f3d0;
        }
        .print-template-card-desc {
          margin-top: 4px;
          font-size: 11px;
          line-height: 1.7;
          color: #64748b;
        }
        .dark .print-template-card-desc {
          color: #94a3b8;
        }
        .print-preview-shell {
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .print-modal-controls-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          direction: rtl;
          padding: 10px 16px 8px;
          border-bottom: 1px solid var(--ant-color-border-secondary, rgba(148,163,184,0.18));
          background: var(--ant-color-bg-container, transparent);
        }
        .print-template-selector {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: min(100%, 300px);
          max-width: min(100%, 520px);
          flex: 1 1 360px;
          direction: rtl;
        }
        .print-template-selector-label {
          color: var(--ant-color-text-secondary, #64748b);
          font-size: 12px;
          font-weight: 700;
          flex: 0 0 auto;
        }
        .print-template-mobile-select.kalam-adaptive-picker__trigger {
          width: 100%;
          min-height: 34px;
          padding: 4px 10px;
          border-radius: 9px;
        }
        .print-template-mobile-select.ant-select {
          width: 100%;
          direction: rtl;
        }
        .print-template-mobile-select.ant-select .ant-select-selector {
          min-height: 34px !important;
          padding: 1px 10px !important;
          border-radius: 9px !important;
        }
        .print-template-mobile-select.ant-select .ant-select-selection-item,
        .print-template-mobile-select.ant-select .ant-select-selection-placeholder {
          line-height: 30px !important;
          text-align: right;
        }
        .print-template-mobile-select .kalam-adaptive-picker__trigger-text {
          direction: rtl;
          text-align: right;
        }
        .print-template-mobile-value {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          max-width: 100%;
        }
        .print-template-mobile-value-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: nowrap;
          font-size: 13px;
          font-weight: 700;
          color: inherit;
          line-height: 1.5;
          max-width: 100%;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .print-template-mobile-value-title,
        .print-template-mobile-option-title,
        .print-template-option-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          font-size: 13px;
          font-weight: 700;
          color: inherit;
          direction: rtl;
          text-align: right;
        }
        .print-template-mobile-option-desc,
        .print-template-option-desc {
          font-size: 11px;
          line-height: 1.7;
          color: var(--ant-color-text-secondary, #64748b);
          direction: rtl;
          text-align: right;
          display: block;
        }
        .print-template-mobile-option,
        .print-template-option {
          direction: rtl;
          text-align: right;
        }
        .print-template-option {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          min-width: 0;
        }
        .print-template-option-copy { flex: 1 1 auto; min-width: 0; }
        .print-template-option-edit { flex: 0 0 auto; margin-inline-start: auto; }
        .print-template-mobile-option .print-template-system-tag,
        .print-template-mobile-value .print-template-system-tag {
          display: inline-flex;
        }
        .print-template-mobile-popup.ant-select-dropdown,
        .print-template-mobile-popup .ant-select-dropdown {
          padding: 6px 0;
          background: var(--print-template-popup-bg, var(--ant-color-bg-elevated)) !important;
          color: var(--print-template-popup-text, var(--ant-color-text)) !important;
          border: 1px solid var(--print-template-popup-border, var(--ant-color-border-secondary)) !important;
          border-radius: 14px !important;
          box-shadow: var(--ant-box-shadow-secondary, 0 12px 28px rgba(15,23,42,0.18)) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          pointer-events: auto !important;
        }
        .print-template-mobile-popup {
          z-index: 1400 !important;
        }
        .print-template-mobile-popup,
        .print-template-mobile-popup * {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .print-template-mobile-popup .ant-select-item-option {
          background: transparent !important;
          color: var(--print-template-popup-text, var(--ant-color-text)) !important;
          pointer-events: auto !important;
        }
        .print-template-mobile-popup .ant-select-item-option-active {
          background: rgba(var(--brand-500-rgb), 0.08) !important;
        }
        .print-template-mobile-popup .ant-select-item-option-selected {
          background: rgba(var(--brand-500-rgb), 0.12) !important;
        }
        .print-template-mobile-popup .ant-select-item {
          padding: 10px 12px !important;
          border-radius: 12px;
          margin: 0 6px;
        }
        .print-template-mobile-popup .print-template-option-title,
        .print-template-mobile-popup .print-template-mobile-option-title {
          color: var(--print-template-popup-text, var(--ant-color-text)) !important;
        }
        .print-template-mobile-popup .print-template-option-desc,
        .print-template-mobile-popup .print-template-mobile-option-desc {
          color: var(--print-template-popup-muted, var(--ant-color-text-secondary)) !important;
        }
        .print-preview-shell .ant-tabs,
        .print-preview-shell .ant-tabs-content-holder,
        .print-preview-shell .ant-tabs-content {
          min-height: 0;
          height: 100%;
        }
        .print-preview-shell .ant-tabs {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
        }
        .print-preview-shell .ant-tabs-nav {
          flex: 0 0 auto;
        }
        .print-preview-shell .ant-tabs-nav-wrap {
          overflow-x: auto !important;
          overflow-y: hidden !important;
          scrollbar-width: none;
        }
        .print-preview-shell .ant-tabs-nav-wrap::-webkit-scrollbar {
          display: none;
        }
        .print-preview-shell .ant-tabs-nav-list {
          flex-wrap: nowrap !important;
          min-width: max-content;
          gap: 12px;
        }
        .print-preview-shell .ant-tabs-tab {
          flex: 0 0 auto;
          white-space: nowrap;
          margin: 0 !important;
          padding-inline: 10px !important;
        }
        .print-preview-shell .ant-tabs-tab-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1.5;
        }
        .print-preview-shell .ant-tabs-content-holder {
          flex: 1 1 auto;
          overflow: hidden;
        }
        .print-preview-shell .ant-tabs-content {
          min-height: 0;
          height: 100%;
        }
        .print-preview-shell .ant-tabs-tabpane {
          min-height: 0;
          height: 100%;
        }
        .print-preview-shell .ant-tabs-tabpane-active {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          min-height: 0;
        }
        .print-preview-pane {
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
          direction: ltr;
        }
        .print-preview-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px 10px;
          direction: rtl;
        }
        .print-preview-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .print-preview-meta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 12px;
          color: var(--ant-color-text-secondary, #64748b);
        }
        .print-preview-meta span {
          border: 1px solid var(--ant-color-border-secondary, rgba(148,163,184,0.24));
          border-radius: 999px;
          padding: 4px 10px;
          background: var(--ant-color-bg-container, rgba(255,255,255,0.7));
        }
        .print-preview-stage {
          flex: 1;
          overflow: auto;
          min-height: 0;
          border-top: 1px solid rgba(148,163,184,0.18);
          background: var(--ant-color-fill-quaternary, rgba(148,163,184,0.1));
          padding: 8px 10px 10px;
          display: flex;
          justify-content: flex-start;
          align-items: flex-start;
          direction: ltr;
          text-align: initial;
          overscroll-behavior: contain;
        }
        .print-preview-canvas {
          width: max-content;
          min-width: max-content;
          display: flex;
          justify-content: flex-start;
          align-items: flex-start;
          margin: 0 auto;
          overflow: visible;
        }
        .print-preview-zoom-frame {
          display: inline-flex;
          justify-content: flex-start;
          margin: 0 auto;
          position: relative;
          min-width: 0;
          flex: 0 0 auto;
          box-sizing: border-box;
          max-width: none;
          overflow: visible;
        }
        .print-preview-stage > .print-preview-zoom-frame {
          margin-inline: auto;
        }
        .print-preview-scale {
          background: #fff;
          box-shadow: 0 24px 60px rgba(15,23,42,0.22);
          box-sizing: border-box;
          overflow: hidden;
          display: inline-block;
          transform-origin: top center;
          direction: rtl;
          text-align: right;
          margin: 0 auto;
          max-width: 100%;
        }
        .print-preview-scale > .invoice-custom-print-shell {
          width: auto !important;
          min-height: auto !important;
          max-width: none !important;
          box-sizing: border-box !important;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 0 auto;
        }
        .print-preview-scale .print-template-page + .print-template-page {
          margin-top: 10mm;
        }
        .print-preview-scale .print-template-page {
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
          outline: 1px solid rgba(203, 213, 225, 0.95);
        }
        @media print {
          .print-preview-scale .print-template-page + .print-template-page {
            margin-top: 0 !important;
          }
          .print-preview-scale .print-template-page {
            box-shadow: none !important;
            outline: 0 !important;
          }
        }
        .print-fields-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 12px;
        }
        .print-fields-groups {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 16px;
        }
        .print-fields-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .print-fields-group-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 0 2px;
        }
        .print-fields-group-title {
          font-size: 12px;
          font-weight: 800;
          color: var(--ant-color-text-secondary, #475569);
        }
        .print-fields-group-header .ant-checkbox-wrapper {
          font-size: 12px;
          color: var(--ant-color-text-secondary, #64748b);
        }
        .print-fields-pane {
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .print-fields-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
        }
        .print-signature-pane {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 12px 16px 16px;
        }
        .print-signature-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          direction: rtl;
        }
        .print-signature-toolbar-copy {
          font-size: 12px;
          color: var(--ant-color-text-secondary, #64748b);
        }
        .print-signature-toolbar-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .print-signature-empty {
          border-radius: 18px;
          border: 1px dashed var(--ant-color-border-secondary, rgba(148,163,184,0.26));
          background: var(--ant-color-fill-quaternary, rgba(248,250,252,0.82));
          padding: 18px;
        }
        .print-signature-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .print-signature-card {
          border-radius: 18px;
          border: 1px solid var(--ant-color-border-secondary, rgba(148,163,184,0.22));
          background: var(--ant-color-bg-container, rgba(255,255,255,0.86));
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .print-signature-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          direction: rtl;
        }
        .print-signature-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .print-signature-card-index {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(var(--brand-500-rgb),0.14);
          color: rgba(var(--brand-700-rgb),1);
          font-size: 12px;
          font-weight: 800;
        }
        .print-signature-card-source {
          font-size: 12px;
          color: var(--ant-color-text-secondary, #64748b);
        }
        .print-signature-card-actions {
          display: flex;
          gap: 8px;
        }
        .print-signature-card-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .print-signature-auto-row {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          direction: rtl;
        }
        .print-signature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .print-signature-label {
          font-size: 12px;
          color: var(--ant-color-text-secondary, #475569);
          margin-bottom: 6px;
          direction: rtl;
        }
        .print-fields-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px 0;
          direction: rtl;
        }
        .print-fields-toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }
        .print-fields-meta {
          font-size: 12px;
          color: #64748b;
        }
        .print-selected-fields-panel {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: 12px 16px 0;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(248,250,252,0.82);
        }
        .print-image-mode-panel {
          margin: 12px 16px 0;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(248,250,252,0.82);
          display: flex;
          flex-direction: column;
          gap: 10px;
          direction: rtl;
        }
        .print-image-mode-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .print-image-mode-title {
          font-size: 12px;
          font-weight: 800;
          color: #334155;
        }
        .print-selected-fields-title {
          font-size: 12px;
          font-weight: 800;
          color: #334155;
        }
        .print-selected-fields-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .print-selected-field-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(226,232,240,0.95);
        }
        .print-selected-field-label {
          min-width: 0;
        }
        .print-selected-field-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }
        .dark .print-fields-meta {
          color: #cbd5e1;
        }
        .dark .print-selected-fields-panel {
          background: rgba(15,23,42,0.7);
          border-color: rgba(71,85,105,0.4);
        }
        .dark .print-image-mode-panel {
          background: rgba(15,23,42,0.7);
          border-color: rgba(71,85,105,0.4);
        }
        .dark .print-image-mode-title {
          color: #e2e8f0;
        }
        .dark .print-selected-fields-title {
          color: #e2e8f0;
        }
        .dark .print-selected-field-row {
          background: rgba(30,41,59,0.92);
          border-color: rgba(71,85,105,0.48);
        }
        .print-field-card {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding: 9px 10px;
          border-radius: 12px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(255,255,255,0.78);
          transition: 0.18s ease;
        }
        .print-field-card.selected {
          border-color: rgba(var(--brand-500-rgb), 0.7);
          background: rgba(255,248,240,0.92);
        }
        .print-field-card.empty {
          opacity: 0.72;
        }
        .dark .print-field-card {
          background: rgba(15,23,42,0.74);
          border-color: rgba(71,85,105,0.42);
          color: #e5e7eb;
        }
        .print-field-card-body {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
          font-size: 13px;
        }
        .print-field-card-body small {
          font-size: 10px;
          color: #94a3b8;
        }
        .print-field-checkbox {
          width: 16px;
          height: 16px;
          flex: 0 0 16px;
          border-radius: 5px;
          border: 1.5px solid rgba(148,163,184,0.48);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          background: transparent;
          font-weight: 700;
          font-size: 11px;
        }
        .print-field-card.selected .print-field-checkbox {
          border-color: rgba(var(--brand-500-rgb), 1);
          background: rgb(var(--brand-500-rgb));
        }
        @media (max-width: 767px) {
          .print-select-modal .ant-modal-content {
            display: flex;
            flex-direction: column;
            height: 100dvh;
          }
          .print-select-modal .ant-modal-header {
            flex: 0 0 auto;
            padding: 14px 16px 10px;
            margin-bottom: 0;
          }
          .print-select-modal .ant-modal-body {
            flex: 1 1 auto;
            min-height: 0;
          }
          .print-select-modal .ant-modal-footer {
            display: flex;
            gap: 10px;
          }
          .print-select-modal .ant-modal-footer .ant-btn {
            flex: 1 1 0;
            height: 42px;
            border-radius: 12px;
          }
          .print-select-modal .ant-modal {
            max-width: 100vw !important;
            margin: 0 !important;
            padding-bottom: 0 !important;
          }
          .print-select-modal .ant-modal-content {
            box-shadow: none;
          }
          .print-select-shell {
            grid-template-columns: 1fr;
            grid-template-rows: auto minmax(0, 1fr);
            height: 100%;
          }
          .print-preview-shell .ant-tabs-nav {
            padding: 0 10px;
          }
          .print-modal-controls-row {
            padding: 10px 12px 8px;
          }
          .print-template-selector {
            flex: 1 1 auto;
            min-width: 0;
            max-width: none;
          }
          .print-preview-shell {
            min-height: 0;
          }
          .print-preview-shell .ant-tabs-nav {
            margin-bottom: 0 !important;
          }
          .print-preview-shell .ant-tabs-nav-list {
            padding: 0 6px;
          }
          .print-preview-shell .ant-tabs-tab {
            padding: 12px 12px !important;
          }
          .print-preview-shell .ant-tabs-tab + .ant-tabs-tab {
            margin-inline-start: 2px !important;
          }
          .print-preview-toolbar {
            flex-wrap: wrap;
            align-items: stretch;
            padding: 10px 12px 8px;
            gap: 8px;
          }
          .print-preview-actions,
          .print-preview-meta {
            width: 100%;
          }
          .print-preview-actions {
            justify-content: space-between;
          }
          .print-preview-stage {
            padding: 8px 8px 12px;
          }
          .print-fields-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            padding: 10px 12px 0;
          }
          .print-fields-toolbar-actions {
            width: 100%;
            justify-content: stretch;
          }
          .print-fields-toolbar-actions .ant-btn {
            flex: 1 1 0;
          }
          .print-selected-fields-panel {
            margin: 12px 12px 0;
          }
          .print-image-mode-panel {
            margin: 12px 12px 0;
          }
          .print-selected-field-row {
            flex-direction: column;
            align-items: stretch;
          }
          .print-fields-group-header {
            flex-direction: column;
            align-items: stretch;
          }
          .print-selected-field-actions {
            justify-content: flex-end;
          }
          .print-fields-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .print-fields-groups {
            gap: 12px;
            padding: 12px;
          }
        }
      `}),e.jsx("style",{children:Nt})]})},ge=(a,m=new WeakSet)=>{if(a===null)return"null";if(a===void 0)return"undefined";if(typeof a=="string")return JSON.stringify(a);if(typeof a=="number"||typeof a=="boolean")return String(a);if(typeof a=="bigint")return`${a}n`;if(typeof a=="function"||typeof a=="symbol")return typeof a;if(a instanceof Date)return`date:${a.toISOString()}`;if(Array.isArray(a))return`[${a.map(c=>ge(c,m)).join(",")}]`;if(typeof a=="object"){if(m.has(a))return"[circular]";m.add(a);const c=a,b=`{${Object.keys(c).sort().map(S=>`${JSON.stringify(S)}:${ge(c[S],m)}`).join(",")}}`;return m.delete(a),b}return String(a)},ei=a=>{const m=ge(a);let c=2166136261;for(let b=0;b<m.length;b+=1)c^=m.charCodeAt(b),c=Math.imul(c,16777619);return`${m.length.toString(36)}-${(c>>>0).toString(36)}`};export{Gt as P,ei as c};
