import{q as f,r as y,o as g}from"./printAsPdf-4vEDQFze.js";const s="print-root",u="kalamapp-print-session-style",o="data-kalamapp-print-session",b=180,l=e=>new Promise(t=>window.setTimeout(t,e)),h=({sourceHtml:e,sourceNode:t})=>typeof e=="string"?e:(t==null?void 0:t.innerHTML)||"",E=async(e=1800)=>{const t=document.fonts;t!=null&&t.ready&&await Promise.race([t.ready,l(e)])},S=e=>Array.from(String(e||"").matchAll(/url\((['"]?)(.*?)\1\)/gi)).map(t=>String(t[2]||"").trim()).filter(Boolean),T=e=>new Promise(t=>{const n=new Image;n.onload=()=>t(),n.onerror=()=>t(),n.src=e}),P=async(e,t=2200)=>{const n=Array.from(e.querySelectorAll("img")).filter(r=>!r.complete),i=Array.from(e.querySelectorAll("*")).flatMap(r=>S(r.style.backgroundImage)),a=Array.from(new Set(i));!n.length&&!a.length||await Promise.race([Promise.allSettled([...n.map(r=>new Promise(d=>{const c=()=>d();r.addEventListener("load",c,{once:!0}),r.addEventListener("error",c,{once:!0})})),...a.map(T)]),l(t)])},p=async()=>{await new Promise(e=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>e())})})},v=e=>{let t=document.getElementById(u);t||(t=document.createElement("style"),t.id=u,document.head.appendChild(t)),t.textContent=`
    ${g}
    @page {
      size: ${e||"A4 portrait"};
      margin: 0;
    }
    html,
    body[${o}="true"] {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      overflow: visible !important;
    }
    body[${o}="true"] > *:not(#${s}) {
      display: none !important;
    }
    body[${o}="true"] #${s} {
      display: block !important;
      position: static !important;
      width: max-content !important;
      max-width: none !important;
      min-height: 100vh !important;
      margin: 0 auto !important;
      padding: 0 !important;
      overflow: visible !important;
      background: #fff !important;
      font-family: 'Peyda', Tahoma, Arial, sans-serif !important;
    }
    body[${o}="true"] #${s} * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @media screen {
      body[${o}="true"] #${s} {
        visibility: visible !important;
      }
      body[${o}="true"] #${s} .print-card,
      body[${o}="true"] #${s} .print-template-page,
      body[${o}="true"] #${s} .list-print-page {
        box-shadow: none !important;
      }
    }
  `},$=e=>{const t=document.createElement("div");return t.id=s,t.innerHTML=e,t},A=(e,t)=>{v(t);const n=Array.from(document.body.childNodes),i=$(e);return document.body.setAttribute(o,"true"),document.body.replaceChildren(i),{originalNodes:n,root:i}},I=(e,t,n)=>{let i=!1,a=!1,r=!1;n&&(document.title=n);const d=()=>m(),c=()=>{r=!0},m=()=>{i||(i=!0,window.clearTimeout(w),a&&window.removeEventListener("focus",d,!0),window.removeEventListener("beforeprint",c),window.removeEventListener("afterprint",m),document.body.removeAttribute(o),document.body.replaceChildren(...e),document.title=t)};window.addEventListener("beforeprint",c,{once:!0}),window.addEventListener("afterprint",m,{once:!0}),window.setTimeout(()=>{a=!0,window.addEventListener("focus",d,{once:!0,capture:!0})},400);const w=window.setTimeout(m,6e4);return{cleanup:m,didEnterPrint:()=>r}},k=async e=>{const t=h(e).trim();if(!t)return;const n=document.title,{originalNodes:i,root:a}=A(t,e.pageSize),{cleanup:r,didEnterPrint:d}=I(i,n,e.title);try{await E(),await P(a),await p(),f(a),y(a),await l(b),await p(),window.scrollTo(0,0),document.documentElement.scrollTop=0,document.body.scrollTop=0,window.focus(),window.print(),window.setTimeout(()=>{d()||r()},1200)}catch(c){throw r(),c}};export{k as p};
