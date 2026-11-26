import{j as l}from"./brand-loading-DylTKg69.js";import{a as C,cY as gt,cW as oe,c0 as Tt,c1 as bt,cX as At,bJ as zt,aE as xt,aP as jt,aQ as ie,dn as Ht,cu as le,cr as ae}from"./ant-icons-vendor-Uj5X7Obb.js";import{c as se,i as ce,h as de,j as ue,d as pe,T as he,k as Et,e as fe,l as me,m as ge,f as be,g as xe,n as ye,o as we,q as Se,t as Me,v as Ce,w as st,x as Nt,C as ct,N as ut,B as Lt,E as ke,y as ve,z as $e}from"./editor-vendor-B8AwQmYb.js";import{a as Dt}from"./index-C5-r2qPC.js";import{I as It}from"./index-B6NI-hO5.js";import{D as dt}from"./index-BXZpe1co.js";import"./colors-BfO6A7M_.js";import"./TextArea-B2hzuXo9.js";import"./index-DsrJeAd4.js";import"./module-registry-BuqlWO-Q.js";import"./supabase-vendor-DND0E3BL.js";import"./fa-CbQAMVtZ.js";const rt=(...o)=>o.map(e=>String(e||"").trim()).filter(Boolean).join(" "),Z=(o,e)=>{const a=String(o||"").trim();if(!a)return"";for(const d of e){const u=a.match(new RegExp(`(?:^|;)\\s*${d}\\s*:\\s*([^;]+)`,"i"));if(u!=null&&u[1])return String(u[1]).trim()}return""},K=(o,e,a)=>{const d=String(e||"").trim().toLowerCase(),u=String(o||"").split(";").map(h=>h.trim()).filter(Boolean).filter(h=>!h.toLowerCase().startsWith(`${d}:`));return a&&String(a).trim()&&u.push(`${e}: ${String(a).trim()}`),u.join("; ")},Te=o=>{if(!o)return"";const e=Z(o.getAttribute("style")||"",["width"]),a=String(o.getAttribute("width")||"").trim();return e||a},Ae=o=>{if(typeof window>"u"||typeof window.DOMParser>"u"||!o||!/<table/i.test(o))return o;try{const e=h=>{if(!h)return!1;const x=String(h.tagName||"").toLowerCase();if(x!=="p"&&x!=="div")return!1;const g=String(h.textContent||"").replace(/[\u200c\u200d\u200e\u200f\u00a0\s]+/g,"").trim(),S=Array.from(h.childNodes).every(j=>j.nodeType===Node.TEXT_NODE?!String(j.textContent||"").replace(/[\u200c\u200d\u200e\u200f\u00a0\s]+/g,""):j.nodeType!==Node.ELEMENT_NODE?!1:String(j.tagName||"").toLowerCase()==="br");return!g&&S},d=new window.DOMParser().parseFromString(`<div id="print-editor-root">${o}</div>`,"text/html"),u=d.getElementById("print-editor-root");return u?(u.querySelectorAll("table").forEach(h=>{const x=String(h.getAttribute("style")||""),g=Z(x,["width"]),S=String(h.getAttribute("width")||"").trim();if((!g||/^auto$/i.test(g))&&!S){let m=K(x,"width","100%");m=K(m,"max-width","100%"),m=K(m,"table-layout","fixed"),h.setAttribute("style",m)}const j=h.querySelector("tr"),E=Array.from((j==null?void 0:j.children)||[]).filter(m=>{const H=String((m==null?void 0:m.tagName)||"").toLowerCase();return H==="td"||H==="th"});if(!E.length)return;const J=E.map(m=>Te(m)),_=J.some(Boolean),U=Array.from(h.children).find(m=>String(m.tagName||"").toLowerCase()==="colgroup");if(!_&&!U)return;const b=U||d.createElement("colgroup");for(U||h.insertBefore(b,h.firstChild);b.children.length<E.length;)b.appendChild(d.createElement("col"));for(;b.children.length>E.length;)b.removeChild(b.lastElementChild);J.forEach((m,H)=>{const I=b.children[H],D=E[H];if(!I||!D||!m)return;I.setAttribute("style",K(I.getAttribute("style")||"","width",m)),D.setAttribute("style",K(D.getAttribute("style")||"","width",m));const N=m.match(/^(\d+(?:\.\d+)?)px$/i);if(N!=null&&N[1]){const M=`${Math.max(1,Math.round(Number(N[1])))}`;I.setAttribute("width",M),D.setAttribute("data-colwidth",M)}})}),u.querySelectorAll("table").forEach(h=>{let x=h.previousElementSibling;for(;e(x);){const S=x;x=(x==null?void 0:x.previousElementSibling)||null,S==null||S.remove()}let g=h.nextElementSibling;for(;e(g);){const S=g;g=(g==null?void 0:g.nextElementSibling)||null,S==null||S.remove()}}),u.innerHTML):o}catch{return o}},Rt=(o,e)=>{const a=String(o||"").trim().toLowerCase();if(!a||a.endsWith("%"))return e;const d=Number.parseFloat(a.replace("px","").trim());return Number.isFinite(d)?d:e},Pt=(o,e)=>{const a=String(o.width||"").trim(),d=Z(o.inlineStyle,["width","max-width"]);return Rt(a||d,e)},ze=(o,e)=>{const a=String(o.height||"").trim(),d=Z(o.inlineStyle,["height","max-height"]),u=(a||d||"").trim();return!u||u==="auto"?null:Rt(u,Math.round(e*.6))},je=o=>{const a=String(o||"").trim().match(/^{{\s*([^}]+)\s*}}$/);return a?String(a[1]||"").trim():""},Wt=(o,e)=>{const a=Math.max(32,Math.round(o)),d=e&&e>0?Math.round(e):null;return["display:block",`width:${a}px`,`max-width:${a}px`,d?`height:${d}px`:"height:auto",d?`max-height:${d}px`:"","object-fit:contain","border-radius:10px"].filter(Boolean).join(";")},He=({node:o,selected:e,updateAttributes:a,editor:d,getPos:u})=>{const h=(o==null?void 0:o.attrs)||{},x=je(h.src),g=Pt(h,180),S=ze(h,g),j=!!x,E=C.useRef(null),J=(b,m)=>{const H={...h,width:`${Math.max(32,Math.round(b))}px`,height:m&&m>0?`${Math.max(32,Math.round(m))}px`:"auto",inlineStyle:Wt(b,m)};if(d&&typeof u=="function"){const I=u();if(typeof I=="number"){const D=d.state.tr.setNodeMarkup(I,void 0,H);d.view.dispatch(D);return}}a(H)},_=(b,m,H)=>{if(b.preventDefault(),b.stopPropagation(),!d)return;E.current={startX:b.clientX,startY:b.clientY,startWidth:g,startHeight:S,horizontal:m,vertical:H};const I=N=>{const M=E.current;if(!M)return;const q=(N.clientX-M.startX)*M.horizontal,lt=(N.clientY-M.startY)*M.vertical,A=Math.max(32,M.startWidth+q),Y=M.startHeight===null?null:Math.max(32,M.startHeight+lt);J(A,Y)},D=()=>{E.current=null,window.removeEventListener("mousemove",I),window.removeEventListener("mouseup",D)};window.addEventListener("mousemove",I),window.addEventListener("mouseup",D,{once:!0})},U=b=>{if(b.preventDefault(),b.stopPropagation(),!d||typeof u!="function")return;const m=u();if(typeof m!="number")return;const H=ut.create(d.state.doc,m);d.view.dispatch(d.state.tr.setSelection(H)),d.view.focus()};return l.jsxs($e,{as:"div",className:`print-editor-image-node ${e?"selected":""} ${j?"variable-image":""}`,style:{width:`${g}px`,height:S?`${S}px`:"auto"},"data-variable-token":x||void 0,onMouseDown:U,contentEditable:!1,children:[j?l.jsxs("div",{className:"print-editor-image-placeholder",children:[l.jsx("div",{className:"print-editor-image-placeholder-icon",children:l.jsx(ae,{})}),l.jsx("div",{className:"print-editor-image-placeholder-label",children:x})]}):l.jsx("img",{src:String(h.src||""),alt:String(h.alt||"image"),title:String(h.title||""),draggable:!1,style:{width:`${g}px`,height:S?`${S}px`:"auto",maxWidth:"100%",display:"block",objectFit:"contain",borderRadius:10}}),e?l.jsxs(l.Fragment,{children:[l.jsx("button",{type:"button",className:"print-editor-image-handle handle-nw",onMouseDown:b=>_(b,-1,-1)}),l.jsx("button",{type:"button",className:"print-editor-image-handle handle-ne",onMouseDown:b=>_(b,1,-1)}),l.jsx("button",{type:"button",className:"print-editor-image-handle handle-sw",onMouseDown:b=>_(b,-1,1)}),l.jsx("button",{type:"button",className:"print-editor-image-handle handle-se",onMouseDown:b=>_(b,1,1)})]}):null]})},Ne=we.extend({addAttributes(){var o;return{...(o=this.parent)==null?void 0:o.call(this),inlineStyle:{default:null,parseHTML:e=>e.getAttribute("style")||null,renderHTML:()=>({})},printBlock:{default:null,parseHTML:e=>e.getAttribute("data-print-block")||null,renderHTML:e=>e.printBlock?{"data-print-block":e.printBlock}:{}},borderColor:{default:"#d1d5db",parseHTML:e=>e.getAttribute("data-border-color")||e.style.getPropertyValue("--table-border-color")||e.style.borderColor||"#d1d5db",renderHTML:e=>{const a=e.borderColor||"#d1d5db",d=rt(e.inlineStyle);return{"data-border-color":a,style:rt(d,`--table-border-color: ${a}; border-color: ${a};`)}}}}}}),Le=Se.extend({addAttributes(){var o;return{...(o=this.parent)==null?void 0:o.call(this),printOptionalField:{default:null,parseHTML:e=>e.getAttribute("data-print-optional-field")||null,renderHTML:e=>e.printOptionalField?{"data-print-optional-field":e.printOptionalField}:{}}}}}),Ee=Ce.extend({addAttributes(){var o;return{...(o=this.parent)==null?void 0:o.call(this),inlineStyle:{default:null,parseHTML:e=>e.getAttribute("style")||null,renderHTML:()=>({})},backgroundColor:{default:null,parseHTML:e=>e.getAttribute("data-background-color")||e.style.backgroundColor||null,renderHTML:e=>{const a=rt(e.inlineStyle);return e.backgroundColor?{"data-background-color":e.backgroundColor,style:rt(a,`background-color: ${e.backgroundColor};`)}:a?{style:a}:{}}},printOptionalField:{default:null,parseHTML:e=>e.getAttribute("data-print-optional-field")||null,renderHTML:e=>e.printOptionalField?{"data-print-optional-field":e.printOptionalField}:{}}}}}),De=Me.extend({addAttributes(){var o;return{...(o=this.parent)==null?void 0:o.call(this),inlineStyle:{default:null,parseHTML:e=>e.getAttribute("style")||null,renderHTML:()=>({})},backgroundColor:{default:null,parseHTML:e=>e.getAttribute("data-background-color")||e.style.backgroundColor||null,renderHTML:e=>{const a=rt(e.inlineStyle);return e.backgroundColor?{"data-background-color":e.backgroundColor,style:rt(a,`background-color: ${e.backgroundColor};`)}:a?{style:a}:{}}},printOptionalField:{default:null,parseHTML:e=>e.getAttribute("data-print-optional-field")||null,renderHTML:e=>e.printOptionalField?{"data-print-optional-field":e.printOptionalField}:{}}}}}),Ie=Et.create({name:"fontSize",addGlobalAttributes(){return[{types:["textStyle"],attributes:{fontSize:{default:null,parseHTML:o=>o.style.fontSize||null,renderHTML:o=>o.fontSize?{style:`font-size: ${o.fontSize}`}:{}}}}]},addCommands(){return{setFontSize:o=>({chain:e})=>e().setMark("textStyle",{fontSize:o}).run(),unsetFontSize:()=>({chain:o})=>o().setMark("textStyle",{fontSize:null}).removeEmptyTextStyle().run()}}}),Re=Et.create({name:"lineHeight",addGlobalAttributes(){return[{types:["paragraph","heading"],attributes:{lineHeight:{default:null,parseHTML:o=>o.style.lineHeight||null,renderHTML:o=>o.lineHeight?{style:`line-height: ${o.lineHeight}`}:{}}}}]},addCommands(){return{setLineHeight:o=>({chain:e})=>e().updateAttributes("paragraph",{lineHeight:o}).updateAttributes("heading",{lineHeight:o}).run(),unsetLineHeight:()=>({chain:o})=>o().updateAttributes("paragraph",{lineHeight:null}).updateAttributes("heading",{lineHeight:null}).run()}}}),Pe=ge.extend({addAttributes(){var o;return{...(o=this.parent)==null?void 0:o.call(this),width:{default:null,parseHTML:e=>e.getAttribute("data-width")||e.getAttribute("width")||e.style.width||e.style.maxWidth||Z(e.getAttribute("style")||"",["width","max-width"])||null,renderHTML:()=>({})},height:{default:null,parseHTML:e=>e.getAttribute("data-height")||e.getAttribute("height")||e.style.height||e.style.maxHeight||Z(e.getAttribute("style")||"",["height","max-height"])||null,renderHTML:()=>({})},inlineStyle:{default:null,parseHTML:e=>e.getAttribute("style")||null,renderHTML:()=>({})}}},renderHTML({HTMLAttributes:o}){const e=String(o.width||"").trim(),a=String(o.height||"").trim(),d=String(o.inlineStyle||"").trim(),u=[e?`width:${e}`:"",a?`height:${a}`:""].filter(Boolean).join(";"),h=[d,u].filter(Boolean).join(";"),x={src:o.src,alt:o.alt,title:o.title};if(e&&/px$/i.test(e)){const g=e.replace(/px$/i,"").trim();x.width=g,x["data-width"]=g}if(a&&/px$/i.test(a)){const g=a.replace(/px$/i,"").trim();x.height=g,x["data-height"]=g}return h&&(x.style=h),["img",x]},addNodeView(){return ve(He)}}),We=de.extend({parseHTML(){return[{tag:"p"},{tag:"div"}]},addAttributes(){var o;return{...(o=this.parent)==null?void 0:o.call(this),inlineStyle:{default:null,parseHTML:e=>e.getAttribute("style")||null,renderHTML:e=>e.inlineStyle?{style:e.inlineStyle}:{}}}}}),Be=ue.extend({addAttributes(){var o;return{...(o=this.parent)==null?void 0:o.call(this),inlineStyle:{default:null,parseHTML:e=>e.getAttribute("style")||null,renderHTML:e=>e.inlineStyle?{style:e.inlineStyle}:{}}}}}),$=(o,e,a,d)=>l.jsx(Dt,{title:o,children:l.jsx(It,{size:"small",icon:e,onMouseDown:u=>u.preventDefault(),onClick:a,disabled:d})}),Oe=()=>{const o=["#f8fafc","#e2e8f0","#cbd5e1","#94a3b8","#64748b","#334155"];if(typeof window>"u")return o;const e=window.getComputedStyle(document.documentElement),d=["50","100","200","300","400","500","600","700","800","900"].map(u=>e.getPropertyValue(`--brand-${u}-rgb`).trim()).filter(Boolean).map(u=>`rgb(${u.replace(/\s+/g," ").trim()})`);return Array.from(new Set(d.length?d:o))},pt=(o,e="#d1d5db")=>{const a=String(o||"").trim();if(!a)return e;if(/^#[0-9a-f]{6}$/i.test(a))return a;if(/^#[0-9a-f]{3}$/i.test(a)){const[u,h,x]=a.slice(1).split("");return`#${u}${u}${h}${h}${x}${x}`.toLowerCase()}const d=a.match(/^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/i);if(d){const u=h=>Math.max(0,Math.min(255,Number(h))).toString(16).padStart(2,"0");return`#${u(d[1])}${u(d[2])}${u(d[3])}`}if(typeof window<"u"){const u=document.createElement("div");u.style.color=a,document.body.appendChild(u);const h=window.getComputedStyle(u).color;if(document.body.removeChild(u),h&&h!==a)return pt(h,e)}return e},tr=({value:o,onChange:e,placeholder:a="قالب چاپ را اینجا طراحی کنید...",minHeight:d=240,fixedHeight:u,fillHeight:h=!1,contentPadding:x="14px 16px",onEditorReady:g,onFocusSection:S})=>{const[j,E]=C.useState("#fef3c7"),[J,_]=C.useState("#d1d5db"),[U,b]=C.useState(!1),m=C.useMemo(()=>Oe(),[]),H=C.useMemo(()=>pt(j,"#fef3c7"),[j]),I=C.useMemo(()=>pt(J,"#d1d5db"),[J]),D=C.useRef(o||""),N=C.useRef(null),M=C.useMemo(()=>{const t=o||"";return t===D.current?t:Ae(t)},[o]),q=u?Math.max(36,Math.round(u)):null,lt=C.useRef(null),A=C.useRef(null),Y=C.useRef(null),nt=C.useRef(null),ot=(t,n)=>{var k,L,v,z,X,W;const i=Math.max(0,t.state.doc.content.size),s=n.getBoundingClientRect(),p=[(k=t.posAtCoords({left:s.left+Math.max(2,s.width/2),top:s.top+Math.max(2,s.height/2)}))==null?void 0:k.pos,t.posAtDOM(n,0),Math.max(0,t.posAtDOM(n,0)-1),Math.max(0,t.posAtDOM(n,0)+1)],f=B=>B==="tableCell"||B==="tableHeader";let y=null;for(const B of p.filter(O=>Number.isFinite(O))){const O=Math.max(0,Math.min(B,i)),V=t.state.doc.resolve(O);for(let G=V.depth;G>0;G-=1){const w=V.node(G);if(f(String(((L=w==null?void 0:w.type)==null?void 0:L.name)||""))){const T=V.before(G),Q=(v=t.nodeDOM)==null?void 0:v.call(t,T);if(Q===n)return T;!Q&&y===null&&(y=T)}}const F=String(((X=(z=V.nodeAfter)==null?void 0:z.type)==null?void 0:X.name)||"");if(f(F)&&((W=t.nodeDOM)==null?void 0:W.call(t,O))===n)return O}return y},yt=(t,n,i)=>{try{const s=ot(t,n),c=ot(t,i||n);return s===null||c===null?null:ct.create(t.state.doc,s,c)}catch{return null}},Bt=()=>{var n;if(!r)return null;const t=r.state.selection.$from;for(let i=t.depth;i>0;i-=1){const s=t.node(i),c=String(((n=s==null?void 0:s.type)==null?void 0:n.name)||"");if(c==="tableCell"||c==="tableHeader")return t.before(i)}return null},R=(t,n)=>{if(lt.current===n)return;lt.current=n;const i=t==null?void 0:t.dom;i&&(i.classList.toggle("row-resize-cursor",n==="row"),i.classList.toggle("column-resize-cursor",n==="column"))},wt=(t,n)=>{if(!t)return null;const i=t.getBoundingClientRect(),s=8,c=Math.abs(n.clientX-i.left),p=Math.abs(n.clientX-i.right),f=Math.abs(n.clientY-i.top),y=Math.abs(n.clientY-i.bottom),k=Math.min(c,p),L=Math.min(f,y);return k<=s&&k<=L?c<=p?"column-left":"column-right":L<=s?"row":null},Ot=(t,n)=>{const i=t.getBoundingClientRect(),c=window.getComputedStyle(t).direction==="rtl"?i.right:i.left;return Math.abs(n.clientX-c)<=26&&n.clientY>=i.top+4&&n.clientY<=i.bottom-4},Ft=(t,n)=>{if(!t||t===n||t.closest("button,input,textarea,select,img,.print-editor-image-node,.column-resize-handle"))return!1;const i=t.closest("p,h1,h2,h3,h4,h5,h6,li,span,strong,em,a,code");return!i||!n.contains(i)?!1:String(i.textContent||"").trim().length>0},Yt=(t,n,i)=>i.shiftKey||t===n||Ot(n,i)?!0:!Ft(t,n),Xt=(t,n,i,s,c)=>{var f;const p=Math.max(25,Math.round(s));try{const y=t.state.doc.resolve(n),k=y.node(-1),L=y.start(-1),v=Nt.get(k);if(i<0||i>=v.width)return;let z=t.state.tr,X=!1;for(let B=0;B<v.height;B+=1){const O=B*v.width+i;if(B>0&&v.map[O]===v.map[O-v.width])continue;const V=v.map[O],F=k.nodeAt(V);if(!F)continue;const G=v.colCount(V),w=F.attrs.colspan===1?0:i-G,T=Array.isArray(F.attrs.colwidth)?[...F.attrs.colwidth]:Array.from({length:F.attrs.colspan||1},()=>0);T[w]!==p&&(T[w]=p,z=z.setNodeMarkup(L+V,F.type,{...F.attrs,colwidth:T}),X=!0)}X&&t.dispatch(z);const W=(f=c==null?void 0:c.querySelectorAll("colgroup > col"))==null?void 0:f[i];W&&(W.style.width=`${p}px`,W.style.minWidth=`${p}px`)}catch{}},Vt=(t,n,i)=>{const s=Math.max(24,Math.round(i));let c=t.state.tr,p=!1;Array.from(n.cells||[]).forEach(f=>{var z;const y=ot(t,f);if(y===null)return;const k=c.doc.nodeAt(y);if(!k)return;const L=K((z=k.attrs)==null?void 0:z.inlineStyle,"height",`${s}px`),v={...k.attrs,inlineStyle:L};c=c.setNodeMarkup(y,k.type,v),p=!0}),p&&(t.dispatch(c),t.focus())},_t=()=>{if(!r)return;const t=r.state.selection,n=t==null?void 0:t.$anchorCell;if(!n)return;const i=r.state.tr.setSelection(ct.rowSelection(n));r.view.dispatch(i),r.view.focus()},Ut=()=>{if(!r)return;const t=r.state.selection,n=t==null?void 0:t.$anchorCell;if(!n)return;const i=r.state.tr.setSelection(ct.colSelection(n));r.view.dispatch(i),r.view.focus()},qt=()=>{if(!r)return;const t=it();if(!t)return;const n=r.state.tr.setSelection(ut.create(r.state.doc,t.pos));r.view.dispatch(n),r.view.focus()},it=()=>{var i,s,c;if(!r)return null;const t=r.state.selection;if(t instanceof ut&&((s=(i=t.node)==null?void 0:i.type)==null?void 0:s.name)==="table")return{pos:t.from,node:t.node};const n=t.$from;for(let p=n.depth;p>0;p-=1){const f=n.node(p);if(String(((c=f==null?void 0:f.type)==null?void 0:c.name)||"")==="table")return{pos:n.before(p),node:f}}return null},Gt=()=>{const t=it();if(!t)return null;let n=null;return t.node.descendants((i,s)=>{var p;if(n!==null)return!1;const c=String(((p=i==null?void 0:i.type)==null?void 0:p.name)||"");return c==="tableCell"||c==="tableHeader"?(n=t.pos+1+s,!1):!0}),n},Kt=()=>{if(!r)return!1;const t=Bt(),n=t??Gt();if(n===null)return!1;if(t!==null)return!0;const i=st.near(r.state.doc.resolve(Math.min(r.state.doc.content.size,n+1)),1);return r.view.dispatch(r.state.tr.setSelection(i)),r.view.focus(),!0},P=t=>{!r||!Kt()||(t(),r.view.focus())},St=()=>{if(!r||r.chain().focus().deleteTable().run())return;const t=it();if(!t)return;const n=r.state.tr.delete(t.pos,t.pos+t.node.nodeSize);r.view.dispatch(n.scrollIntoView()),r.view.focus()},ht=t=>{var f;if(!r)return;const n=it(),i=(f=r.schema.nodes.paragraph)==null?void 0:f.create();if(!n||!i)return;const s=t==="before"?n.pos:n.pos+n.node.nodeSize;let c=r.state.tr.insert(s,i);const p=Math.min(c.doc.content.size,s+1);c=c.setSelection(st.create(c.doc,p)).scrollIntoView(),r.view.dispatch(c),r.view.focus(),b(!1)},Mt=t=>{if(!r)return;const n=it();if(!n)return;const i=n.node.attrs||{},s=Z(i.inlineStyle,["width"]),c=s.endsWith("%")?Number.parseFloat(s):100,p=Math.max(35,Math.min(100,Math.round((Number.isFinite(c)?c:100)+t)));let f=K(i.inlineStyle,"width",`${p}%`);f=K(f,"max-width","100%"),f=K(f,"margin","10px auto");const y=r.state.tr.setNodeMarkup(n.pos,n.node.type,{...i,inlineStyle:f});r.view.dispatch(y.scrollIntoView()),r.view.focus()},Jt=()=>{if(!r||!r.isActive("image"))return null;const t=r.getAttributes("image"),n=Pt(t,0);return n>0?n:null},Ct=t=>{if(!r||!r.isActive("image"))return;const n=r.getAttributes("image");r.chain().focus().updateAttributes("image",{width:t.width??(n==null?void 0:n.width)??null,height:t.height??(n==null?void 0:n.height)??null,inlineStyle:t.inlineStyle??(n==null?void 0:n.inlineStyle)??null}).run()},kt=t=>{const n=Jt()||120,i=Math.max(32,Math.min(900,n+t));Ct({width:`${i}px`,height:"auto",inlineStyle:Wt(i,null)})},Qt=()=>{Ct({width:"100%",height:"auto",inlineStyle:"display:block;width:100%;max-width:100%;height:auto;object-fit:contain;"})},r=se({extensions:[ce.configure({paragraph:!1,heading:!1,link:!1,underline:!1}),We,Be,pe,he,Ie,Re,fe,me.configure({multicolor:!0}),Pe.configure({inline:!1,allowBase64:!0}),be.configure({openOnClick:!1}),xe.configure({types:["heading","paragraph"]}),ye.configure({placeholder:a}),Ne.configure({resizable:!0,allowTableNodeSelection:!0}),Le,De,Ee],content:M,onUpdate:({editor:t})=>{const n=t.getHTML();D.current=n,N.current=n,e(n)},editorProps:{attributes:{class:"print-template-editor-content"},handleDOMEvents:{focus:()=>(S==null||S(),!1),keydown:(t,n)=>{var p,f;const i=n,s=r==null?void 0:r.state.selection;return s instanceof ut&&((f=(p=s.node)==null?void 0:p.type)==null?void 0:f.name)==="table"?i.key==="Backspace"||i.key==="Delete"?(i.preventDefault(),St(),!0):i.key==="Enter"?(i.preventDefault(),ht(i.shiftKey?"before":"after"),!0):!1:!1},mousedown:(t,n)=>{var k,L,v,z,X,W,B,O,V,F,G;const i=n;if(i.button!==0)return!1;const s=i.target,c=s instanceof Element?s:(s==null?void 0:s.parentElement)||null;if(c===t.dom)return i.preventDefault(),A.current=null,Y.current=null,R(t,null),t.dispatch(t.state.tr.setSelection(st.atEnd(t.state.doc))),t.focus(),!0;const p=(k=c==null?void 0:c.closest)==null?void 0:k.call(c,"td,th"),f=(L=c==null?void 0:c.closest)==null?void 0:L.call(c,"table");if(!p||!f)return A.current=null,Y.current=null,R(t,null),!1;if(i.detail>=4){const w=yt(t,p);return w?(i.preventDefault(),A.current=null,Y.current=null,R(t,null),t.dispatch(t.state.tr.setSelection(w)),t.focus(),!0):!1}const y=wt(p,i);if(y==="column-left"||y==="column-right"){A.current=null,Y.current=null;const w=ot(t,p);if(w===null)return!1;const T=t.state.doc.resolve(w),Q=T.node(-1),at=Nt.get(Q).colCount(w-T.start(-1)),tt=y==="column-right"?at+Math.max(1,Number(((z=(v=T.nodeAfter)==null?void 0:v.attrs)==null?void 0:z.colspan)||1))-1:at,mt=ct.create(t.state.doc,w);i.preventDefault(),t.dispatch(t.state.tr.setSelection(mt)),t.focus(),nt.current={cellPos:w,column:tt,startX:i.clientX,startWidth:Math.max(25,Number((V=(W=(X=T.nodeAfter)==null?void 0:X.attrs)==null?void 0:W.colwidth)==null?void 0:V[y==="column-right"?Math.max(1,Number(((O=(B=T.nodeAfter)==null?void 0:B.attrs)==null?void 0:O.colspan)||1))-1:0])||Math.round(p.getBoundingClientRect().width/Math.max(1,Number(((G=(F=T.nodeAfter)==null?void 0:F.attrs)==null?void 0:G.colspan)||1)))),edge:y==="column-right"?"right":"left"},R(t,"column");const vt=ee=>{const et=nt.current;if(!et)return;const re=ee.clientX-et.startX,ne=et.edge==="right"?1:-1;Xt(t,et.cellPos,et.column,et.startWidth+re*ne,f)},$t=()=>{nt.current=null,R(t,null),window.removeEventListener("mousemove",vt),window.removeEventListener("mouseup",$t)};return window.addEventListener("mousemove",vt),window.addEventListener("mouseup",$t,{once:!0}),!0}if(y==="row"){const w=p.closest("tr");if(!w)return!1;const T=Math.max(24,Math.round(w.getBoundingClientRect().height||0));Y.current={table:f,row:w,startY:i.clientY,startHeight:T},R(t,"row");const Q=at=>{const tt=Y.current;if(!tt)return;const mt=at.clientY-tt.startY;Vt(t,tt.row,tt.startHeight+mt)},ft=()=>{Y.current=null,R(t,null),window.removeEventListener("mousemove",Q),window.removeEventListener("mouseup",ft)};return window.addEventListener("mousemove",Q),window.addEventListener("mouseup",ft,{once:!0}),!0}if(!i.shiftKey&&!String(p.textContent||"").trim()){const w=ot(t,p);if(w===null)return!1;i.preventDefault(),A.current=null,R(t,null);const T=st.near(t.state.doc.resolve(Math.min(t.state.doc.content.size,w+1)),1);return t.dispatch(t.state.tr.setSelection(T)),t.focus(),!0}return Yt(c,p,i)?(A.current={table:f,startCell:p,startX:i.clientX,startY:i.clientY,active:!1},R(t,null),!1):(A.current=null,R(t,null),!1)},mousemove:(t,n)=>{var z,X,W;const i=n,s=i.target,c=(z=s==null?void 0:s.closest)==null?void 0:z.call(s,"td,th"),p=wt(c,i);if(R(t,p==="row"?"row":p?"column":null),p&&!A.current)return!0;const f=A.current;if(!f)return!1;if((i.buttons&1)!==1)return A.current=null,!1;const y=(X=s==null?void 0:s.closest)==null?void 0:X.call(s,"td,th"),k=(W=s==null?void 0:s.closest)==null?void 0:W.call(s,"table");if(!y||!k||k!==f.table)return!1;const L=Math.hypot(i.clientX-f.startX,i.clientY-f.startY);if(!f.active&&L<6)return!1;const v=yt(t,f.startCell,y);return v?(f.active=!0,t.dispatch(t.state.tr.setSelection(v)),t.focus(),!0):!1},mouseup:()=>(A.current=null,Y.current=null,nt.current=null,!1),mouseleave:t=>(A.current=null,Y.current=null,nt.current=null,R(t,null),!1)}},immediatelyRender:!1});C.useEffect(()=>(g==null||g(r||null),()=>g==null?void 0:g(null)),[r,g]),C.useEffect(()=>{if(!r)return;const t=r.getHTML();if(N.current){if(M===N.current){N.current=null;return}if(t===N.current)return;N.current=null}M!==t&&(r.commands.setContent(M||"",{emitUpdate:!1}),D.current=M||"")},[r,M]),C.useEffect(()=>{M!==o&&e(M)},[M,e,o]),C.useEffect(()=>{if(!r||!r.isActive("table"))return;const t=r.getAttributes("table");t.borderColor&&_(pt(t.borderColor,"#d1d5db"))},[r,o]),C.useEffect(()=>{if(!r)return;const t=()=>{r.isActive("table")||b(!1)};return r.on("selectionUpdate",t),()=>{r.off("selectionUpdate",t)}},[r]),C.useEffect(()=>{const t=()=>{A.current=null};return window.addEventListener("mouseup",t),()=>window.removeEventListener("mouseup",t)},[]);const Zt=r!=null&&r.isActive("table")?l.jsx(Lt,{editor:r,shouldShow:()=>r.isActive("table")&&r.isFocused,children:l.jsxs("div",{className:`table-floating-tools ${U?"open":""}`,children:[l.jsx(Dt,{title:U?"بستن ابزار جدول":"ابزار جدول",children:l.jsx(It,{size:"small",shape:"circle",icon:l.jsx(gt,{}),className:"table-menu-trigger",onMouseDown:t=>t.preventDefault(),onClick:()=>b(t=>!t)})}),U?l.jsxs("div",{className:"table-bubble-menu",children:[l.jsx("span",{className:"table-size-hint",children:"عرض ستون و ارتفاع ردیف را با کشیدن لبهٔ سلول تغییر دهید."}),$("نوشتن قبل از جدول",l.jsx(Tt,{}),()=>ht("before"),!r),$("نوشتن بعد از جدول",l.jsx(bt,{}),()=>ht("after"),!r),$("کوچک‌تر کردن عرض جدول",l.jsx(At,{}),()=>Mt(-10),!r),$("بزرگ‌تر کردن عرض جدول",l.jsx(zt,{}),()=>Mt(10),!r),$("انتخاب جدول",l.jsx(gt,{}),qt,!r),$("حذف جدول",l.jsx(xt,{}),St,!r),l.jsx(dt,{type:"vertical"}),$("ردیف بالا",l.jsx(Tt,{}),()=>P(()=>r.chain().focus().addRowBefore().run()),!r),$("ردیف پایین",l.jsx(bt,{}),()=>P(()=>r.chain().focus().addRowAfter().run()),!r),$("حذف ردیف",l.jsx(xt,{}),()=>P(()=>r.chain().focus().deleteRow().run()),!r),l.jsx(dt,{type:"vertical"}),$("ستون راست",l.jsx(jt,{}),()=>P(()=>r.chain().focus().addColumnBefore().run()),!r),$("ستون چپ",l.jsx(ie,{}),()=>P(()=>r.chain().focus().addColumnAfter().run()),!r),$("حذف ستون",l.jsx(xt,{}),()=>P(()=>r.chain().focus().deleteColumn().run()),!r),l.jsx(dt,{type:"vertical"}),$("انتخاب ردیف",l.jsx(jt,{}),_t,!r),$("انتخاب ستون",l.jsx(bt,{}),Ut,!r),$("مرج",l.jsx(Ht,{}),()=>P(()=>r.chain().focus().mergeCells().run()),!r),$("جداسازی",l.jsx(le,{}),()=>P(()=>r.chain().focus().splitCell().run()),!r),l.jsx(dt,{type:"vertical"}),l.jsxs("label",{className:"color-chip",title:"رنگ کادر جدول",children:[l.jsx(gt,{}),l.jsx("input",{type:"color",value:I,onChange:t=>{const n=t.target.value;_(n),P(()=>r.chain().focus().updateAttributes("table",{borderColor:n}).run())}}),l.jsx("div",{className:"color-chip-swatches",children:m.map(t=>l.jsx("button",{type:"button",className:"color-swatch",style:{background:t},onMouseDown:n=>n.preventDefault(),onClick:()=>{_(t),P(()=>r.chain().focus().updateAttributes("table",{borderColor:t}).run())},title:t},`table-border-${t}`))})]}),l.jsxs("label",{className:"color-chip",title:"رنگ سلول",children:[l.jsx(oe,{}),l.jsx("input",{type:"color",value:H,onChange:t=>{const n=t.target.value;E(n),P(()=>r.chain().focus().setCellAttribute("backgroundColor",n).run())}}),l.jsx("div",{className:"color-chip-swatches",children:m.map(t=>l.jsx("button",{type:"button",className:"color-swatch",style:{background:t},onMouseDown:n=>n.preventDefault(),onClick:()=>{E(t),P(()=>r.chain().focus().setCellAttribute("backgroundColor",t).run())},title:t},`table-cell-${t}`))})]})]}):null]})}):null,te=r!=null&&r.isActive("image")?l.jsx(Lt,{editor:r,shouldShow:()=>r.isActive("image")&&r.isFocused,children:l.jsxs("div",{className:"table-bubble-menu",children:[$("کوچک‌کردن تصویر",l.jsx(At,{}),()=>kt(-12),!r),$("بزرگ‌کردن تصویر",l.jsx(zt,{}),()=>kt(12),!r),$("فیت داخل سلول",l.jsx(Ht,{}),Qt,!r)]})}):null;return l.jsxs("div",{className:"print-template-editor-root","data-fill-height":h?"true":"false","data-fixed-height":q?"true":"false",children:[Zt,te,l.jsx(ke,{editor:r,className:"print-template-editor-shell"}),l.jsx("style",{children:`
        .print-template-editor-root {
          position: relative;
          background: transparent;
          overflow: visible;
          z-index: 20;
          ${q?`height: ${q}px;`:""}
        }
        .print-template-editor-root:focus-within {
          z-index: 80;
        }
        .print-template-editor-root[data-fill-height='true'] {
          height: 100%;
          min-height: 0;
        }
        .print-template-editor-root[data-fill-height='true'] .print-template-editor-shell {
          height: 100%;
          min-height: 0;
        }
        .print-template-editor-content {
          min-height: ${q??Math.max(d,120)}px;
          ${q?`height: ${q}px;`:""}
          padding: ${x};
          outline: none;
          direction: rtl;
          text-align: right;
          font-family: inherit;
          line-height: 1.9;
          color: #0f172a;
          background: transparent;
          user-select: text;
          -webkit-user-select: text;
          box-sizing: border-box;
          overflow: ${q?"auto":"visible"};
          overscroll-behavior: auto;
          touch-action: auto;
        }
        .dark .print-template-editor-content {
          color: #e5e7eb;
        }
        .print-template-editor-root[data-fill-height='true'] .print-template-editor-content {
          min-height: 0;
          height: 100%;
          overflow: auto;
          overscroll-behavior: auto;
        }
        .print-template-editor-content * {
          user-select: text;
          -webkit-user-select: text;
        }
        .print-template-editor-content > :first-child {
          margin-top: 0 !important;
        }
        .print-template-editor-content > :last-child {
          margin-bottom: 0 !important;
        }
        .print-template-editor-content p {
          margin: 0 0 8px 0;
          font-size: 14px;
        }
        .dark .print-template-editor-content p,
        .dark .print-template-editor-content div,
        .dark .print-template-editor-content span,
        .dark .print-template-editor-content li,
        .dark .print-template-editor-content strong,
        .dark .print-template-editor-content em,
        .dark .print-template-editor-content u,
        .dark .print-template-editor-content blockquote,
        .dark .print-template-editor-content code,
        .dark .print-template-editor-content pre,
        .dark .print-template-editor-content h1,
        .dark .print-template-editor-content h2,
        .dark .print-template-editor-content h3,
        .dark .print-template-editor-content h4,
        .dark .print-template-editor-content h5,
        .dark .print-template-editor-content h6,
        .dark .print-template-editor-content td,
        .dark .print-template-editor-content th {
          color: #e5e7eb !important;
        }
        .dark .print-template-editor-content a {
          color: #93c5fd !important;
        }
        .print-template-editor-content td p,
        .print-template-editor-content th p {
          margin: 0 !important;
          font-size: inherit !important;
          line-height: 1.6 !important;
        }
        .print-template-editor-content td p:empty,
        .print-template-editor-content th p:empty {
          display: block !important;
          min-height: 1.6em;
          cursor: text;
        }
        .print-template-editor-content td br.ProseMirror-trailingBreak,
        .print-template-editor-content th br.ProseMirror-trailingBreak {
          display: none !important;
        }
        .print-template-editor-content h2 {
          margin: 0 0 10px 0;
          font-size: 20px;
          line-height: 1.8;
        }
        .print-template-editor-content img {
          max-width: 100%;
          height: auto;
          display: block;
          object-fit: contain;
          border-radius: 10px;
          background: rgba(248, 250, 252, 0.92);
          box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.26);
        }
        .print-editor-image-node {
          position: relative;
          display: inline-flex;
          align-items: stretch;
          justify-content: center;
          max-width: 100%;
          margin: 6px 0;
          vertical-align: top;
          direction: ltr;
          flex: 0 0 auto;
          overflow: visible;
        }
        .print-editor-image-node.variable-image {
          min-width: 84px;
          min-height: 84px;
        }
        .print-editor-image-node.selected {
          outline: 2px solid rgba(var(--brand-500-rgb), 0.55);
          outline-offset: 3px;
          border-radius: 12px;
        }
        .print-editor-image-node img {
          width: 100%;
          max-width: 100%;
          user-select: none;
          -webkit-user-drag: none;
        }
        .print-editor-image-placeholder {
          width: 100%;
          min-height: 84px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border: 1px dashed rgba(var(--brand-500-rgb), 0.5);
          border-radius: 12px;
          background: linear-gradient(180deg, rgba(var(--brand-500-rgb), 0.08), rgba(248,250,252,0.95));
          color: #334155;
          text-align: center;
          box-sizing: border-box;
        }
        .dark .print-editor-image-placeholder {
          background: linear-gradient(180deg, rgba(var(--brand-500-rgb), 0.12), rgba(15,23,42,0.92));
          color: #e2e8f0;
        }
        .print-editor-image-placeholder-icon {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(var(--brand-500-rgb), 0.14);
          color: rgb(var(--brand-500-rgb));
          font-size: 14px;
        }
        .print-editor-image-placeholder-label {
          font-size: 12px;
          line-height: 1.7;
          word-break: break-word;
          overflow-wrap: anywhere;
          direction: ltr;
        }
        .print-editor-image-handle {
          position: absolute;
          width: 12px;
          height: 12px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.95);
          background: rgb(var(--brand-500-rgb));
          box-shadow: 0 2px 10px rgba(15,23,42,0.18);
          padding: 0;
          z-index: 2;
        }
        .print-editor-image-handle.handle-nw {
          left: -6px;
          top: -6px;
          cursor: nwse-resize;
        }
        .print-editor-image-handle.handle-ne {
          right: -6px;
          top: -6px;
          cursor: nesw-resize;
        }
        .print-editor-image-handle.handle-sw {
          left: -6px;
          bottom: -6px;
          cursor: nesw-resize;
        }
        .print-editor-image-handle.handle-se {
          right: -6px;
          bottom: -6px;
          cursor: nwse-resize;
        }
        .print-template-editor-content img.ProseMirror-selectednode {
          outline: 2px solid rgba(var(--brand-500-rgb), 0.55);
          outline-offset: 3px;
          cursor: nwse-resize;
          box-shadow:
            0 0 0 1px rgba(var(--brand-500-rgb), 0.3),
            -6px -6px 0 -2px #fff,
            6px -6px 0 -2px #fff,
            -6px 6px 0 -2px #fff,
            6px 6px 0 -2px #fff;
        }
        .print-template-editor-content table {
          border-collapse: collapse;
          width: 100%;
          max-width: 100%;
          table-layout: fixed;
          margin: 10px 0;
          --table-border-color: #d1d5db;
        }
        .print-template-editor-root[data-fixed-height='true'] .print-template-editor-content table {
          margin-top: 0;
          margin-bottom: 0;
        }
        .print-template-editor-content th,
        .print-template-editor-content td {
          border: 1px solid var(--table-border-color, #d1d5db) !important;
          padding: 4px 5px;
          vertical-align: top;
          position: relative;
          cursor: text;
          transition: background-color 0.15s ease, box-shadow 0.15s ease;
          font-size: inherit;
        }
        .print-template-editor-content th:hover,
        .print-template-editor-content td:hover {
          background: rgba(var(--brand-500-rgb), 0.04);
        }
        .print-template-editor-content.resize-cursor {
          cursor: col-resize;
        }
        .print-template-editor-content.column-resize-cursor,
        .print-template-editor-content.column-resize-cursor * {
          cursor: col-resize !important;
        }
        .print-template-editor-content.row-resize-cursor,
        .print-template-editor-content.row-resize-cursor * {
          cursor: row-resize !important;
        }
        .print-template-editor-content .grip-column,
        .print-template-editor-content .grip-row,
        .print-template-editor-content .grip-table,
        .print-template-editor-content .grip-cell,
        .print-template-editor-content .tableGripColumn,
        .print-template-editor-content .tableGripRow,
        .print-template-editor-content .tableGripTable,
        .print-template-editor-content .column-grip,
        .print-template-editor-content .row-grip,
        .print-template-editor-content .table-grip {
          display: none !important;
          pointer-events: none !important;
        }
        .print-template-editor-content .column-resize-handle {
          display: none !important;
          pointer-events: none !important;
        }
        .print-template-editor-content .selectedCell:after {
          background: rgba(var(--brand-500-rgb), 0.08);
          border: 1px solid rgba(var(--brand-500-rgb), 0.35);
        }
        .print-template-editor-content .ProseMirror-selectednode table,
        .print-template-editor-content .ProseMirror-selectednode {
          outline: 2px solid rgba(var(--brand-500-rgb), 0.28);
        }
        .print-template-editor-content table:hover {
          box-shadow: 0 0 0 1px rgba(var(--brand-500-rgb), 0.16);
        }
        .table-floating-tools {
          display: inline-flex;
          align-items: flex-start;
          gap: 6px;
          direction: rtl;
          position: relative;
          z-index: 10000;
        }
        .table-menu-trigger {
          border-color: rgba(var(--brand-500-rgb), 0.35);
          color: rgb(var(--brand-500-rgb));
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
        }
        .dark .table-menu-trigger {
          background: rgba(17, 24, 39, 0.96);
          border-color: rgba(var(--brand-500-rgb), 0.45);
        }
        .table-bubble-menu {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          max-width: min(680px, 88vw);
          padding: 8px;
          position: relative;
          z-index: 10001;
          border: 1px solid rgba(229, 231, 235, 0.9);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
          backdrop-filter: blur(10px);
        }
        .table-size-hint {
          flex: 1 1 100%;
          color: #64748b;
          font-size: 11px;
          line-height: 1.65;
          padding: 0 2px 2px;
        }
        .dark .table-size-hint { color: #cbd5e1; }
        .dark .table-bubble-menu {
          background: rgba(17, 24, 39, 0.96);
          border-color: rgba(71, 85, 105, 0.95);
        }
        [data-tippy-root],
        .tippy-box,
        .tippy-content {
          z-index: 10000 !important;
        }
        .color-chip {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 10px;
          padding: 4px 8px;
          background: rgba(255,255,255,0.92);
        }
        .dark .color-chip {
          background: rgba(15,23,42,0.9);
          border-color: rgba(71,85,105,0.5);
        }
        .color-chip input {
          width: 24px;
          height: 24px;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
        }
        .color-chip-swatches {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
          max-width: 160px;
        }
        .color-swatch {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.5);
          cursor: pointer;
          padding: 0;
        }
        @media (max-width: 768px) {
          .table-bubble-menu {
            max-width: 92vw;
          }
        }
      `})]})};export{tr as default};
