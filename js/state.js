/* UI state, the in-progress report draft, toast and confirm dialog. */

/* =========================================================
   3. UI STATE  (frontend only, safe to keep)
   ========================================================= */
const blankFilter=()=>({lv:'all',cat:'all',st:'all',q:''});
const S={admin:false,pf:blankFilter(),af:blankFilter(),sel:null,heroSel:'RL-029',next:null,prev:null,dlg:null};
const F=()=>location.hash.startsWith('#/admin')?S.af:S.pf;       // public map and admin keep separate filters
const newDraft=()=>({step:1,img:null,fname:'',type:null,x:null,y:null,desc:'',locating:false,scan:false,res:null,done:null,sending:false,run:0});
let D=newDraft();                                                // the in-progress "Report a risk" draft
const dirty=()=>!!(D.img||D.type||D.x!=null||D.desc.trim());
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('show'),2400)};
const lvB=l=>`<span class="lv ${l}">${LV[l]}</span>`;
const stB=s=>`<span class="st s${STS.indexOf(s)}">${s}</span>`;
const prog=r=>`<div class="prog" title="${r.st}">${STS.map((s,i)=>`<i class="${i<=si(r)?'on':''}"></i>`).join('')}</div>`;
const byLevel=(a,b)=>'hi mod lo'.indexOf(a.lv)-'hi mod lo'.indexOf(b.lv)||a.id.localeCompare(b.id);
const goto=h=>{if(location.hash===h)render();else location.hash=h};

/* confirm dialog (used for Cancel report, Reset demo data) */
function openDlg(o){S.dlg=o;drawDlg()}
function closeDlg(){S.dlg=null;drawDlg()}
function drawDlg(){let el=$('#dlg');if(!S.dlg){if(el)el.remove();return}
  if(!el){el=document.createElement('div');el.id='dlg';el.className='dlg-back';document.body.appendChild(el)}
  const o=S.dlg;el.innerHTML=`<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgt"><h3 id="dlgt">${o.title}</h3><p class="muted" style="margin:8px 0 22px">${o.body}</p><div class="act" style="justify-content:flex-end"><button class="btn ghost" data-act="dlg-no">${o.no||'Cancel'}</button><button class="btn primary" data-act="dlg-yes">${o.yes}</button></div></div>`;
  el.querySelector('[data-act=dlg-yes]').focus()}
