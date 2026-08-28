/* ui.js — tiny shared UI kit + the lock screen both apps share.
   Everything is plain English and one-thing-per-screen. */

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---- navigation: a simple screen stack rendered into #root ---- */
const Nav = {
  stack:[],
  root:null,
  init(root){ this.root=root; },
  go(render, opts={}){
    this.stack.push(render);
    this._render();
  },
  reset(render){ this.stack=[render]; this._render(); },
  back(){ if(this.stack.length>1){ this.stack.pop(); this._render(); } },
  refresh(){ this._render(); },
  _render(){
    const render = this.stack[this.stack.length-1];
    this.root.innerHTML='';
    const node = render();
    this.root.appendChild(node);
    window.scrollTo(0,0);
  }
};

/* ---- a standard screen with a title bar ---- */
function Screen(title, bodyNodes, {back=true}={}){
  const s = el(`<div class="screen active"></div>`);
  const bar = el(`<div class="bar"></div>`);
  if(back && Nav.stack.length>1){
    const b = el(`<button class="back" aria-label="Back">‹</button>`);
    b.onclick = ()=>Nav.back();
    bar.appendChild(b);
  }
  bar.appendChild(el(`<h1>${esc(title)}</h1>`));
  s.appendChild(bar);
  const body = el(`<div></div>`);
  (Array.isArray(bodyNodes)?bodyNodes:[bodyNodes]).forEach(n=> n && body.appendChild(typeof n==='string'?el(n):n));
  s.appendChild(body);
  return s;
}

/* ---- big button helper ---- */
function BigBtn({ico='',title='',badge='',sub='',arrow=true,primary=false,onClick}){
  const b = el(`<button class="btn ${primary?'btn-primary':''}">
    ${ico?`<span class="ico">${ico}</span>`:''}
    <span class="txt">${esc(title)}${sub?`<br><span class="tiny">${esc(sub)}</span>`:''}</span>
    ${badge!==''?`<span class="badge">${esc(badge)}</span>`:''}
    ${arrow&&!primary?`<span class="arrow">›</span>`:''}
  </button>`);
  b.onclick = onClick;
  return b;
}

/* ---- toast ---- */
let toastEl;
function toast(msg, ms=2200){
  toastEl = toastEl || document.body.appendChild(el(`<div id="toast"></div>`));
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove('show'), ms);
}

/* ---- bottom sheet ---- */
function sheet(title, nodes){
  const bg = document.body.appendChild(el(`<div class="sheet-bg"></div>`));
  const sh = document.body.appendChild(el(`<div class="sheet"><h2>${esc(title)}</h2></div>`));
  (Array.isArray(nodes)?nodes:[nodes]).forEach(n=> n && sh.appendChild(typeof n==='string'?el(n):n));
  requestAnimationFrame(()=>{ bg.classList.add('show'); sh.classList.add('show'); });
  const close=()=>{ bg.classList.remove('show'); sh.classList.remove('show'); setTimeout(()=>{bg.remove();sh.remove();},260); };
  bg.onclick=close;
  return { close, node:sh };
}

/* ---- simple confirm ---- */
function confirmSheet(title, message, okText='Yes', onOk){
  const yes = BigBtn({title:okText, primary:true, onClick:()=>{ s.close(); onOk&&onOk(); }});
  const no  = BigBtn({title:'Cancel', onClick:()=>s.close(), arrow:false});
  const s = sheet(title, [el(`<p class="plain">${esc(message)}</p>`), yes, no]);
}

async function copy(text){
  try{ await navigator.clipboard.writeText(text); toast('Copied'); }
  catch(e){ toast('Copy failed — long-press to copy'); }
}

/* time ago */
function ago(t){
  const s=Math.floor((Date.now()-t)/1000);
  if(s<60)return'just now'; if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago';
}

window.UI = { $, $$, el, esc, Nav, Screen, BigBtn, toast, sheet, confirmSheet, copy, ago };
