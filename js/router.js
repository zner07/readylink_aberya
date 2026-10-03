/* Hash router and render(). */

/* =========================================================
   7. ROUTER
   ========================================================= */
function render(keepScroll){
  const hash=location.hash,p=(hash.replace(/^#\/?/,'')||'home').split('/');let h;
  if(p[0]==='report'&&S.prev!=='report'&&D.done)D=newDraft();     // start a fresh draft after a finished report
  if(p[0]==='admin'){
    if(!S.admin){S.next=hash;h=pubShell(pageLogin(),'')}
    else{const k=p[1]?'admin/'+p[1]:'admin';
      if(p[1]==='reports')h=pageReports();else if(p[1]==='report')h=pageReview(p[2]);else if(p[1]==='map')h=pageMap(true);else h=pageOverview();
      h=admShell(h,p[1]==='report'?'admin/reports':k)}
  }else{
    const m={home:pageHome,report:pageReport,map:()=>pageMap(false),mine:pageMine};
    h=pubShell(p[0]==='track'?pageTrack(p[1]):(m[p[0]]||pageHome)(),p[0]==='track'?'mine':(m[p[0]]?p[0]:'home'))}
  S.prev=p[0];
  $('#app').innerHTML=h;if(!keepScroll)scrollTo(0,0);
  document.querySelectorAll('[data-go]').forEach(e=>{e.tabIndex=0;e.setAttribute('role','link')});
  syncMenu();
  if($('#wizMain'))wizRender();
  const q=$('#q');if(q)q.oninput=()=>{F().q=q.value;const k=q.selectionStart;render(true);const n=$('#q');n.focus();n.setSelectionRange(k,k)};
  const lf=$('#lf');if(lf)lf.onsubmit=async e=>{e.preventDefault();const err=$('#lerr'),b=$('#lbtn');
    if(!$('#em').value.trim()||!$('#pw').value){err.textContent='Enter an email and a password.';err.hidden=false;return}
    b.disabled=true;b.textContent='Signing in…';const res=await API.signIn($('#em').value.trim(),$('#pw').value);
    if(!res.ok){err.textContent='Sign in failed.';err.hidden=false;b.disabled=false;b.textContent='Sign in';return}
    S.admin=true;const n=S.next;S.next=null;goto(n&&n!=='#/admin'?n:'#/admin')}
}
addEventListener('hashchange',()=>{closeDlg();render()});
