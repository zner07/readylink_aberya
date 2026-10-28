/* Page shells: public navbar + mobile menu, admin sidebar + mobile menu, footer. */

/* =========================================================
   4. SHELLS
   ========================================================= */
function theme(){return document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}
const themeBtn=()=>`<button class="iconbtn" data-act="theme" aria-label="Toggle theme">${ic(theme()==='dark'?'sun':'moon',17)}</button>`;
function pubShell(inner,on){
  const L=[['home','Home'],['report','Report a risk'],['map','Risk map'],['mine','My reports']];
  return `<header class="nav glass"><a class="logo" href="#/home">${LOGO}<span>READYLINK</span></a>
  <nav class="links" aria-label="Main">${L.map(([k,t])=>`<a href="#/${k}" class="${on===k?'on':''}">${t}</a>`).join('')}</nav>
  <div class="tail">${themeBtn()}<a class="btn ghost sm" href="#/admin">${ic('shield',16)} Admin</a></div>
  <button class="iconbtn menubtn" data-act="menu" aria-label="Menu" aria-expanded="false" aria-controls="mmenu"><span class="ic-open">${ic('menu',19)}</span><span class="ic-close">${ic('x',19)}</span></button></header>
  <div class="nav-scrim" data-act="menu-close"></div>
  <nav class="mmenu glass" id="mmenu" aria-label="Menu">${L.map(([k,t])=>`<a href="#/${k}" class="mi ${on===k?'on':''}">${t==='Report a risk'?'Report a Risk':t==='My reports'?'My Reports':t==='Risk map'?'Risk Map':t}</a>`).join('')}
   <a href="#/admin" class="mi sep">${ic('shield',18)}<span>Admin</span></a>
   <button class="mi" data-act="theme">${ic(theme()==='dark'?'sun':'moon',18)}<span>${theme()==='dark'?'Switch to light theme':'Switch to dark theme'}</span></button></nav>
  <main>${inner}</main>
  <div class="wrap"><footer><span>READYLINK. Prototype area: Brgy. Alangilan, Batangas City. ${API.mode==='server'?'Reports are saved in the READYLINK database on this computer. AI results, admin actions and offline sync are still demo.':'Demo data is saved in this browser only.'}</span><span style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">AI suggests. Admins verify.<button class="linkbtn" style="padding:0;font-size:13px" data-act="simoffline" aria-pressed="${NET.sim}">Simulate offline: ${NET.sim?'on':'off'} (demo)</button>${API.mode==='server'?'':'<button class="linkbtn" style="padding:0;font-size:13px" data-act="reset">Reset demo data</button>'}</span></footer></div>`}
function admShell(inner,on){
  const open=R.filter(r=>r.st==='Pending').length;
  const L=[['admin','Overview','grid'],['admin/reports','Reports','list'],['admin/map','Risk map','map']];
  return `<div class="adm"><aside class="side glass"><a class="logo" href="#/admin">${LOGO}<span>READYLINK</span></a>
  ${L.map(([k,t,i])=>`<a class="it ${on===k?'on':''}" href="#/${k}">${ic(i,18)}${t}${k==='admin/reports'&&open?`<b>${open}</b>`:''}</a>`).join('')}
  <div class="sp"></div><a class="it" href="#/home">${ic('globe',18)}Public site</a>
  <div class="it" style="padding:6px 12px;display:flex">${themeBtn()}</div>
  <div class="me"><div class="av">LG</div><div style="line-height:1.3"><b>LGU Admin</b><div class="faint small">Disaster risk office</div></div><button class="iconbtn" style="margin-left:auto;width:32px;height:32px" data-act="logout" aria-label="Sign out">${ic('out',15)}</button></div>
  <button class="iconbtn menubtn" data-act="menu" aria-label="Menu" aria-expanded="false" aria-controls="mmenu"><span class="ic-open">${ic('menu',19)}</span><span class="ic-close">${ic('x',19)}</span></button></aside>
  <main class="amain">${inner}</main></div>
  <div class="nav-scrim" data-act="menu-close"></div>
  <nav class="mmenu glass" id="mmenu" aria-label="Admin menu">${L.map(([k,t,i])=>`<a href="#/${k}" class="mi ${on===k?'on':''}">${ic(i,18)}<span style="flex:1">${t}</span>${k==='admin/reports'&&open?`<b class="mbadge">${open}</b>`:''}</a>`).join('')}
   <a href="#/home" class="mi sep">${ic('globe',18)}<span>Public site</span></a>
   <button class="mi" data-act="theme">${ic(theme()==='dark'?'sun':'moon',18)}<span>${theme()==='dark'?'Switch to light theme':'Switch to dark theme'}</span></button>
   <button class="mi" data-act="logout">${ic('out',18)}<span>Sign out</span></button></nav>`}
