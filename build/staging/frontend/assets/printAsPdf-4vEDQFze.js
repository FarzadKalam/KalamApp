import{S as we}from"./module-registry-BuqlWO-Q.js";import{c as ve}from"./imagePreview-Ck1oyfJa.js";const xe=`
  .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  
  .print-modal { display: grid; grid-template-columns: 200px 1fr; gap: 16px; }
  .print-template-list { display: flex; flex-direction: column; gap: 8px; }
  .print-template-item { 
    border: 1px solid #e5e7eb; 
    border-radius: 10px; 
    padding: 10px 12px; 
    text-align: right; 
    background: #fff; 
    transition: border-color 0.2s ease, box-shadow 0.2s ease; 
    cursor: pointer;
  }
  .print-template-item:hover { border-color: rgb(var(--brand-500-rgb)); box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
  .print-template-item.active { border-color: rgb(var(--brand-500-rgb)); box-shadow: 0 6px 16px rgba(var(--brand-500-rgb),0.25); }
  .print-template-title { font-weight: 700; color: #111827; font-size: 13px; }
  .print-template-desc { color: #6b7280; font-size: 11px; margin-top: 4px; }
  
  .print-preview { background: #f9fafb; border: 1px dashed #e5e7eb; border-radius: 12px; padding: 12px; overflow: auto; }
  .print-preview-inner { display: flex; justify-content: center; align-items: flex-start; transform: scale(0.9); transform-origin: top center; }
  
  .print-card { width: 105mm; height: 148mm; background: #fff; color: #111827; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8mm; box-sizing: border-box; display: flex; flex-direction: column; }
  .print-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .print-head-text { flex: 1; }
  .print-title { font-size: 14px; font-weight: 800; }
  .print-subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .print-qr { display: flex; align-items: center; }
  
  .print-table-wrap { margin-top: 8px; overflow: hidden; flex: 1; }
  .print-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .print-table td { border: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: top; }
  .print-label { width: 36%; background: #f8fafc; font-weight: 700; color: #374151; }
  .print-value { color: #111827; word-break: break-word; }

  .invoice-custom-print-shell .print-template-page,
  .invoice-custom-print-shell .print-template-page * {
    font-family: inherit;
  }
  .invoice-custom-print-shell .print-template-page,
  .invoice-custom-print-shell .print-template-body-inner,
  .invoice-custom-print-shell .print-template-header-inner,
  .invoice-custom-print-shell .print-template-footer-inner {
    line-height: 1.9;
    font-size: 14px;
    direction: rtl;
    text-align: right;
  }
  .kalamapp-native-print-flow,
  .kalamapp-native-print-flow * {
    font-family: inherit;
  }
  .kalamapp-native-print-flow {
    direction: rtl;
    text-align: right;
    color: #111827;
    position: relative;
  }
  .kalamapp-native-print-flow-background {
    position: fixed;
    inset: 0;
    z-index: 0;
    background-position: center;
    background-repeat: no-repeat;
    background-size: 100% 100%;
    pointer-events: none;
  }
  .kalamapp-native-print-flow-overlay {
    position: fixed;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }
  .kalamapp-native-print-flow-body {
    width: 100%;
    box-sizing: border-box;
    line-height: 1.9;
    font-size: 14px;
    direction: rtl;
    text-align: right;
    overflow: visible;
    position: relative;
    z-index: 1;
    background: transparent;
  }
  .kalamapp-native-print-flow-body *,
  .kalamapp-native-print-flow-body *::before,
  .kalamapp-native-print-flow-body *::after {
    box-sizing: border-box;
    max-width: 100%;
  }
  .kalamapp-native-print-flow-body table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    break-inside: auto;
    page-break-inside: auto;
  }
  .kalamapp-native-print-flow-body thead { display: table-header-group; }
  .kalamapp-native-print-flow-body tfoot { display: table-footer-group; }
  .kalamapp-native-print-flow-body th,
  .kalamapp-native-print-flow-body td {
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    vertical-align: top;
  }
  .kalamapp-native-print-flow-body tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .invoice-custom-print-shell .print-template-page {
    direction: rtl;
    text-align: right;
  }
  .invoice-custom-print-shell .print-template-page p,
  .invoice-custom-print-shell .print-template-body-inner p,
  .invoice-custom-print-shell .print-template-body-measure p,
  .invoice-custom-print-shell .print-template-header-inner p,
  .invoice-custom-print-shell .print-template-footer-inner p {
    margin: 0 0 8px 0;
  }
  .invoice-custom-print-shell .print-template-page td p,
  .invoice-custom-print-shell .print-template-page th p,
  .invoice-custom-print-shell .print-template-body-inner td p,
  .invoice-custom-print-shell .print-template-body-inner th p,
  .invoice-custom-print-shell .print-template-body-measure td p,
  .invoice-custom-print-shell .print-template-body-measure th p,
  .invoice-custom-print-shell .print-template-header-inner td p,
  .invoice-custom-print-shell .print-template-header-inner th p,
  .invoice-custom-print-shell .print-template-footer-inner td p,
  .invoice-custom-print-shell .print-template-footer-inner th p {
    margin: 0 !important;
    font-size: inherit !important;
    line-height: 1.6 !important;
  }
  .invoice-custom-print-shell .print-template-page h2,
  .invoice-custom-print-shell .print-template-body-inner h2,
  .invoice-custom-print-shell .print-template-body-measure h2,
  .invoice-custom-print-shell .print-template-header-inner h2,
  .invoice-custom-print-shell .print-template-footer-inner h2 {
    margin: 0 0 10px 0;
    font-size: 20px;
    line-height: 1.8;
  }
  .invoice-custom-print-shell .print-template-body-measure {
    width: 100%;
    box-sizing: border-box;
    line-height: 1.9;
    font-size: 14px;
    direction: rtl;
    text-align: right;
    font-family: inherit;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .invoice-custom-print-shell .print-template-body-measure *,
  .invoice-custom-print-shell .print-template-body-inner * {
    box-sizing: border-box;
  }
  .invoice-custom-print-shell [data-print-flow-role="manual-keep"],
  .invoice-custom-print-shell [data-print-flow-role="semantic-block"],
  .invoice-custom-print-shell [data-print-flow-role="media-block"] {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .invoice-custom-print-shell [data-print-flow-role="table-container"] {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  .invoice-custom-print-shell [data-print-flow-role="table-row"] {
    break-inside: auto !important;
    page-break-inside: auto !important;
  }
  .invoice-custom-print-shell table {
    --table-border-color: #d1d5db;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    width: 100%;
    max-width: 100%;
  }
  .invoice-custom-print-shell table,
  .invoice-custom-print-shell th,
  .invoice-custom-print-shell td {
    border-color: var(--table-border-color, #d1d5db);
    box-sizing: border-box !important;
  }
  .invoice-custom-print-shell th,
  .invoice-custom-print-shell td {
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .invoice-custom-print-shell img {
    display: block;
    object-fit: contain;
  }
  
  #print-root { display: none; }
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body.print-mode #root,
    body[data-kalamapp-print-session="true"] #root {
      display: none !important;
    }
    body.print-mode > *:not(#print-root),
    body[data-kalamapp-print-session="true"] > *:not(#print-root) {
      display: none !important;
    }
    body.print-mode #print-root,
    body[data-kalamapp-print-session="true"] #print-root {
      display: block !important;
      position: static !important;
      width: auto !important;
      height: auto !important;
      overflow: visible !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    body.print-mode #print-root .invoice-custom-print-shell,
    body[data-kalamapp-print-session="true"] #print-root .invoice-custom-print-shell {
      width: fit-content !important;
      min-height: auto !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
    }
    body.print-mode #print-root .print-template-page,
    body[data-kalamapp-print-session="true"] #print-root .print-template-page {
      break-after: page !important;
      page-break-after: always !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      margin: 0 !important;
    }
    body.print-mode #print-root .print-template-page:last-child,
    body[data-kalamapp-print-session="true"] #print-root .print-template-page:last-child {
      break-after: auto !important;
      page-break-after: auto !important;
    }
    body.print-mode #print-root *,
    body[data-kalamapp-print-session="true"] #print-root * {
      visibility: visible !important;
    }
    .invoice-custom-print-shell,
    .invoice-custom-print-shell * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .invoice-custom-print-shell .print-template-page-counter { color: #334155 !important; }
    .invoice-custom-print-shell .print-template-body-measure { display: none !important; }
    /* System invoice rows may have different font metrics. Keep each row whole
       when a long items table flows onto the next printed page. */
    .invoice-print-card {
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
    .invoice-print-card tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-card { border: none; box-shadow: none; border-radius: 0; }
  }
`,Ht='[data-print-auto-fit="compact"]',Nt="[data-print-auto-fit-content]",Fr=(t=document)=>{Array.from(t.querySelectorAll(Ht)).forEach(r=>{const a=r.querySelector(Nt);if(!a)return;r.style.fontSize="";const n=Number.parseFloat(window.getComputedStyle(r).fontSize)||11,o=Math.min(n,7);let l=n;for(;a.scrollWidth>r.clientWidth+1&&l>o;)l=Math.max(o,l-.5),r.style.fontSize=`${l}px`})},Se=()=>`
  (function () {
    var cells = Array.prototype.slice.call(document.querySelectorAll('${Ht}'));
    cells.forEach(function (cell) {
      var content = cell.querySelector('${Nt}');
      if (!content) return;
      cell.style.fontSize = '';
      var baseFontSize = parseFloat(window.getComputedStyle(cell).fontSize) || 11;
      var minimumFontSize = Math.min(baseFontSize, 7);
      var fontSize = baseFontSize;
      while (content.scrollWidth > cell.clientWidth + 1 && fontSize > minimumFontSize) {
        fontSize = Math.max(minimumFontSize, fontSize - 0.5);
        cell.style.fontSize = fontSize + 'px';
      }
    });
  })();
`,D="data-print-flow-block",Te=new Set(["article","aside","blockquote","div","hr","main","nav","ol","p","pre","section","table","ul"]),Ee=new Set(["canvas","figure","img","picture","svg"]),Ae="p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, hr",ke="table, tbody",Pe="thead, tfoot, tr",Me="img, svg, canvas, figure, picture",Ce='[style*="page-break-inside: avoid"], [style*="page-break-before: avoid"], [style*="break-inside: avoid"]',ut=4,ht=2,gt=5e3,K=3,Re=.6,_e=180,Bt=.55,It=.35,He=8,Ne=/[\s\u00a0\u200b-\u200d\u2060\ufeff]+/g,Be=new Set(["article","aside","blockquote","div","li","main","section"]),Ie="audio, canvas, embed, iframe, img, object, picture, svg, video",Fe=/(?:^|;)\s*(?:border(?:-[a-z-]+)?|height|min-height|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?)\s*:/i,Y=t=>Math.max(0,Math.round(t)),at=t=>Math.max(0,Math.floor(t)),V=t=>Math.max(0,Math.ceil(t)),W=t=>String(t||"").replace(Ne,"").length>0,$e=t=>t.hasAttribute("data-print-preserve-space")||t.querySelector(Ie)||Fe.test(String(t.getAttribute("style")||""))?!1:!W(t.textContent),ot=t=>{let e=!1,r=t.lastChild;for(;r&&r.nodeType===Node.TEXT_NODE&&!W(r.textContent);){const o=r.previousSibling;r.remove(),e=!0,r=o}for(;r&&r.nodeType===Node.ELEMENT_NODE;){const o=r;if(!$e(o))break;const l=o.previousSibling;for(o.remove(),e=!0,r=l;r&&r.nodeType===Node.TEXT_NODE&&!W(r.textContent);){const s=r.previousSibling;r.remove(),r=s}}const a=t.lastElementChild,n=String((a==null?void 0:a.tagName)||"").toLowerCase();return a&&Be.has(n)&&(e=ot(a)||e),e},ft=(t,e)=>({top:at(t),bottom:V(e)}),Le=({logicalWidth:t,logicalHeight:e,renderedWidth:r,renderedHeight:a})=>{const n=(o,l)=>{if(!Number.isFinite(o)||!Number.isFinite(l)||o<=0||l<=0)return 1;const s=o/l;return Number.isFinite(s)&&s>0?s:1};return{x:n(t,r),y:n(e,a)}},ze=t=>{const e=[t.getAttribute("class"),t.getAttribute("data-print-flow-role"),t.getAttribute("data-role"),t.getAttribute("data-type"),t.getAttribute("style")].map(r=>String(r||"").toLowerCase()).join(" ");return/(signature|signatory|stamp|seal)/.test(e)},Q=t=>{const e=String(t.tagName||"").toLowerCase();return e==="table"||e==="tbody"},C=(t,e,r)=>{const a=String(t.getAttribute(D)||"").trim();(!a||a!=="high"&&e==="high")&&t.setAttribute(D,e),r&&!t.hasAttribute("data-print-flow-role")&&t.setAttribute("data-print-flow-role",r)},Z=t=>{const e=String(t.tagName||"").toLowerCase();return Ee.has(e)||ze(t)?"high":"normal"},$r=t=>{if(typeof window>"u"||!t)return t;const a=new window.DOMParser().parseFromString(`<div id="print-flow-root">${t}</div>`,"text/html").getElementById("print-flow-root");return a?(ot(a),Array.from(a.children||[]).forEach(n=>{const o=String(n.tagName||"").toLowerCase();Te.has(o)&&(Q(n)||C(n,Z(n),"root-block"))}),a.querySelectorAll(Ae).forEach(n=>{C(n,Z(n),"text-block")}),a.querySelectorAll(ke).forEach(n=>{C(n,"normal","table-container")}),a.querySelectorAll(Pe).forEach(n=>{C(n,"normal","table-row")}),a.querySelectorAll(Me).forEach(n=>{C(n,"high","media-block")}),a.querySelectorAll(Ce).forEach(n=>{Q(n)||Z(n)==="high"&&C(n,"high","manual-keep")}),Array.from(a.querySelectorAll("*")).forEach(n=>{const o=[n.getAttribute("class"),n.getAttribute("data-print-flow-role"),n.getAttribute("data-role"),n.getAttribute("data-type")].map(l=>String(l||"").toLowerCase()).join(" ");if(/(signature|signatory|stamp|seal)/.test(o)){if(Q(n))return;C(n,"high","semantic-block")}}),a.innerHTML):t},Oe=t=>{var h;const e=t.getBoundingClientRect(),r=Le({logicalWidth:Math.max(t.offsetWidth,t.clientWidth),logicalHeight:Math.max(t.offsetHeight,t.clientHeight),renderedWidth:e.width,renderedHeight:e.height}),a=p=>p*r.y,n=new Map;Array.from(t.querySelectorAll(`[${D}]`)).forEach(p=>{const g=p.getBoundingClientRect();if(!Number.isFinite(g.top)||!Number.isFinite(g.bottom)||g.height<ut)return;const{top:f,bottom:m}=ft(a(g.top-e.top),a(g.bottom-e.top));if(m-f<ut)return;const b=String(p.getAttribute(D)||"").trim()==="high"?"high":"normal",y=`${f}:${m}`,S=n.get(y);(!S||S.priority!=="high"&&b==="high")&&n.set(y,{top:f,bottom:m,priority:b,source:"block"})});let o=0;const l=[],s=t.ownerDocument,i=s.createTreeWalker(t,NodeFilter.SHOW_TEXT);let d=i.nextNode();for(;d&&o<gt;){const p=String(d.textContent||"");if(W(p)){const g=s.createRange();g.selectNodeContents(d),Array.from(g.getClientRects()).forEach(m=>{if(o>=gt||!Number.isFinite(m.top)||!Number.isFinite(m.bottom)||m.height<ht)return;const{top:b,bottom:y}=ft(a(m.top-e.top),a(m.bottom-e.top));y-b<ht||(l.push({top:b,bottom:y}),o+=1)}),(h=g.detach)==null||h.call(g)}d=i.nextNode()}return Array.from(l.reduce((p,g)=>{const f=`${g.top}:${g.bottom}`;return p.has(f)||p.set(f,g),p},new Map).values()).sort((p,g)=>p.top!==g.top?p.top-g.top:p.bottom-g.bottom).reduce((p,g)=>{const f=p[p.length-1],m=f?(f.top+f.bottom)/2:0,b=(g.top+g.bottom)/2,y=f?Math.max(0,Math.min(f.bottom,g.bottom)-Math.max(f.top,g.top)):0,S=f?Math.min(f.bottom-f.top,g.bottom-g.top):0,x=!!f&&S>0&&y/S>=Re,w=!!f&&(x||Math.abs(g.top-f.top)<=K||Math.abs(g.bottom-f.bottom)<=K||Math.abs(b-m)<=K);return f&&w?(f.top=Math.min(f.top,g.top),f.bottom=Math.max(f.bottom,g.bottom),p):(p.push({...g}),p)},[]).forEach(p=>{const g=`line:${p.top}:${p.bottom}`;n.has(g)||n.set(g,{...p,priority:"normal",source:"line"})}),Array.from(n.values()).sort((p,g)=>p.top!==g.top?p.top-g.top:p.bottom-g.bottom)},qe=({totalHeight:t,pageBodyStepPx:e,anchors:r,minPageFillRatio:a=Bt,hardKeepFillRatio:n=It})=>{const o=Math.max(1,V(t)),l=Math.max(80,at(e));if(o<=l)return[0];const s=Math.max(72,Y(l*a)),i=Math.max(48,Y(l*n)),d=(r||[]).filter(m=>Number.isFinite(m.top)&&Number.isFinite(m.bottom)&&m.bottom>m.top).sort((m,b)=>m.top!==b.top?m.top-b.top:m.bottom-b.bottom),c=d.filter(m=>m.source!=="line"),u=d.filter(m=>m.source==="line"),h=m=>u.every(b=>m<=b.top||m>=b.bottom),p=[0];let g=0,f=0;for(;g+l<o-1&&f<500;){f+=1;const m=Math.min(o,g+l),b=u.map(x=>x.bottom).filter(x=>x>g+s&&x<=m).filter(h);let y=b.length>0?Math.max(...b):0;const S=u.some(x=>x.bottom>g+i&&x.top<m);if(!y){const x=Math.max(g+i,m-_e),w=u.map(v=>v.top).filter(v=>v>x&&v<m-1).filter(h);y=w.length>0?Math.max(...w):0}if(!y&&!S){const x=d.map(w=>w.bottom).filter(w=>w>g+s&&w<=m).filter(h);y=x.length>0?Math.max(...x):0}if(!y){const x=c.filter(w=>w.priority==="high").filter(w=>w.top<m&&w.bottom>m).filter(w=>w.bottom-w.top<=l-He).map(w=>w.top).filter(w=>w>g+i&&w<m-1);y=x.length>0?Math.max(...x):0}if(!y){const w=Math.max(g+i,m-56),v=d.map(T=>T.bottom).filter(T=>T>w&&T<=m).filter(h);v.length>0&&(y=Math.max(...v))}if(!y&&u.length===0&&(y=m),!y){const x=u.map(w=>w.top).filter(w=>w>g+i&&w<m).filter(h);y=x.length>0?Math.max(...x):m}if(y=Math.min(o,Math.max(g+1,Y(y))),y<=g&&(y=Math.min(o,g+l)),y>=o-1)break;p.push(y),g=y}return p},Ue=({totalHeight:t,pageBodyStepPx:e,anchors:r,minPageFillRatio:a=Bt,hardKeepFillRatio:n=It})=>{const o=Math.max(1,V(t)),l=(r||[]).filter(c=>Number.isFinite(c.top)&&Number.isFinite(c.bottom)&&c.bottom>c.top).sort((c,u)=>c.top-u.top||c.bottom-u.bottom),s=qe({totalHeight:o,pageBodyStepPx:e,anchors:l,minPageFillRatio:a,hardKeepFillRatio:n}).slice(1),i=[];let d=0;return s.forEach(c=>{const u=Math.max(d+1,Math.min(o,V(c)));i.push({start:d,end:u});const h=l.find(p=>p.source==="line"&&p.top>=u)||l.find(p=>p.top>=u);d=h?Math.min(o,at(h.top)):u}),d<o&&i.push({start:d,end:o}),i.length>0?i:[{start:0,end:o}]},bt=80,M=24,it=t=>Math.max(bt,Math.floor(Math.max(bt,t))),De=t=>Math.max(1,it(t)-M*2),Ve=(t,e)=>Math.min(it(t),Math.max(1,Math.ceil(e)+M*2)),We=t=>M-Math.max(0,Math.floor(t)),Lr=({pageBodyHeightPx:t,pageStartOffset:e,contentHeightPx:r})=>{const a=it(t);if(!Number.isFinite(r)||Number(r)<=1)return a;const n=Math.ceil(Number(r)-Math.max(0,e));return Math.min(a,Math.max(1,n))},et=(t,e)=>{const r=[];let a=0;for(;a<t.length;){const n=t.length-a;if(!e(t.slice(a,a+1)))return null;let o=1,l=n;for(;o<n;){const i=Math.min(n,o*2);if(!e(t.slice(a,a+i))){l=i-1;break}o=i}let s=o+1;for(;s<=l;){const i=Math.floor((s+l)/2);e(t.slice(a,a+i))?(o=i,s=i+1):l=i-1}r.push(t.slice(a,a+o)),a+=o}return r},U=(t,e,r=!1,a=4)=>{const n=t.getBoundingClientRect(),o=Math.max(1,Math.ceil(n.height)),l=[];Array.from(t.querySelectorAll("table tr")).forEach(h=>{const p=h.getBoundingClientRect();p.height>1&&l.push({top:p.top-n.top,bottom:p.bottom-n.top})});const s=t.ownerDocument.createTreeWalker(t,NodeFilter.SHOW_TEXT);let i=s.nextNode();for(;i;){if(String(i.textContent||"").trim()){const h=t.ownerDocument.createRange();h.selectNodeContents(i),Array.from(typeof h.getClientRects=="function"?h.getClientRects():[]).forEach(p=>{p.height>1&&l.push({top:p.top-n.top,bottom:p.bottom-n.top})})}i=s.nextNode()}l.sort((h,p)=>h.top-p.top||h.bottom-p.bottom);const d=[];if(l.forEach(h=>{const p=d[d.length-1];p&&h.top<p.bottom?p.bottom=Math.max(p.bottom,h.bottom):d.push({...h})}),r&&d.length>=a){const h=[0];for(let p=1;p<d.length;p+=1){const g=Math.floor((d[p-1].bottom+d[p].top)/2);g>h[h.length-1]&&g<o&&h.push(g)}return h.push(o),h.slice(0,-1).map((p,g)=>({start:p,height:h[g+1]-p}))}const c=[];let u=0;for(;u<o;){let h=Math.min(o,u+Math.max(1,Math.floor(e)));const p=d.find(g=>g.top<h&&g.bottom>h);p&&Math.floor(p.top)>u&&(h=Math.floor(p.top)),c.push({start:u,height:h-u}),u=h}return c},Ft=(t,e,r)=>{var u,h,p,g;if(t.querySelector("table,img,svg,canvas,iframe,video")||typeof t.ownerDocument.createRange().getBoundingClientRect!="function")return null;const a=[],n=t.ownerDocument.createTreeWalker(t,NodeFilter.SHOW_TEXT);let o=0,l=n.nextNode();for(;l;){const f=((u=l.textContent)==null?void 0:u.length)||0;f&&(a.push({node:l,start:o,end:o+f}),o+=f),l=n.nextNode()}if(!o)return null;const s=f=>{let m=0,b=a.length-1;for(;m<b;){const S=Math.floor((m+b)/2);f<=a[S].end?b=S:m=S+1}const y=a[m];return{node:y.node,offset:Math.max(0,f-y.start)}},i=f=>{const m=s(f+1),b=t.ownerDocument.createRange();return b.setStart(m.node,Math.max(0,m.offset-1)),b.setEnd(m.node,m.offset),b.getBoundingClientRect()},d=[];let c=0;for(;c<o;){const f=i(c);let m=c+1,b=o,y=c;for(;m<=b;){const A=Math.floor((m+b)/2),B=i(A-1);B.top<f.bottom&&B.bottom-f.top<=Math.max(1,e-8)?(y=A,m=A+1):b=A-1}if(y<=c)return null;const S=s(c),x=s(y),w=t.ownerDocument.createRange();w.setStart(S.node,S.offset),w.setEnd(x.node,x.offset);const v=t.cloneNode(!1);let T=w.cloneContents(),E=w.commonAncestorContainer.nodeType===Node.ELEMENT_NODE?w.commonAncestorContainer:w.commonAncestorContainer.parentElement;for(;E&&E!==t;){const A=E.cloneNode(!1);A.append(T),T=A,E=E.parentElement}for(v.append(T),v.style.marginTop="0",v.style.marginBottom="0";((h=v.firstChild)==null?void 0:h.nodeType)===Node.TEXT_NODE&&!v.firstChild.textContent;)v.firstChild.remove();for(;v.firstElementChild&&v.firstChild===v.firstElementChild&&/^(SPAN|STRONG|B|I|EM|A|S|U)$/.test(v.firstElementChild.tagName)&&!v.firstElementChild.textContent&&!v.firstElementChild.querySelector("img,svg,canvas");)v.firstElementChild.remove();for(((p=v.firstElementChild)==null?void 0:p.tagName)==="BR"&&v.firstChild===v.firstElementChild&&v.firstElementChild.remove();((g=v.lastElementChild)==null?void 0:g.tagName)==="BR"&&v.lastChild===v.lastElementChild;)v.lastElementChild.remove();d.push({node:v,top:Math.floor(f.top-r),bottom:Math.ceil(i(y-1).bottom-r)}),c=y}return d},$t=t=>{const e=[],r=a=>{var i;const n=(i=a.ownerDocument.defaultView)==null?void 0:i.getComputedStyle(a),o=/^(DIV|SECTION|ARTICLE|MAIN)$/.test(a.tagName),l=(n==null?void 0:n.display)!=="grid"&&(!(n!=null&&n.display.includes("flex"))||n.flexDirection==="column"),s=(n==null?void 0:n.position)==="absolute"||(n==null?void 0:n.position)==="fixed";o&&l&&!s&&!a.hasAttribute("data-print-preserve-space")&&!a.hasAttribute("data-print-keep-together")&&a.querySelector("table,p,section,article,div,ul,ol")?(Array.from(a.childNodes).forEach(d=>{var c;if(d.nodeType===Node.TEXT_NODE&&((c=d.textContent)!=null&&c.trim())){const u=a.ownerDocument.createElement("span");d.replaceWith(u),u.append(d)}}),Array.from(a.children).forEach(d=>r(d))):e.push(a)};return Array.from(t.children).forEach(a=>r(a)),e},Lt=(t,e,r)=>{const a=new Map;return(n,o)=>{const l=[];let s=n.parentElement;for(;s&&s!==e;)l.unshift(s),s=s.parentElement;if(!e||s!==e){r.append(o);return}let i=r;l.forEach(d=>{let c=a.get(d);c||(c=t.importNode(d,!1),c.style.height="auto",c.style.minHeight="0",c.style.maxHeight="none",c.style.breakInside="auto",c.style.pageBreakInside="auto",i.append(c),a.set(d,c)),i=c}),i.append(o)}},zt=(t,e,r)=>{const a=Array.from(t.children).filter(l=>/^(TD|TH)$/.test(l.tagName));if(!a.length||t.querySelector("img,svg,canvas,iframe,video"))return null;const n=a.map(l=>{var g,f;const s=l.getBoundingClientRect();let i=0;const d=l.ownerDocument.createTreeWalker(l,NodeFilter.SHOW_TEXT);let c=d.nextNode();for(;c;){if((g=c.textContent)!=null&&g.trim()){const m=l.ownerDocument.createRange();m.selectNodeContents(c),typeof m.getClientRects=="function"&&Array.from(m.getClientRects()).forEach(b=>{b.height>1&&(i=Math.max(i,b.bottom-s.top))})}c=d.nextNode()}if(l.querySelectorAll("table tr").forEach(m=>{i=Math.max(i,m.getBoundingClientRect().bottom-s.top)}),!i)return[];const u=(f=l.ownerDocument.defaultView)==null?void 0:f.getComputedStyle(l),h=parseFloat((u==null?void 0:u.paddingBottom)||"0")||0,p=Math.min(s.height,Math.ceil(i+h+1));return r(l,e,!0,2).filter(m=>m.start<p).map(m=>({start:m.start,height:Math.min(m.height,p-m.start),padding:(u==null?void 0:u.padding)||"0",sourceHeight:s.height}))}),o=Math.max(0,...n.map(l=>l.length));return o<2?null:Array.from({length:o},(l,s)=>n.map(i=>i[s]||{start:i.length?i[i.length-1].start+i[i.length-1].height:0,height:0}))},Ot=(t,e,r)=>{const a=Array.from(t.children),n=Array.from(e.querySelectorAll("tr")).find(o=>o.closest("table")===e&&!o.closest("thead"));return n&&Array.from(n.children).forEach((o,l)=>{const s=o,i=a[l],d=r[l],c=i.ownerDocument.createElement("div");c.style.cssText="position:relative;overflow:hidden;contain:layout paint;width:100%;box-sizing:border-box;",c.style.height=Math.max(0,(d==null?void 0:d.height)||0)+"px";const u=i.ownerDocument.createElement("div");u.style.cssText="position:absolute;left:0;width:100%;box-sizing:border-box;",u.style.top="-"+Math.max(0,(d==null?void 0:d.start)||0)+"px",u.style.padding=(d==null?void 0:d.padding)||"0",u.style.minHeight=((d==null?void 0:d.sourceHeight)||0)+"px",u.append(...Array.from(i.childNodes,h=>h.cloneNode(!0))),c.append(u),s.replaceChildren(c),s.style.padding="0",s.style.verticalAlign="top",s.style.height="auto",s.style.minHeight="0"}),e},qt=".invoice-custom-print-shell .print-template-page",Ut=".print-template-body",_=".print-template-body-viewport",P=".print-template-body-segment",H=".print-template-body-inner",G=".print-template-page-counter",Dt=".print-template-header",Vt=".print-template-header-inner",Wt=".print-template-footer",Gt=".print-template-footer-stack",$="data-print-body-capacity-px",Xt="data-print-configured-header-height-px",jt="data-print-configured-footer-height-px",Kt="data-print-signature-height-px",Yt="data-print-page-counter-height-px",Qt=96,rt=(t,e,r=!1)=>{const a=t.querySelector(".print-template-footer"),n=t.querySelector(".print-template-signatures");if(n&&(n.style.display=""),!a||(a.style.marginTop=e?"0px":"auto",!e))return;const o=t.querySelector(".print-template-body"),l=t.querySelector(".print-template-body-viewport"),s=t.querySelector(".print-template-body-segment");if(!o||!l)return;const i=Number.parseFloat(l.style.height||"")||l.clientHeight,d=r&&s?Math.ceil(Math.max(s.scrollHeight,s.getBoundingClientRect().height)):i;if(d<=0)return;const c=Math.max(1,Math.min(i||d,d));!c||!Number.isFinite(c)||[o,l].forEach(u=>{u.style.flex=`0 0 ${c}px`,u.style.height=`${c}px`,u.style.minHeight="0",u.style.maxHeight=`${c}px`})},q=t=>String(t).replace(/\d/g,e=>"۰۱۲۳۴۵۶۷۸۹"[Number(e)]||e),yt=t=>{if(!t)return 0;const e=t.getBoundingClientRect(),r=Array.from(t.querySelectorAll("*")).reduce((a,n)=>{const o=n.getBoundingClientRect();return Math.max(a,o.bottom-e.top)},0);return Math.max(t.scrollHeight,t.offsetHeight,t.clientHeight,Math.ceil(e.height||0),Math.ceil(r||0))},R=(t,e)=>{const r=Number(t.getAttribute(e));return Number.isFinite(r)&&r>0?r:0},J=(t,e)=>{if(!t||!Number.isFinite(e)||e<=0)return;const r=`${Math.ceil(e)}px`;t.style.flex=`0 0 ${r}`,t.style.height=r,t.style.minHeight=r,t.style.maxHeight=r},wt=t=>{t&&(t.style.position="absolute",t.style.top="0",t.style.insetInlineStart="0",t.style.width="100%")},Ge=(t,e)=>{const r=t.querySelector(Dt),a=t.querySelector(Wt),n=t.querySelector(Vt),o=t.querySelector(Gt),l=window.getComputedStyle(t),s=Math.max(1,t.clientHeight-Number.parseFloat(l.paddingTop||"0")-Number.parseFloat(l.paddingBottom||"0"));if(t.clientHeight<=1){const u=R(t,$);if(u>0)return u;const h=e.getBoundingClientRect();return Math.max(e.clientHeight,e.offsetHeight,Math.ceil(h.height||0))}const i=r?Math.max(R(t,Xt),yt(n)):0,d=a?Math.max(R(t,jt)+R(t,Kt)+R(t,Yt),yt(o)):0,c=Math.max(1,Math.floor(s-i-d));return J(r,i),J(a,d),J(e,c),a&&(a.style.marginTop="auto"),t.setAttribute($,String(c)),c},Xe=(t,e,r)=>{const a=Math.ceil(r-Math.max(0,e))+M*2;return Math.max(1,Math.min(t,Number.isFinite(a)?a:t))},vt=(t,e)=>{const r=R(t,$);if(r>0)return r;const a=e.getBoundingClientRect();return Math.max(e.clientHeight,e.offsetHeight,Math.ceil(a.height||0))},L=(t,e)=>{const r=t.getBoundingClientRect();return{top:Math.max(0,Math.floor(r.top-e.top)),bottom:Math.max(0,Math.ceil(r.bottom-e.top))}},lt=t=>Array.from(t.querySelectorAll("tr")).filter(e=>e.closest("table")===t&&!e.closest("thead")),st=(t,e)=>{const r=lt(t)[0];if(!r)return 0;const a=L(t,e).top,n=L(r,e).top;return Math.max(0,n-a)},xt=t=>Array.from(t.children).filter(e=>e instanceof HTMLTableCellElement),je=({row:t,table:e,rootRect:r,contentCapacityPx:a})=>{const n=xt(t);if(!n.length)return null;const o=n.reduce((p,g,f)=>{const m=String(g.textContent||"").replace(/\s+/g,"").length,b=String(n[p].textContent||"").replace(/\s+/g,"").length;return m>b?f:p},0),l=n[o],s=Array.from(l.children).filter(p=>p instanceof HTMLElement).map(p=>({node:p,...L(p,r)})).filter(p=>p.bottom>p.top);if(s.length<2)return null;const i=st(e,r),d=Math.max(48,Math.min(a-i-48,Math.floor(a*.42))),c=[];let u=[],h=0;return s.forEach(p=>{if(!u.length){u=[p],h=p.top;return}if(p.bottom-h>d){c.push(u),u=[p],h=p.top;return}u.push(p)}),u.length&&c.push(u),c.length<2||c.some(p=>p.length===1&&p[0].bottom-p[0].top>d)?null:c.map((p,g)=>{const f=t.cloneNode(!0),m=xt(f),b=m[o];b&&b.replaceChildren(...p.map(x=>x.node.cloneNode(!0))),g>0&&(m.forEach((x,w)=>{w!==o&&x.replaceChildren()}),f.setAttribute("data-print-table-continuation","true"));const y=p[0].top,S=p[p.length-1].bottom;return{top:y,bottom:Math.min(y+d,Math.max(S,y+1)),kind:"table-row-part",node:t,sourceRow:t,rowPart:f,table:e,tableRowOffsetPx:i}})},Ke=(t,e)=>{const r=t.getBoundingClientRect(),a=[];return $t(t).forEach(n=>{const o=n,{top:l,bottom:s}=L(o,r);if(!(s<=l)){if(o instanceof HTMLTableElement){const i=lt(o);if(i.length){i.forEach(d=>{const c=L(d,r);if(c.bottom>c.top){const u=c.bottom-c.top,h=st(o,r),p=Math.max(48,e-h-8),g=d.querySelector("table")?zt(d,p,U):null;if(g){let m=0;g.forEach(b=>{const y=Math.max(...b.map(S=>S.height));a.push({top:c.top+m,bottom:c.top+m+y,kind:"table-row-slice",node:d,table:o,tableRowOffsetPx:h,sliceStartPx:m,sliceHeightPx:y,cellSlices:b}),m+=y});return}const f=d.querySelector("img,svg,canvas,iframe,video")?[]:U(d,p,!0);if(f.length>1){f.forEach(m=>a.push({top:c.top+m.start,bottom:c.top+m.start+m.height,kind:"table-row-slice",node:d,table:o,tableRowOffsetPx:h,sliceStartPx:m.start,sliceHeightPx:m.height}));return}if(u>p){const m=je({row:d,table:o,rootRect:r,contentCapacityPx:e});if(m){a.push(...m);return}for(const b of U(d,p)){const y=b.start,S=b.height;a.push({top:c.top+y,bottom:c.top+y+S,kind:"table-row-slice",node:d,table:o,tableRowOffsetPx:h,sliceStartPx:y,sliceHeightPx:S})}return}a.push({...c,kind:"table-row",node:d,table:o})}});return}}if(!o.matches("[data-print-preserve-space],[data-print-keep-together]")&&(s-l>e||o.matches("p,li,blockquote,pre,div,span"))){const i=Ft(o,e,r.top);if(i&&i.length>1){a.push(...i.map(d=>({...d,sourceElement:o,kind:"node"})));return}}a.push({top:l,bottom:s,kind:"node",node:o})}}),a.forEach(n=>{n.flowRoot=t}),a},Ye=(t,e,r)=>{if(!t.length)return[];const a=e.getBoundingClientRect(),n=Math.max(0,t[0].top),o=new Map,l=[];let s=[],i=0;const d=c=>{const u=c.bottom-i+n;if(c.kind!=="table-row"||!c.table||s.some(p=>p.table===c.table))return u;let h=o.get(c.table);return h===void 0&&(h=st(c.table,a),o.set(c.table,h)),u+h};return t.forEach(c=>{if(c.kind==="table-row-slice"||c.kind==="table-row-part"){s.length&&l.push(s),l.push([c]),s=[],i=0;return}if(!s.length){s=[c],i=c.top;return}if(d(c)>r){l.push(s),s=[c],i=c.top;return}s.push(c)}),s.length&&l.push(s),l},z=(t,e)=>{const r=t.cloneNode(!0),a=new Set(e),n=Array.from(t.querySelectorAll("tr"));return Array.from(r.querySelectorAll("tr")).forEach((l,s)=>{const i=n[s];!i||i.closest("table")!==t||i.closest("thead")||a.has(i)||l.remove()}),r},Qe=(t,e)=>{const r=e.sourceRow||e.node,a=e.rowPart;if(!r||!a)return null;const n=z(t,[r]),o=lt(n)[0];return o?(o.replaceWith(a.cloneNode(!0)),n):null},St=t=>{t.style.position="absolute",t.style.insetInlineStart="0",t.style.width="100%",t.style.maxWidth="100%",t.style.margin="0",t.style.boxSizing="border-box"},Ze=(t,e)=>{const r=e.table,a=e.node;if(!r||e.kind!=="table-row-slice")return null;const n=Math.max(0,Math.ceil(e.tableRowOffsetPx||0)),o=Math.max(0,Math.floor(e.sliceStartPx||0)),l=Math.max(1,Math.ceil(e.sliceHeightPx||0)),s=t.createElement("div");if(s.className="print-template-table-row-slice",s.style.position="relative",s.style.width="100%",s.style.height=`${n+l}px`,s.style.overflow="hidden",s.style.boxSizing="border-box",s.style.contain="layout paint",n>0){const c=t.createElement("div");c.style.position="absolute",c.style.top="0",c.style.insetInlineStart="0",c.style.width="100%",c.style.height=`${n}px`,c.style.overflow="hidden",c.style.zIndex="1",c.style.contain="layout paint";const u=z(r,[a]);St(u),u.style.top="0",u.querySelectorAll("tbody").forEach(h=>{h.style.visibility="hidden"}),c.append(u),s.append(c)}const i=t.createElement("div");i.style.position="absolute",i.style.top=`${n}px`,i.style.insetInlineStart="0",i.style.width="100%",i.style.height=`${l}px`,i.style.overflow="hidden",i.style.boxSizing="border-box",i.style.contain="layout paint";const d=z(r,[a]);return St(d),d.style.top=`-${n+o}px`,i.append(d),s.append(i),s},Zt=(t,e)=>{var o,l,s;const r=t.createDocumentFragment(),a=Lt(t,((o=e[0])==null?void 0:o.flowRoot)||null,r);let n=0;for(;n<e.length;){const i=e[n];if(i.kind==="node"){a(i.sourceElement||i.node,i.node.cloneNode(!0)),n+=1;continue}if(i.kind==="table-row-slice"){const u={...i,cellSlices:(l=i.cellSlices)==null?void 0:l.map(p=>({...p}))};for(n+=1;n<e.length&&e[n].kind==="table-row-slice"&&e[n].node===i.node&&e[n].table===i.table&&Math.abs((u.sliceStartPx||0)+(u.sliceHeightPx||0)-(e[n].sliceStartPx||0))<1;)(s=u.cellSlices)==null||s.forEach((p,g)=>{var f;p.height+=((f=e[n].cellSlices)==null?void 0:f[g].height)||0}),u.sliceHeightPx=(u.sliceHeightPx||0)+(e[n].sliceHeightPx||0),n+=1;const h=u.cellSlices&&i.table?Ot(i.node,z(i.table,[i.node]),u.cellSlices):Ze(t,u);h&&i.table&&a(i.table,h);continue}if(i.kind==="table-row-part"){const u=i.table?Qe(i.table,i):null;u&&i.table&&a(i.table,u),n+=1;continue}const d=i.table;if(!d){n+=1;continue}const c=[];for(;n<e.length&&e[n].kind==="table-row"&&e[n].table===d;)c.push(e[n].node),n+=1;a(d,z(d,c))}return r},Je=(t,e)=>{const r=Ke(t,e);if(!r.length||r.some(n=>n.bottom-n.top>e))return null;const a=Ye(r,t,e);return a.length?a:null},tr=t=>Math.max(80,Math.floor(t)-Qt),Jt=({page:t,fragment:e,bodyHeightPx:r})=>{const a=t.querySelector(_),n=t.querySelector(P),o=t.querySelector(H);if(!a||!n||!o)return!1;const l=`${Math.ceil(r)}px`;return a.style.flex=`0 0 ${l}`,a.style.height=l,a.style.minHeight="0",a.style.maxHeight=l,a.style.overflow="hidden",a.style.contain="none",a.style.position="relative",n.style.position="relative",n.style.top="auto",n.style.insetInlineStart="auto",n.style.width="100%",n.style.boxSizing="border-box",n.style.paddingTop=`${M}px`,n.style.paddingBottom=`${M}px`,n.style.transform="none",o.replaceChildren(e),!0},er=({shell:t,pageTemplate:e,fragments:r,bodyHeightPx:a})=>{if(!t.isConnected||t.clientWidth<=1)return r;const n=s=>{const i=e.cloneNode(!0);i.style.position="absolute",i.style.top="0",i.style.insetInlineStart="-100000px",i.style.visibility="hidden",i.style.pointerEvents="none",i.style.pageBreakAfter="auto",i.style.breakAfter="auto";const d=Zt(i.ownerDocument,s);if(!Jt({page:i,fragment:d,bodyHeightPx:a}))return!1;t.appendChild(i);const c=i.querySelector(_),u=i.querySelector(P),h=i.querySelector(H),p=Math.max((c==null?void 0:c.scrollHeight)||0,(u==null?void 0:u.scrollHeight)||0,((h==null?void 0:h.scrollHeight)||0)+M*2);return i.remove(),p<=Math.ceil(a)+1},o=et(r.flat(),n);return o||r.flatMap(s=>{const i=et(s,n);return i||(s.length===1&&s[0].kind==="table-row-part"?[s]:s.map(d=>[d]))})},zr=(t=document)=>{const e=Array.from(t.querySelectorAll(qt)),r=e[0],a=r==null?void 0:r.querySelector(Ut),n=r==null?void 0:r.querySelector(H),o=r==null?void 0:r.closest(".invoice-custom-print-shell");if(!r||!a||!n||!o)return 0;ot(n),wt(r.querySelector(P));const i=(r.getAttribute("data-print-layout-mode")==="letterhead"?vt(r,a):Ge(r,a))||vt(r,a),d=De(i),c=Je(n,tr(d)),u=r.cloneNode(!0),h=c?er({shell:o,pageTemplate:u,fragments:c,bodyHeightPx:i}):null,p=h?[]:(()=>{const f=Math.max(n.scrollHeight,n.offsetHeight,n.clientHeight,1),m=Oe(n);return m.length?Ue({totalHeight:f,pageBodyStepPx:d,anchors:m}):[{start:0,end:Math.min(f,d)}]})(),g=Math.max(n.scrollHeight,n.offsetHeight,n.clientHeight,1);return e.forEach(f=>f.remove()),h?(h.forEach((f,m)=>{const b=u.cloneNode(!0),y=b.querySelector(G),S=Zt(b.ownerDocument,f);Jt({page:b,fragment:S,bodyHeightPx:i})&&(y&&(y.textContent=`صفحه ${q(m+1)} از ${q(h.length)}`),b.style.pageBreakAfter=m<h.length-1?"always":"auto",b.style.breakAfter=m<h.length-1?"page":"auto",o.appendChild(b),rt(b,m===h.length-1,!0))}),h.length):(p.forEach((f,m)=>{const b=u.cloneNode(!0),y=b.querySelector(_),S=b.querySelector(P),x=b.querySelector(G),w=Ve(i,Math.max(1,Math.ceil(f.end-f.start))),v=m===p.length-1,T=v?Xe(i,f.start,g):i;if(y){const E=`${Math.min(w,T)}px`;y.style.flex=`0 0 ${E}`,y.style.height=E,y.style.minHeight="0",y.style.maxHeight=E}S&&(wt(S),S.style.transform=`translateY(${We(f.start)}px)`),x&&(x.textContent=`صفحه ${q(m+1)} از ${q(p.length)}`),b.style.pageBreakAfter=m<p.length-1?"always":"auto",b.style.breakAfter=m<p.length-1?"page":"auto",o.appendChild(b),rt(b,v)}),p.length)},rr=()=>`
  (function () {
    var pageSelector = '${qt}';
    var pages = Array.prototype.slice.call(document.querySelectorAll(pageSelector));
    var firstPage = pages[0];
    if (!firstPage) return;
    var shell = firstPage.closest('.invoice-custom-print-shell');
    var body = firstPage.querySelector('${Ut}');
    var inner = firstPage.querySelector('${H}');
    if (!shell || !body || !inner) return;
    var positionPageFooter = ${rt.toString()};
    var packFragments = ${et.toString()};
    var rowSlices = ${U.toString()};
    var splitTextBlock = ${Ft.toString()};
    var flowLeaves = ${$t.toString()};
    var fragmentAppender = ${Lt.toString()};
    var cellContinuations = ${zt.toString()};
    var renderCellContinuation = ${Ot.toString()};
    var isNativeFlow = firstPage.getAttribute('data-print-layout-mode') === 'native-flow';
    if (isNativeFlow) {
      // Default list templates have a presentation-only outer wrapper. Move
      // its styles to the measuring root so table rows can be materialized,
      // rather than treating the whole report as one indivisible block.
      while (inner.children.length === 1) {
        var wrapper = inner.firstElementChild;
        if (!wrapper || !/^(DIV|SECTION|MAIN|ARTICLE)$/.test(wrapper.tagName) || wrapper.id) break;
        if (Array.prototype.some.call(wrapper.style, function (property) {
          return !/^(direction|color|font-family|font-size|line-height|text-align|width)$/.test(property);
        })) break;
        inner.style.cssText += ';' + wrapper.style.cssText;
        wrapper.replaceWith.apply(wrapper, Array.prototype.slice.call(wrapper.childNodes));
      }
    }

    var hasVisibleText = function (value) {
      return String(value || '').replace(/[\\s\\u00a0\\u200b-\\u200d\\u2060\\ufeff]+/g, '').length > 0;
    };
    var trimTerminalSpacers = function (container) {
      var removable = function (element) {
        if (!element || element.hasAttribute('data-print-preserve-space')) return false;
        if (element.querySelector('audio,canvas,embed,iframe,img,object,picture,svg,video')) return false;
        if (/(?:^|;)\\s*(?:border(?:-[a-z-]+)?|height|min-height|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?)\\s*:/i.test(String(element.getAttribute('style') || ''))) return false;
        return !hasVisibleText(element.textContent);
      };
      var last = container.lastChild;
      while (last && last.nodeType === Node.TEXT_NODE && !hasVisibleText(last.textContent)) {
        var previousText = last.previousSibling;
        last.remove();
        last = previousText;
      }
      while (last && last.nodeType === Node.ELEMENT_NODE && removable(last)) {
        var previous = last.previousSibling;
        last.remove();
        last = previous;
        while (last && last.nodeType === Node.TEXT_NODE && !hasVisibleText(last.textContent)) {
          var previousWhitespace = last.previousSibling;
          last.remove();
          last = previousWhitespace;
        }
      }
      var terminal = container.lastElementChild;
      var terminalTag = String((terminal && terminal.tagName) || '').toLowerCase();
      if (terminal && /^(article|aside|blockquote|div|li|main|section)$/.test(terminalTag)) {
        trimTerminalSpacers(terminal);
      }
    };
    var measuredHeight = function (element) {
      if (!element) return 0;
      var rect = element.getBoundingClientRect();
      var descendantBottom = Array.prototype.slice.call(element.querySelectorAll('*')).reduce(function (maxBottom, child) {
        var childRect = child.getBoundingClientRect();
        return Math.max(maxBottom, childRect.bottom - rect.top);
      }, 0);
      return Math.max(element.scrollHeight || 0, element.offsetHeight || 0, element.clientHeight || 0, Math.ceil(rect.height || 0), Math.ceil(descendantBottom || 0));
    };
    var positiveAttr = function (name) {
      var value = Number(firstPage.getAttribute(name));
      return Number.isFinite(value) && value > 0 ? value : 0;
    };
    var setHeight = function (element, value) {
      if (!element || !Number.isFinite(value) || value <= 0) return;
      var cssHeight = Math.ceil(value) + 'px';
      element.style.flex = '0 0 ' + cssHeight;
      element.style.height = cssHeight;
      element.style.minHeight = cssHeight;
      element.style.maxHeight = cssHeight;
    };
    var edgeGuard = isNativeFlow ? 4 : ${M};
    var isolateSegment = function (element) {
      if (!element) return;
      element.style.position = 'absolute';
      element.style.top = '0';
      element.style.insetInlineStart = '0';
      element.style.width = '100%';
    };
    trimTerminalSpacers(inner);
    isolateSegment(firstPage.querySelector('${P}'));
    var isLetterhead = firstPage.getAttribute('data-print-layout-mode') === 'letterhead';
    if (!isLetterhead) {
      var header = firstPage.querySelector('${Dt}');
      var footerForLayout = firstPage.querySelector('${Wt}');
      var pageStyle = window.getComputedStyle(firstPage);
      var contentHeight = Math.max(1, firstPage.clientHeight - parseFloat(pageStyle.paddingTop || '0') - parseFloat(pageStyle.paddingBottom || '0'));
      var headerHeight = header ? Math.max(positiveAttr('${Xt}'), measuredHeight(firstPage.querySelector('${Vt}'))) : 0;
      var footerHeight = footerForLayout ? Math.max(
        positiveAttr('${jt}') + positiveAttr('${Kt}') + positiveAttr('${Yt}'),
        measuredHeight(firstPage.querySelector('${Gt}'))
      ) : 0;
      var finalBodyHeight = Math.max(1, Math.floor(contentHeight - headerHeight - footerHeight));
      setHeight(header, headerHeight);
      setHeight(footerForLayout, footerHeight);
      setHeight(body, finalBodyHeight);
      if (footerForLayout) footerForLayout.style.marginTop = 'auto';
      firstPage.setAttribute('${$}', String(finalBodyHeight));
    }

    var rootRect = inner.getBoundingClientRect();
    var totalHeight = Math.max(inner.scrollHeight || 0, inner.offsetHeight || 0, inner.clientHeight || 0, 1);
    var bodyRect = body.getBoundingClientRect();
    var declaredBodyHeight = Number(firstPage.getAttribute('${$}'));
    var bodyHeight = Number.isFinite(declaredBodyHeight) && declaredBodyHeight > 0
      ? declaredBodyHeight
      : Math.max(body.clientHeight || 0, body.offsetHeight || 0, Math.ceil(bodyRect.height || 0));
    var step = Math.max(1, Math.floor(bodyHeight) - edgeGuard * 2);
    var materializedStep = Math.max(80, step - (isNativeFlow ? 10 : ${Qt}));

    var relativeBounds = function (element, baseRect) {
      var rect = element.getBoundingClientRect();
      return {
        top: Math.max(0, Math.floor(rect.top - baseRect.top)),
        bottom: Math.max(0, Math.ceil(rect.bottom - baseRect.top))
      };
    };
    var tableRows = function (table) {
      return Array.prototype.slice.call(table.querySelectorAll('tr')).filter(function (row) {
        return row.closest('table') === table && !row.closest('thead');
      });
    };
    var buildMaterializedFragments = function () {
      var sourceRect = inner.getBoundingClientRect();
      var units = [];
      flowLeaves(inner).forEach(function (element) {
        var bounds = relativeBounds(element, sourceRect);
        if (bounds.bottom <= bounds.top) return;
        if (String(element.tagName || '').toLowerCase() === 'table') {
          var rows = tableRows(element);
          if (rows.length) {
            var tableTop = bounds.top;
            rows.forEach(function (row) {
              var rowBounds = relativeBounds(row, sourceRect);
              if (rowBounds.bottom > rowBounds.top) {
                var rowHeight = rowBounds.bottom - rowBounds.top;
                var firstBodyRow = rows[0];
                var rowOffset = firstBodyRow ? Math.max(0, relativeBounds(firstBodyRow, sourceRect).top - tableTop) : 0;
                var rowSliceCapacity = Math.max(48, materializedStep - rowOffset - 8);
                var cellParts = row.querySelector('table') ? cellContinuations(row, rowSliceCapacity, rowSlices) : null;
                if (cellParts) {
                  var cellOffset = 0;
                  cellParts.forEach(function (cellSlices) {
                    var height = Math.max.apply(null, cellSlices.map(function (slice) { return slice.height; }));
                    units.push({ top: rowBounds.top + cellOffset, bottom: rowBounds.top + cellOffset + height,
                      kind: 'table-row-slice', node: row, table: element, tableRowOffset: rowOffset,
                      sliceStart: cellOffset, sliceHeight: height, cellSlices: cellSlices });
                    cellOffset += height;
                  });
                  return;
                }
                var lineSlices = !row.querySelector('img,svg,canvas,iframe,video') ? rowSlices(row, rowSliceCapacity, true) : [];
                if (lineSlices.length > 1) {
                  lineSlices.forEach(function (slice) {
                    units.push({ top: rowBounds.top + slice.start, bottom: rowBounds.top + slice.start + slice.height,
                      kind: 'table-row-slice', node: row, table: element, tableRowOffset: rowOffset,
                      sliceStart: slice.start, sliceHeight: slice.height });
                  });
                  return;
                }
                if (rowHeight > rowSliceCapacity) {
                  var cells = Array.prototype.slice.call(row.children).filter(function (cell) {
                    var tag = String(cell.tagName || '').toLowerCase();
                    return tag === 'td' || tag === 'th';
                  });
                  var leaderIndex = cells.reduce(function (winner, cell, index) {
                    var length = String(cell.textContent || '').replace(/s+/g, '').length;
                    var winnerLength = String(cells[winner].textContent || '').replace(/s+/g, '').length;
                    return length > winnerLength ? index : winner;
                  }, 0);
                  var leaderCell = cells[leaderIndex];
                  var blocks = leaderCell
                    ? Array.prototype.slice.call(leaderCell.children)
                      .map(function (block) {
                        var blockBounds = relativeBounds(block, sourceRect);
                        return { node: block, top: blockBounds.top, bottom: blockBounds.bottom };
                      })
                      .filter(function (block) { return block.bottom > block.top; })
                    : [];
                  var partCapacity = Math.max(48, Math.min(materializedStep - rowOffset - 48, Math.floor(materializedStep * 0.42)));
                  var chunks = [];
                  var currentChunk = [];
                  var currentStart = 0;
                  blocks.forEach(function (block) {
                    if (!currentChunk.length) {
                      currentChunk = [block];
                      currentStart = block.top;
                      return;
                    }
                    if (block.bottom - currentStart > partCapacity) {
                      chunks.push(currentChunk);
                      currentChunk = [block];
                      currentStart = block.top;
                    } else {
                      currentChunk.push(block);
                    }
                  });
                  if (currentChunk.length) chunks.push(currentChunk);
                  var canUseParts = chunks.length >= 2 && !chunks.some(function (chunk) {
                    return chunk.length === 1 && chunk[0].bottom - chunk[0].top > partCapacity;
                  });
                  if (canUseParts) {
                    chunks.forEach(function (chunk, partIndex) {
                      var rowPart = row.cloneNode(true);
                      var partCells = Array.prototype.slice.call(rowPart.children).filter(function (cell) {
                        var tag = String(cell.tagName || '').toLowerCase();
                        return tag === 'td' || tag === 'th';
                      });
                      var partLeader = partCells[leaderIndex];
                      if (partLeader) partLeader.replaceChildren.apply(partLeader, chunk.map(function (block) { return block.node.cloneNode(true); }));
                      if (partIndex > 0) {
                        partCells.forEach(function (cell, index) {
                          if (index !== leaderIndex) cell.replaceChildren();
                        });
                        rowPart.setAttribute('data-print-table-continuation', 'true');
                      }
                      var start = chunk[0].top;
                      var end = chunk[chunk.length - 1].bottom;
                      units.push({
                        top: start,
                        bottom: Math.min(start + partCapacity, Math.max(end, start + 1)),
                        kind: 'table-row-part',
                        node: row,
                        sourceRow: row,
                        rowPart: rowPart,
                        table: element,
                        tableRowOffset: rowOffset
                      });
                    });
                    return;
                  }
                  rowSlices(row, rowSliceCapacity).forEach(function (slice) {
                    var sliceStart = slice.start;
                    var sliceHeight = slice.height;
                    units.push({
                      top: rowBounds.top + sliceStart,
                      bottom: rowBounds.top + sliceStart + sliceHeight,
                      kind: 'table-row-slice',
                      node: row,
                      table: element,
                      tableRowOffset: rowOffset,
                      sliceStart: sliceStart,
                      sliceHeight: sliceHeight
                    });
                  });
                  return;
                }
                units.push({ top: rowBounds.top, bottom: rowBounds.bottom, kind: 'table-row', node: row, table: element });
              }
            });
            return;
          }
        }
        if (!element.matches('[data-print-preserve-space],[data-print-keep-together]') && (bounds.bottom - bounds.top > materializedStep || element.matches('p,li,blockquote,pre,div,span'))) {
          var textParts = splitTextBlock(element, materializedStep, sourceRect.top);
          if (textParts && textParts.length > 1) {
            textParts.forEach(function (part) { units.push({ top: part.top, bottom: part.bottom, kind: 'node', node: part.node, sourceElement: element }); });
            return;
          }
        }
        units.push({ top: bounds.top, bottom: bounds.bottom, kind: 'node', node: element });
      });
      if (!units.length || units.some(function (unit) { return unit.bottom - unit.top > materializedStep; })) return null;

      var initialInset = Math.max(0, units[0].top);
      var headerHeights = new Map();
      var groups = [];
      var current = [];
      var currentStart = 0;
      units.forEach(function (unit) {
        if (unit.kind === 'table-row-slice' || unit.kind === 'table-row-part') {
          if (current.length) groups.push(current);
          groups.push([unit]);
          current = [];
          currentStart = 0;
          return;
        }
        if (!current.length) {
          current = [unit];
          currentStart = unit.top;
          return;
        }
        var estimatedHeight = unit.bottom - currentStart + initialInset;
        if (unit.kind === 'table-row' && unit.table && !current.some(function (item) { return item.table === unit.table; })) {
          var headerHeight = headerHeights.get(unit.table);
          if (headerHeight === undefined) {
            var firstRow = tableRows(unit.table)[0];
            headerHeight = firstRow
              ? Math.max(0, relativeBounds(firstRow, sourceRect).top - relativeBounds(unit.table, sourceRect).top)
              : 0;
            headerHeights.set(unit.table, headerHeight);
          }
          estimatedHeight += headerHeight;
        }
        if (estimatedHeight > materializedStep) {
          groups.push(current);
          current = [unit];
          currentStart = unit.top;
        } else {
          current.push(unit);
        }
      });
      if (current.length) groups.push(current);
      return groups.length ? groups : null;
    };
    var materialized = buildMaterializedFragments();
    if (materialized) {
      var cloneTableRows = function (table, selectedRows) {
        var clone = table.cloneNode(true);
        var selected = new Set(selectedRows);
        var originalRows = Array.prototype.slice.call(table.querySelectorAll('tr'));
        Array.prototype.slice.call(clone.querySelectorAll('tr')).forEach(function (row, index) {
          var original = originalRows[index];
          if (!original || original.closest('table') !== table || original.closest('thead') || selected.has(original)) return;
          row.remove();
        });
        return clone;
      };
      var cloneTableRowPart = function (table, unit) {
        var sourceRow = unit.sourceRow || unit.node;
        if (!sourceRow || !unit.rowPart) return null;
        var clone = cloneTableRows(table, [sourceRow]);
        var target = tableRows(clone)[0];
        if (!target) return null;
        target.replaceWith(unit.rowPart.cloneNode(true));
        return clone;
      };
      var applySliceTableStyle = function (table) {
        table.style.position = 'absolute';
        table.style.insetInlineStart = '0';
        table.style.width = '100%';
        table.style.maxWidth = '100%';
        table.style.margin = '0';
        table.style.boxSizing = 'border-box';
      };
      var buildTableRowSlice = function (unit) {
        if (!unit.table || unit.kind !== 'table-row-slice') return null;
        var headerHeight = Math.max(0, Math.ceil(unit.tableRowOffset || 0));
        var sliceStart = Math.max(0, Math.floor(unit.sliceStart || 0));
        var sliceHeight = Math.max(1, Math.ceil(unit.sliceHeight || 0));
        var wrapper = document.createElement('div');
        wrapper.className = 'print-template-table-row-slice';
        wrapper.style.position = 'relative';
        wrapper.style.width = '100%';
        wrapper.style.height = headerHeight + sliceHeight + 'px';
        wrapper.style.overflow = 'hidden';
        wrapper.style.boxSizing = 'border-box';
        wrapper.style.contain = 'layout paint';
        if (headerHeight > 0) {
          var headerViewport = document.createElement('div');
          headerViewport.style.position = 'absolute';
          headerViewport.style.top = '0';
          headerViewport.style.insetInlineStart = '0';
          headerViewport.style.width = '100%';
          headerViewport.style.height = headerHeight + 'px';
          headerViewport.style.overflow = 'hidden';
          headerViewport.style.zIndex = '1';
          headerViewport.style.contain = 'layout paint';
          var headerTable = cloneTableRows(unit.table, [unit.node]);
          applySliceTableStyle(headerTable);
          headerTable.style.top = '0';
          Array.prototype.slice.call(headerTable.querySelectorAll('tbody')).forEach(function (tableBody) {
            tableBody.style.visibility = 'hidden';
          });
          headerViewport.append(headerTable);
          wrapper.append(headerViewport);
        }
        var rowViewport = document.createElement('div');
        rowViewport.style.position = 'absolute';
        rowViewport.style.top = headerHeight + 'px';
        rowViewport.style.insetInlineStart = '0';
        rowViewport.style.width = '100%';
        rowViewport.style.height = sliceHeight + 'px';
        rowViewport.style.overflow = 'hidden';
        rowViewport.style.boxSizing = 'border-box';
        rowViewport.style.contain = 'layout paint';
        var rowTable = cloneTableRows(unit.table, [unit.node]);
        applySliceTableStyle(rowTable);
        rowTable.style.top = '-' + (headerHeight + sliceStart) + 'px';
        rowViewport.append(rowTable);
        wrapper.append(rowViewport);
        return wrapper;
      };
      var buildFragment = function (fragmentUnits) {
        var fragment = document.createDocumentFragment();
        var append = fragmentAppender(document, inner, fragment);
        var index = 0;
        while (index < fragmentUnits.length) {
          var unit = fragmentUnits[index];
          if (unit.kind === 'node') {
            append(unit.sourceElement || unit.node, unit.node.cloneNode(true));
            index += 1;
            continue;
          }
          if (unit.kind === 'table-row-slice') {
            var combined = Object.assign({}, unit);
            if (unit.cellSlices) combined.cellSlices = unit.cellSlices.map(function (slice) { return Object.assign({}, slice); });
            index += 1;
            while (index < fragmentUnits.length && fragmentUnits[index].kind === 'table-row-slice' && fragmentUnits[index].node === unit.node && fragmentUnits[index].table === unit.table && Math.abs(combined.sliceStart + combined.sliceHeight - fragmentUnits[index].sliceStart) < 1) {
              if (combined.cellSlices) combined.cellSlices.forEach(function (slice, cellIndex) { slice.height += fragmentUnits[index].cellSlices[cellIndex].height; });
              combined.sliceHeight += fragmentUnits[index].sliceHeight; index += 1;
            }
            var slice = combined.cellSlices ? renderCellContinuation(unit.node, cloneTableRows(unit.table, [unit.node]), combined.cellSlices) : buildTableRowSlice(combined);
            if (slice) append(unit.table, slice);
            continue;
          }
          if (unit.kind === 'table-row-part') {
            var tablePart = unit.table ? cloneTableRowPart(unit.table, unit) : null;
            if (tablePart) append(unit.table, tablePart);
            index += 1;
            continue;
          }
          var table = unit.table;
          var selectedRows = [];
          while (index < fragmentUnits.length && fragmentUnits[index].kind === 'table-row' && fragmentUnits[index].table === table) {
            selectedRows.push(fragmentUnits[index].node);
            index += 1;
          }
          if (table) append(table, cloneTableRows(table, selectedRows));
        }
        return fragment;
      };
      var materializedTemplate = firstPage.cloneNode(true);
      var renderMaterializedFragment = function (page, fragmentUnits) {
        var viewport = page.querySelector('${_}');
        var segment = page.querySelector('${P}');
        var pageInner = page.querySelector('${H}');
        var height = Math.ceil(bodyHeight) + 'px';
        if (!viewport || !segment || !pageInner) return false;
        viewport.style.flex = '0 0 ' + height;
        viewport.style.height = height;
        viewport.style.minHeight = '0';
        viewport.style.maxHeight = height;
        viewport.style.overflow = 'hidden';
        // Do not use CSS containment after materializing the page. Chromium
        // otherwise has been observed to drop the header/footer of alternate
        // pages around split tables in its PDF print compositor.
        viewport.style.contain = 'none';
        viewport.style.position = 'relative';
        segment.style.position = 'relative';
        segment.style.top = 'auto';
        segment.style.insetInlineStart = 'auto';
        segment.style.width = '100%';
        segment.style.boxSizing = 'border-box';
        segment.style.paddingTop = edgeGuard + 'px';
        segment.style.paddingBottom = edgeGuard + 'px';
        segment.style.transform = 'none';
        pageInner.replaceChildren(buildFragment(fragmentUnits));
        return true;
      };
      // Verify each fragment in a real cloned page. This handles differences
      // caused by font fallback, collapsed margins and table border rounding.
      if (shell.isConnected && shell.clientWidth > 1) {
        var fragmentFits = function (fragmentUnits) {
          var candidate = materializedTemplate.cloneNode(true);
          candidate.style.position = 'absolute';
          candidate.style.top = '0';
          candidate.style.insetInlineStart = '-100000px';
          candidate.style.visibility = 'hidden';
          candidate.style.pointerEvents = 'none';
          candidate.style.pageBreakAfter = 'auto';
          candidate.style.breakAfter = 'auto';
          if (!renderMaterializedFragment(candidate, fragmentUnits)) return false;
          shell.appendChild(candidate);
          var viewport = candidate.querySelector('${_}');
          var segment = candidate.querySelector('${P}');
          var pageInner = candidate.querySelector('${H}');
          var actualHeight = Math.max(
            (viewport && viewport.scrollHeight) || 0,
            (segment && segment.scrollHeight) || 0,
            ((pageInner && pageInner.scrollHeight) || 0) + edgeGuard * 2
          );
          candidate.remove();
          return actualHeight <= Math.ceil(bodyHeight) + 1;
        };
        var packed = packFragments(materialized.flat(), fragmentFits);
        var fitted = packed || materialized.reduce(function (all, fragment) {
          var fittedFragment = packFragments(fragment, fragmentFits);
          if (fittedFragment) return all.concat(fittedFragment);
          if (fragment.length === 1 && fragment[0].kind === 'table-row-part') return all.concat([fragment]);
          return all.concat(fragment.map(function (unit) { return [unit]; }));
        }, []);
        materialized = fitted;
      }
      if (materialized) {
        pages.forEach(function (page) { page.remove(); });
        var digitsForFragments = '۰۱۲۳۴۵۶۷۸۹';
        var toFaForFragments = function (value) {
          return String(value).replace(/\\d/g, function (digit) { return digitsForFragments[Number(digit)] || digit; });
        };
        materialized.forEach(function (fragmentUnits, index) {
          var page = materializedTemplate.cloneNode(true);
          var footer = page.querySelector('.print-template-footer');
          var counter = page.querySelector('${G}');
          if (!renderMaterializedFragment(page, fragmentUnits)) return;
          if (counter) counter.textContent = 'صفحه ' + toFaForFragments(index + 1) + ' از ' + toFaForFragments(materialized.length);
          page.style.pageBreakAfter = index < materialized.length - 1 ? 'always' : 'auto';
          page.style.breakAfter = index < materialized.length - 1 ? 'page' : 'auto';
          shell.appendChild(page);
          positionPageFooter(page, index === materialized.length - 1, true);
        });
        return;
      }
    }

    var rawLines = [];
    var walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
    var node = walker.nextNode();
    while (node) {
      if (hasVisibleText(node.textContent)) {
        var range = document.createRange();
        range.selectNodeContents(node);
        Array.prototype.forEach.call(range.getClientRects(), function (rect) {
          var top = Math.floor(rect.top - rootRect.top);
          var bottom = Math.ceil(rect.bottom - rootRect.top);
          if (bottom - top >= 2) rawLines.push({ top: top, bottom: bottom });
        });
        range.detach && range.detach();
      }
      node = walker.nextNode();
    }
    rawLines.sort(function (a, b) { return a.top - b.top || a.bottom - b.bottom; });
    var lines = [];
    rawLines.forEach(function (rect) {
      var current = lines[lines.length - 1];
      var overlap = current ? Math.max(0, Math.min(current.bottom, rect.bottom) - Math.max(current.top, rect.top)) : 0;
      var minHeight = current ? Math.min(current.bottom - current.top, rect.bottom - rect.top) : 0;
      var same = current && (overlap / Math.max(1, minHeight) >= 0.6 ||
        Math.abs(rect.top - current.top) <= 3 ||
        Math.abs(rect.bottom - current.bottom) <= 3);
      if (same) {
        current.top = Math.min(current.top, rect.top);
        current.bottom = Math.max(current.bottom, rect.bottom);
      } else {
        lines.push({ top: rect.top, bottom: rect.bottom });
      }
    });
    if (!lines.length) {
      lines.push({ top: 0, bottom: Math.min(totalHeight, step) });
    }

    var ranges = [];
    var start = 0;
    while (start + step < totalHeight - 1) {
      var target = Math.min(totalHeight, start + step);
      var candidates = lines.filter(function (line) { return line.bottom > start + 48 && line.bottom <= target; });
      var end = candidates.length ? candidates[candidates.length - 1].bottom : 0;
      if (!end) {
        // A large title, rich-text paragraph line or table-cell line can
        // cross the target without having a bottom inside it. Stop before
        // that exact line; never fall back to a cut through its glyphs.
        var crossing = lines.find(function (line) {
          return line.top > start + 1 && line.top < target && line.bottom > target;
        });
        if (crossing) {
          end = crossing.top;
        } else {
          var tops = lines.filter(function (line) { return line.top > start + 48 && line.top < target; });
          end = tops.length ? tops[tops.length - 1].top : target;
        }
      }
      end = Math.max(start + 1, Math.min(totalHeight, Math.ceil(end)));
      ranges.push({ start: start, end: end });
      // Skip only the whitespace after a completed line. Starting at the
      // preceding end can still expose a fractional glyph in Chrome's print
      // compositor; starting at the next line top cannot duplicate it.
      var next = lines.find(function (line) { return line.top >= end; });
      start = next ? Math.max(0, Math.floor(next.top)) : totalHeight;
      if (start >= totalHeight - 1) break;
    }
    if (start < totalHeight) ranges.push({ start: start, end: totalHeight });
    if (!ranges.length) return;

    var template = firstPage.cloneNode(true);
    pages.forEach(function (page) { page.remove(); });
    var digits = '۰۱۲۳۴۵۶۷۸۹';
    var fa = function (value) { return String(value).replace(/\\d/g, function (digit) { return digits[Number(digit)] || digit; }); };
    ranges.forEach(function (item, index) {
      var page = template.cloneNode(true);
      var viewport = page.querySelector('${_}');
      var segment = page.querySelector('${P}');
      var footer = page.querySelector('.print-template-footer');
      var counter = page.querySelector('${G}');
      var height = Math.min(bodyHeight, Math.max(1, Math.ceil(item.end - item.start) + edgeGuard * 2)) + 'px';
      if (viewport) {
        viewport.style.flex = '0 0 ' + height;
        viewport.style.height = height;
        viewport.style.minHeight = '0';
        viewport.style.maxHeight = height;
      }
      if (segment) {
        isolateSegment(segment);
        segment.style.transform = 'translateY(' + (edgeGuard - Math.max(0, item.start)) + 'px)';
      }
      if (counter) counter.textContent = 'صفحه ' + fa(index + 1) + ' از ' + fa(ranges.length);
      page.style.pageBreakAfter = index < ranges.length - 1 ? 'always' : 'auto';
      page.style.breakAfter = index < ranges.length - 1 ? 'page' : 'auto';
      shell.appendChild(page);
      positionPageFooter(page, index === ranges.length - 1);
    });
  })();
`,nr=10,ar=()=>`
(function () {
  var flow = document.querySelector('.kalamapp-native-print-flow[data-kalamapp-native-print-flow="true"]');
  var body = flow && flow.querySelector('.kalamapp-native-print-flow-body');
  if (!flow || !body || flow.getAttribute('data-kalamapp-native-tables-materialized') === 'true') return;
  // Signature pages are materialized by the shared custom-page paginator.
  if (body.querySelector('[data-print-layout-mode="native-flow"]')) return;

  var pxPerMm = 96 / 25.4;
  var paperHeight = Number(flow.getAttribute('data-kalamapp-paper-height-mm') || 0);
  var marginTop = Number(flow.getAttribute('data-kalamapp-margin-top-mm') || 0);
  var marginBottom = Number(flow.getAttribute('data-kalamapp-margin-bottom-mm') || 0);
  var pageCapacity = Math.max(1, (paperHeight - marginTop - marginBottom) * pxPerMm);
  var reserve = ${nr};
  var tableCounter = 0;
  var tables = Array.prototype.slice.call(body.querySelectorAll('table[data-print-block], table[data-print-preserve-rows="true"]'));

  function directRows(table) {
    return Array.prototype.slice.call(table.querySelectorAll('tbody > tr')).filter(function (row) {
      return row.closest('table') === table;
    });
  }

  function measuredHeight(element) {
    if (!element) return 0;
    var rect = element.getBoundingClientRect();
    return Math.max(1, Math.ceil(rect.height || element.offsetHeight || element.scrollHeight || 0));
  }

  tables.forEach(function (table) {
    if (table.parentElement && table.parentElement.closest('table')) return;
    var rows = directRows(table);
    if (rows.length < 2) return;

    var tokenPrefix = 'table-' + tableCounter++ + '-row-';
    var sourceTokens = rows.map(function (row, index) {
      var token = tokenPrefix + index;
      row.setAttribute('data-kalamapp-native-source-row', token);
      return token;
    });
    var tableRect = table.getBoundingClientRect();
    var bodyRect = body.getBoundingClientRect();
    var tableTop = Math.max(0, tableRect.top - bodyRect.top);
    var pageOffset = ((tableTop % pageCapacity) + pageCapacity) % pageCapacity;
    var firstCapacity = Math.max(1, pageCapacity - pageOffset);
    var head = table.querySelector('thead');
    var headerHeight = measuredHeight(head);
    var rowHeights = rows.map(measuredHeight);
    var minimumFirstRow = headerHeight + rowHeights[0] + reserve;
    var forceFirstPageBreak = firstCapacity < minimumFirstRow;
    if (forceFirstPageBreak) firstCapacity = pageCapacity;

    var groups = [];
    var current = [];
    var available = Math.max(1, firstCapacity - headerHeight - reserve);
    var nextAvailable = Math.max(1, pageCapacity - headerHeight - reserve);
    var used = 0;
    rowHeights.forEach(function (rowHeight, rowIndex) {
      if (current.length && used + rowHeight > available) {
        groups.push(current);
        current = [];
        used = 0;
        available = nextAvailable;
      }
      current.push(rowIndex);
      used += rowHeight;
    });
    if (current.length) groups.push(current);
    if (groups.length === 1 && !forceFirstPageBreak) {
      if (head) head.style.display = 'table-row-group';
      table.setAttribute('data-kalamapp-native-table-materialized', 'true');
      return;
    }

    var fragment = document.createDocumentFragment();
    groups.forEach(function (rowIndexes, groupIndex) {
      var clone = table.cloneNode(true);
      var cloneHead = clone.querySelector('thead');
      if (cloneHead) cloneHead.style.display = 'table-row-group';
      directRows(clone).forEach(function (row) { row.remove(); });
      var targetBody = clone.querySelector('tbody');
      rowIndexes.forEach(function (rowIndex) {
        targetBody.appendChild(rows[rowIndex].cloneNode(true));
      });
      if (groupIndex < groups.length - 1) {
        Array.prototype.slice.call(clone.querySelectorAll('tfoot')).forEach(function (foot) { foot.remove(); });
      }
      if (forceFirstPageBreak || groupIndex > 0) {
        clone.style.breakBefore = 'page';
        clone.style.pageBreakBefore = 'always';
      }
      clone.setAttribute('data-kalamapp-native-table-materialized', 'true');
      fragment.appendChild(clone);
    });
    table.replaceWith(fragment);

    var renderedTokens = Array.prototype.slice.call(body.querySelectorAll('[data-kalamapp-native-source-row^="' + tokenPrefix + '"]'))
      .map(function (row) { return row.getAttribute('data-kalamapp-native-source-row'); });
    if (renderedTokens.length !== sourceTokens.length || renderedTokens.some(function (token, index) { return token !== sourceTokens[index]; })) {
      throw new Error('KALAMAPP_PRINT_ROW_INTEGRITY_FAILED');
    }
  });

  flow.setAttribute('data-kalamapp-native-tables-materialized', 'true');
})();
`,te=96/25.4,Tt=2,ee="__KALAMAPP_NATIVE_PRINT_FONT_CSS__",re="__KALAMAPP_NATIVE_PRINT_BASE_HREF__",Et=t=>Math.max(0,Number(t||0))/te,k=t=>Math.max(0,t).toFixed(3),At=({contentHtml:t,sectionPadding:e,position:r,pageMargins:a})=>{const n=r==="header"?`${a.top}mm ${a.right}mm 0 ${a.left}mm`:`0 ${a.right}mm ${a.bottom}mm ${a.left}mm`;return`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <base href="${re}" />
    <style>
      ${ee}
      html {
        margin: ${n};
        font-family: 'Peyda', Tahoma, Arial, sans-serif;
        font-size: 16px;
        direction: rtl;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        margin: 0;
        padding: ${e};
        box-sizing: border-box;
        color: #111827;
        direction: rtl;
        text-align: right;
        font-family: 'Peyda', Tahoma, Arial, sans-serif;
        font-size: 16px;
        line-height: 1.8;
        /* Header/footer HTML is rendered by Chromium in a separate document.
           Clipping that document hides the lower part of the signature lane
           in some Windows PDF print paths, even though the PDF preview has
           already painted it. The outer PDF margin remains the physical
           boundary; this document itself must not introduce another clip. */
        overflow: visible;
      }
      body, body * { box-sizing: border-box; max-width: 100%; font-family: 'Peyda', Tahoma, Arial, sans-serif !important; }
      body img { max-width: 100%; height: auto; }
      body table { width: 100%; border-collapse: collapse; }
      body p { margin: 0 0 6px; }
      [data-kalamapp-print-margin-content] { display: block; width: 100%; min-width: 0; max-width: 100%; overflow: visible; }
      [data-print-signature-band] {
        display: grid !important;
        break-inside: avoid;
        page-break-inside: avoid;
        overflow: visible !important;
      }
    </style>
  </head>
  <body><div data-kalamapp-print-margin-content="true">${t}</div></body>
</html>`},Or=({widthMm:t,heightMm:e,pageMargins:r,sectionPadding:a,contentHtml:n,headerHtml:o,footerHtml:l,signatureHtml:s,signaturePlacement:i="footer",headerHeightPx:d=0,footerHeightPx:c=0,showHeader:u=!1,showFooter:h=!1,backgroundImageUrl:p,fixedOverlayHtml:g,artworkHeightMm:f})=>{const m=String(o||"").trim(),b=i!=="footer"?String(s||"").trim():"",y=[i==="footer"?String(s||"").trim():"",String(l||"").trim()].filter(Boolean).join(""),S=!!(u&&m),x=!!(h&&y),w=r.top+(S?Et(d)+Tt:0),v=r.bottom+(x?Et(c)+Tt:0),T=S?At({contentHtml:m,sectionPadding:a,position:"header",pageMargins:r}):"",E=x?At({contentHtml:y,sectionPadding:a,position:"footer",pageMargins:r}):"",A=String(p||"").trim().replace(/["'<>]/g,""),B=String(g||"").trim(),dt=f&&f>0?`height:${k(f)}mm;bottom:auto;`:"",j=k(t-r.left-r.right),be=Math.max(1,Math.floor((e-w-v)*te)-1),mt=i==="each-page"&&!!b,ye=mt?`<div class="invoice-custom-print-shell" style="width:${j}mm;">
        <section class="print-template-page" data-print-layout-mode="native-flow" style="width:${j}mm;height:${be}px;padding:${a};display:flex;flex-direction:column;box-sizing:border-box;">
          <div class="print-template-body" style="position:relative;min-height:0;">
            <div class="print-template-body-viewport" style="position:relative;overflow:hidden;">
              <div class="print-template-body-segment"><div class="print-template-body-inner">${String(n||"")}</div></div>
            </div>
          </div>
          <div class="print-template-footer" style="flex-shrink:0;margin-top:auto;">
            <div class="print-template-footer-stack"><div class="print-template-signatures" style="padding-top:8px;">${b}</div></div>
          </div>
        </section>
      </div>`:String(n||"");return`<div
  class="kalamapp-native-print-flow"
  data-kalamapp-native-print-flow="true"
  data-kalamapp-paper-width-mm="${k(t)}"
  data-kalamapp-paper-height-mm="${k(e)}"
  data-kalamapp-margin-top-mm="${k(w)}"
  data-kalamapp-margin-right-mm="${k(r.right)}"
  data-kalamapp-margin-bottom-mm="${k(v)}"
  data-kalamapp-margin-left-mm="${k(r.left)}"
  style="width:${j}mm;max-width:none;box-sizing:border-box;"
>
  ${T?`<template id="kalamapp-gotenberg-header">${T}</template>`:""}
  ${E?`<template id="kalamapp-gotenberg-footer">${E}</template>`:""}
  ${A?`<div class="kalamapp-native-print-flow-background" style="background-image:url('${A}');${dt}"></div>`:""}
  ${B?`<div class="kalamapp-native-print-flow-overlay" style="${dt}">${B}</div>`:""}
  <main class="kalamapp-native-print-flow-body" style="padding:${mt?"0":a}; box-sizing:border-box;">
    ${ye}
  </main>
</div>`},qr=t=>String(t||"").replace(/{{\s*system\.page_index\s*}}/g,'<span class="pageNumber"></span>').replace(/{{\s*system\.page_count\s*}}/g,'<span class="totalPages"></span>'),Ur=(t,e="")=>/class\s*=\s*["'][^"']*\bpageNumber\b/.test(`${e}${t}`)?t:`${t}<div class="print-template-page-counter" style="margin-top:4px;font-size:10px;color:#64748b;direction:rtl;text-align:left;">صفحه <span class="pageNumber"></span> از <span class="totalPages"></span></div>`,or="/assets/PeydaWeb-ExtraLight-MogXbige.woff2",ir="/assets/PeydaWeb-Regular-3vmtpM3F.woff2",lr="/assets/PeydaWeb-SemiBold-C8O9twWt.woff2",sr="/assets/PeydaWeb-Bold-tmeconga.woff2",cr="/assets/PeydaWeb-Black-DbRDY_oG.woff2",ne=[{weight:200,file:"PeydaWeb-ExtraLight.woff2",url:or},{weight:400,file:"PeydaWeb-Regular.woff2",url:ir},{weight:600,file:"PeydaWeb-SemiBold.woff2",url:lr},{weight:700,file:"PeydaWeb-Bold.woff2",url:sr},{weight:900,file:"PeydaWeb-Black.woff2",url:cr}],kt={"--brand-50-rgb":"239 246 255","--brand-100-rgb":"219 234 254","--brand-200-rgb":"191 219 254","--brand-500-rgb":"59 130 246","--brand-600-rgb":"37 99 235","--brand-800-rgb":"30 58 138"},Pt=["kalamapp-gotenberg-header","kalamapp-gotenberg-footer"],Mt=2*1024*1024,pr=4*1024*1024,dr=8e3;let tt=null;const I=t=>String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"),mr=()=>{if(typeof window>"u")return Object.entries(kt).map(([e,r])=>`${e}: ${r};`).join(`
`);const t=window.getComputedStyle(document.documentElement);return Object.entries(kt).map(([e,r])=>{const a=t.getPropertyValue(e).trim()||r;return`${e}: ${a};`}).join(`
`)},ae=t=>{let e="";const r=new Uint8Array(t),a=32768;for(let n=0;n<r.length;n+=a){const o=r.subarray(n,n+a);e+=String.fromCharCode(...o)}return btoa(e)},N=(t,e)=>{if(/^(?:data:|https?:|blob:)/i.test(t))return t;const r=typeof document<"u"&&document.baseURI?document.baseURI:e?`${e}/`:"/";return new URL(t,r).toString()},oe=(t,e)=>`
    @font-face {
      font-family: 'Peyda';
      src: url('${t}') format('woff2');
      font-weight: ${e};
      font-style: normal;
      font-display: swap;
    }
  `,ie=t=>ne.map(e=>oe(N(e.url,t),e.weight)).join(`
`),ur=async t=>{try{return(await Promise.all(ne.map(async r=>{const a=await fetch(N(r.url,t),{credentials:"same-origin"});if(!a.ok)throw new Error(`font fetch failed: ${a.status}`);const n=ae(await a.arrayBuffer());return oe(`data:font/woff2;base64,${n}`,r.weight)}))).join(`
`)}catch(e){return console.warn("Embedded print font fetch failed, falling back to URL font sources",e),ie(t)}},hr=async t=>t?(tt||(tt=ur(t).catch(e=>(console.error("Embedded print font preparation failed, using URL-based font CSS",e),ie(t)))),tt):"",gr=({sourceHtml:t,fontCss:e,baseHref:r})=>t.replaceAll(ee,e).replaceAll(re,I(r)),O=t=>/^(?:https?:|blob:)/i.test(t),Ct=t=>new RegExp(`(<template\\b[^>]*\\bid=["']${t}["'][^>]*>)([\\s\\S]*?)(<\\/template>)`,"gi"),le=/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,se=/<img\b[^>]*>/gi,ce=/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi,pe=/url\((['"]?)(.*?)\1\)/gi,X=t=>String(t||"").replaceAll("&amp;","&").replaceAll("&quot;",'"').replaceAll("&#39;","'"),de=t=>Array.from(t.matchAll(se)).map(e=>{const r=e[0].match(le);return X(String((r==null?void 0:r[1])||(r==null?void 0:r[2])||(r==null?void 0:r[3])||"")).trim()}).filter(O),fr=t=>/(?:logo|لوگو|brand)/i.test(String(t||"")),br=t=>Array.from(t.matchAll(ce)).flatMap(e=>Array.from(String(e[2]||"").matchAll(pe))).map(e=>X(String(e[2]||"")).trim()).filter(O),me=(t,e,r)=>t.replace(se,a=>a.replace(le,(n,o,l,s)=>{const i=X(String(o||l||s||"")).trim();if(!O(i))return n;const d=e.get(N(i,r));return d?`src="${I(d)}"`:n})),yr=(t,e,r)=>t.replace(ce,(a,n,o)=>{const l=String(o||"").replace(pe,(s,i,d)=>{const c=X(String(d||"")).trim();if(!O(c))return s;const u=e.get(N(c,r));return u?`url(${u})`:s});return`style=${n}${l}${n}`}),ct=t=>ve(t,"printHero")||t,ue=t=>/^blob:/i.test(String(t||"").trim()),he=async(t,e=Mt)=>{const r=new AbortController,a=window.setTimeout(()=>r.abort(),dr),n=ct(t);try{const o=await fetch(n,{credentials:"same-origin",signal:r.signal});if(!o.ok)return n;const l=String(o.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();if(!l.startsWith("image/"))return n;const s=await o.arrayBuffer();return s.byteLength===0||s.byteLength>Mt||s.byteLength>e?n:`data:${l};base64,${ae(s)}`}catch{return n}finally{window.clearTimeout(a)}},wr=async(t,e)=>{if(typeof window>"u"||!t)return t;const r=Array.from(new Set([...de(t),...br(t)].map(o=>N(o,e))));if(r.length===0)return t;let a=pr;const n=new Map;for(const o of r){const l=ue(o)||fr(o)?await he(o,a):ct(o);if(n.set(o,l),l.startsWith("data:")){const s=l.slice(l.indexOf(",")+1);a-=Math.floor(s.length*3/4)}}return yr(me(t,n,e),n,e)},vr=async(t,e)=>{if(typeof window>"u"||!t)return t;const r=Pt.flatMap(o=>Array.from(t.matchAll(Ct(o))).map(s=>String(s[2]||"")));if(r.length===0)return t;const a=Array.from(new Set(r.flatMap(de).filter(O).map(o=>N(o,e))));if(a.length===0)return t;const n=new Map(await Promise.all(a.map(async o=>[o,ue(o)?await he(o):ct(o)])));return Pt.reduce((o,l)=>o.replace(Ct(l),(s,i,d,c)=>`${i}${me(String(d||""),n,e)}${c}`),t)},Rt=async({pageSize:t,sourceHtml:e,title:r})=>{const a=I(r||"چاپ"),n=I(t||"A4 portrait"),o=/\bdata-kalamapp-native-print-flow="true"/i.test(e),l=typeof window<"u"?window.location.origin:"",s=l?`${l}/`:"/",i=await hr(l),d=mr(),c=o?await vr(gr({sourceHtml:e,fontCss:i,baseHref:s}),l):e,u=await wr(c,l);return`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base href="${I(s)}" />
    <title>${a}</title>
    <style>
      ${i}

      :root {
        ${d}
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #111827;
        font-family: 'Peyda', Tahoma, Arial, sans-serif;
        direction: rtl;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        overflow: visible;
      }

      #print-root {
        display: block !important;
        position: static !important;
        width: auto !important;
        height: auto !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        font-family: 'Peyda', Tahoma, Arial, sans-serif !important;
      }
      #print-root:has(.kalamapp-native-print-flow) {
        background: transparent !important;
      }

      #print-root,
      #print-root * {
        font-family: 'Peyda', Tahoma, Arial, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      ${xe}

      ${o?"":`@page {
        size: ${n};
        margin: 0;
      }`}
    </style>
  </head>
  <body class="print-mode">
    <div id="print-root">${u}</div>
    <script>
      window.__KALAMAPP_PRINT_READY = false;
      (function () {
        function waitForFonts() {
          return Promise.resolve(document.fonts && document.fonts.ready).catch(function () { return null; });
        }

        function waitForDomImage(img) {
          if (!img || !img.getAttribute || !img.getAttribute('src')) {
            return Promise.resolve();
          }
          if (img.complete) {
            return Promise.resolve();
          }
          return new Promise(function (resolve) {
            var done = function () { resolve(); };
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        }

        function extractInlineStyleUrls() {
          var styleElements = Array.prototype.slice.call(document.querySelectorAll('[style]'));
          var urls = [];
          styleElements.forEach(function (element) {
            var styleText = String(element.getAttribute('style') || '');
            if (styleText.indexOf('url(') === -1) {
              return;
            }
            styleText.replace(/url\\((['"]?)(.*?)\\1\\)/gi, function (_match, _quote, rawUrl) {
              var nextUrl = String(rawUrl || '').trim();
              if (nextUrl && !/^data:/i.test(nextUrl)) {
                urls.push(nextUrl);
              }
              return _match;
            });
          });
          return Array.from(new Set(urls));
        }

        function preloadImageUrl(url) {
          if (!url || /^data:/i.test(url)) {
            return Promise.resolve();
          }
          return new Promise(function (resolve) {
            var probe = new Image();
            probe.decoding = 'sync';
            probe.onload = function () { resolve(); };
            probe.onerror = function () { resolve(); };
            probe.src = url;
          });
        }

        function waitForAssets() {
          var templateImageAssets = [];
          var templateInlineAssets = [];
          Array.prototype.slice.call(document.querySelectorAll('template')).forEach(function (template) {
            var content = template && template.content;
            if (!content || !content.querySelectorAll) return;
            Array.prototype.slice.call(content.querySelectorAll('img')).forEach(function (image) {
              var source = String(image.getAttribute('src') || '').trim();
              if (source && !/^data:/i.test(source)) templateImageAssets.push(source);
            });
            Array.prototype.slice.call(content.querySelectorAll('[style]')).forEach(function (element) {
              var styleText = String(element.getAttribute('style') || '');
              styleText.replace(/url\\((['"]?)(.*?)\\1\\)/gi, function (_match, _quote, rawUrl) {
                var nextUrl = String(rawUrl || '').trim();
                if (nextUrl && !/^data:/i.test(nextUrl)) templateInlineAssets.push(nextUrl);
                return _match;
              });
            });
          });
          var domImages = Array.prototype.slice.call(document.images || []).map(waitForDomImage);
          var externalAssets = templateImageAssets.concat(extractInlineStyleUrls(), templateInlineAssets).map(preloadImageUrl);
          return Promise.all(domImages.concat(externalAssets));
        }

        function withTimeout(promise, timeoutMs) {
          return Promise.race([
            promise,
            new Promise(function (resolve) {
              window.setTimeout(resolve, timeoutMs);
            }),
          ]);
        }

        withTimeout(Promise.all([waitForFonts(), waitForAssets()]), 8000)
          .catch(function () { return null; })
          .then(function () {
            ${Se()}
            ${ar()}
            ${rr()}
            window.__KALAMAPP_PRINT_READY = true;
          });
      })();
    <\/script>
  </body>
</html>`},xr="/functions/v1/render-pdf",Sr="kalamapp-pdf-target",Tr=135e3,Er=15e3,Ar=10*1024*1024,kr=t=>new TextEncoder().encode(t).byteLength,F=t=>String(t||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"),ge=({sourceHtml:t,sourceNode:e})=>typeof t=="string"?t:(e==null?void 0:e.innerHTML)||"",Pr=()=>typeof window<"u",pt=t=>(t.name||(t.name=`${Sr}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`),t.name),Mr=()=>`${String(we||"").replace(/\/+$/,"")}${xr}`,fe=(t,e)=>{const r=String(t||e||"print.pdf").trim()||"print.pdf";return r.toLowerCase().endsWith(".pdf")?r:`${r}.pdf`},Cr=(t,e)=>{try{const r=F(e||"چاپ");t.document.open(),t.document.write(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${r}</title>
    <style>
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        background: #ffffff;
        color: #0f172a;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
        box-sizing: border-box;
        text-align: center;
      }
      .print-pdf-loading {
        display: grid;
        gap: 10px;
        width: min(100%, 440px);
        padding: 22px;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        box-sizing: border-box;
        box-shadow: 0 12px 32px rgba(15,23,42,.08);
      }
      .print-pdf-loading strong {
        font-size: clamp(17px, 5vw, 21px);
      }
      .print-pdf-loading span {
        color: #475569;
        font-size: clamp(13px, 3.8vw, 15px);
        line-height: 1.85;
      }
      .print-pdf-progress-track {
        width: 100%;
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        background: #e2e8f0;
      }
      .print-pdf-progress-value {
        width: 8%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #4f46e5, #0ea5e9);
        transition: width .35s ease;
      }
      @media (max-width: 480px) {
        .print-pdf-loading { padding: 20px 16px; border-radius: 16px; }
      }
    </style>
  </head>
  <body>
    <div class="print-pdf-loading">
      <strong>در حال آماده‌سازی فایل PDF</strong>
      <span id="print-pdf-progress-label">در حال آماده‌سازی قالب چاپ…</span>
      <div class="print-pdf-progress-track" aria-hidden="true"><div id="print-pdf-progress-value" class="print-pdf-progress-value"></div></div>
      <span>این صفحه را نبندید.</span>
    </div>
  </body>
</html>`),t.document.close()}catch(r){console.error("Unable to write prepared PDF window state",r)}},Rr=(t,e)=>{if(!(!t||t.closed))try{const r=t.document.getElementById("print-pdf-progress-label"),a=t.document.getElementById("print-pdf-progress-value");r&&(r.textContent=e.label),a&&(a.style.width=`${Math.max(0,Math.min(100,Math.round(e.percent)))}%`)}catch(r){console.error("Unable to update generated PDF progress",r)}},nt=(t,e,r)=>{if(!(!t||t.closed))try{const a=F(e||"چاپ"),n=String((r==null?void 0:r.message)||r||""),o=n==="pdf_generation_timeout"?"ساخت PDF بیش از زمان مجاز طول کشید. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.":n==="print_prerequisite_timeout"?"اطلاعات لازم برای چاپ به‌موقع دریافت نشد. لطفاً اتصال اینترنت را بررسی و دوباره تلاش کنید.":n==="print_document_too_large"?"حجم تصاویر یا محتوای این چاپ بیش از حد مجاز است. تعداد رکوردها را کمتر کنید یا تصاویر کوچک‌تر را انتخاب کنید.":"لطفاً دوباره تلاش کنید.";t.document.open(),t.document.write(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${a}</title>
    <style>
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        background: #ffffff;
        color: #991b1b;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
        box-sizing: border-box;
        text-align: center;
      }
      .print-pdf-error {
        display: grid;
        gap: 10px;
        width: min(100%, 440px);
        padding: 22px;
        border: 1px solid #fecaca;
        border-radius: 18px;
        box-sizing: border-box;
        line-height: 1.9;
      }
    </style>
  </head>
  <body>
    <div class="print-pdf-error">
      <strong>آماده‌سازی فایل PDF ناموفق بود.</strong>
      <span>${o}</span>
    </div>
  </body>
</html>`),t.document.close()}catch(a){console.error("Unable to write error state to prepared print window",a)}},Dr=(t,e,r)=>{nt(t,e,r)},Vr=async(t,e=Er)=>new Promise((r,a)=>{const n=globalThis.setTimeout(()=>a(new Error("print_prerequisite_timeout")),e);Promise.resolve(t).then(o=>{globalThis.clearTimeout(n),r(o)},o=>{globalThis.clearTimeout(n),a(o)})}),Wr=()=>new Promise(t=>{if(typeof window>"u"||typeof document>"u"){t();return}let e=!1;const r=()=>{e||(e=!0,window.clearTimeout(a),t())},a=window.setTimeout(r,320);document.visibilityState!=="hidden"&&window.requestAnimationFrame(()=>{window.requestAnimationFrame(r)})}),_r=({targetWindow:t,title:e,filename:r,pdfUrl:a,showPdfPreview:n=!1})=>{if(!(!t||t.closed))try{const o=F(e||"چاپ"),l=F(r),s=F(a);t.document.open(),t.document.write(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${o}</title>
    <style>
      body {
        margin: 0;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        background: #ffffff;
        color: #0f172a;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: ${n?"0":"max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))"};
        box-sizing: border-box;
        text-align: center;
      }
      .print-pdf-success {
        display: grid;
        gap: 12px;
        width: min(100%, 440px);
        padding: 22px;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        box-sizing: border-box;
      }
      .print-pdf-success strong {
        font-size: 16px;
      }
      .print-pdf-success span {
        color: #475569;
        font-size: 13px;
        line-height: 1.9;
      }
      .print-pdf-success a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: #312e81;
        color: #ffffff;
        font-size: 14px;
        font-weight: 700;
        padding: 10px 16px;
        text-decoration: none;
      }
      .print-pdf-preview-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid #e2e8f0;
        text-align: right;
      }
      .print-pdf-preview-toolbar strong { font-size: 14px; }
      .print-pdf-preview-toolbar a { white-space: nowrap; }
      .print-pdf-preview-frame { width: 100%; flex: 1 1 auto; min-height: calc(100vh - 58px); border: 0; }
      @media (max-width: 480px) {
        .print-pdf-preview-toolbar { align-items: stretch; flex-direction: column; padding: 12px 16px; }
        .print-pdf-preview-toolbar a { width: 100%; box-sizing: border-box; }
        .print-pdf-preview-frame { min-height: calc(100dvh - 114px); }
        .print-pdf-success { padding: 20px 16px; }
      }
    </style>
  </head>
  <body>
    ${n?`
      <div class="print-pdf-preview-toolbar">
        <strong>پیش‌نمایش نهایی PDF</strong>
        <a id="pdf-download-link" href="${s}" download="${l}" rel="noopener">دانلود با نام «${l}»</a>
      </div>
      <iframe class="print-pdf-preview-frame" src="${s}" title="پیش‌نمایش نهایی PDF"></iframe>
    `:`
      <div class="print-pdf-success">
        <strong>فایل PDF آماده شد.</strong>
        <span>اگر دانلود یا باز شدن فایل به صورت خودکار شروع نشد، از دکمه زیر استفاده کنید.</span>
        <a id="pdf-download-link" href="${s}" download="${l}" target="_self" rel="noopener">باز کردن / دانلود PDF</a>
      </div>
      <script>
        window.setTimeout(function () {
          var link = document.getElementById('pdf-download-link');
          if (link) link.click();
        }, 250);
      <\/script>
    `}
  </body>
</html>`),t.document.close()}catch(o){console.error("Unable to write success state to prepared print window",o)}},_t=async({documentHtml:t,filename:e,pageSize:r,title:a,onProgress:n})=>{const o=new FormData;o.append("documentHtml",t),o.append("title",a||"چاپ"),o.append("filename",fe(e,a)),o.append("pageSize",r||"A4 portrait");const l=new AbortController;let s=45;const i=globalThis.setInterval(()=>{s=Math.min(90,s+3),n==null||n({percent:s,label:"در حال ساخت PDF روی سرور…"})},1500),d=globalThis.setTimeout(()=>l.abort(),Tr);try{n==null||n({percent:s,label:"در حال ارسال فایل برای ساخت PDF…"});const c=await fetch(Mr(),{method:"POST",body:o,signal:l.signal}),u=c.headers.get("content-type")||"";if(!c.ok||!u.includes("application/pdf"))throw new Error(`PDF request failed: ${c.status}`);return await c.blob()}catch(c){throw l.signal.aborted?new Error("pdf_generation_timeout"):c}finally{globalThis.clearInterval(i),globalThis.clearTimeout(d)}},Hr=async t=>{var o,l,s,i,d,c;const e=ge(t).trim();if(!e)throw new Error("print_source_missing");(o=t.tracker)==null||o.addMetadata({pageSize:t.pageSize||"A4 portrait",sourceHtmlLength:e.length}),(l=t.onProgress)==null||l.call(t,{percent:15,label:"در حال آماده‌سازی قالب PDF…"});const r=t.tracker?await t.tracker.step("build_print_document_html",()=>Rt({pageSize:t.pageSize,sourceHtml:e,title:t.title}),u=>({documentHtmlLength:String(u||"").length})):await Rt({pageSize:t.pageSize,sourceHtml:e,title:t.title}),a=kr(r);if((s=t.tracker)==null||s.addMetadata({documentHtmlBytes:a}),a>Ar)throw new Error("print_document_too_large");(i=t.onProgress)==null||i.call(t,{percent:40,label:"قالب آماده شد؛ در حال ساخت PDF…"});const n=t.tracker?await t.tracker.step("request_render_pdf",()=>_t({documentHtml:r,filename:t.filename,pageSize:t.pageSize,title:t.title,onProgress:t.onProgress}),u=>({blobSize:u.size})):await _t({documentHtml:r,filename:t.filename,pageSize:t.pageSize,title:t.title,onProgress:t.onProgress});return(d=t.tracker)==null||d.addMetadata({blobSize:n.size}),(c=t.onProgress)==null||c.call(t,{percent:100,label:"فایل PDF آماده شد."}),n},Gr=(t,e)=>{if(!(e!=null&&e.force)&&!Pr())return null;const r=window.open("","_blank");return r?(pt(r),Cr(r,t),r):null},Nr=({pdf:t,targetWindow:e,openInPdfViewer:r=!0})=>{const a=t.title||"چاپ",n=fe(t.filename,a),o=e&&!e.closed?e:null;if(o){pt(o);const i=URL.createObjectURL(t.blob);_r({targetWindow:o,title:a,filename:n,pdfUrl:i,showPdfPreview:r}),o.focus();return}const l=URL.createObjectURL(t.blob),s=document.createElement("a");s.href=l,s.download=n,s.target="_blank",document.body.appendChild(s),s.click(),s.remove(),window.setTimeout(()=>URL.revokeObjectURL(l),6e4)},Xr=async t=>{const e=ge(t).trim();if(!e){nt(t.targetWindow,t.title);return}try{const r=t.targetWindow&&!t.targetWindow.closed?t.targetWindow:null;r&&pt(r);const a=o=>{var l;Rr(r,o),(l=t.onProgress)==null||l.call(t,o)};a({percent:12,label:"در حال آماده‌سازی قالب PDF…"});const n=await Hr({filename:t.filename,pageSize:t.pageSize,sourceHtml:e,title:t.title,onProgress:a});Nr({pdf:{blob:n,filename:t.filename,title:t.title},targetWindow:r,openInPdfViewer:!!t.openInPdfViewer})}catch(r){throw nt(t.targetWindow,t.title,r),r}};export{Gr as a,Ue as b,Oe as c,Nr as d,Dr as e,Wr as f,Hr as g,$r as h,Or as i,De as j,We as k,Lr as l,Le as m,Ve as n,xe as o,Xr as p,Fr as q,zr as r,Pr as s,qr as t,Ur as u,Vr as w};
