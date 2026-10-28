/* Connection status and offline-first UI states.

   WHAT IS REAL
   - The Online/Offline pill follows the browser's own connection status (navigator.onLine and
     the "online" / "offline" events).

   WHAT IS DEMO ONLY (nothing below is a real offline system yet)
   - "Simulate offline" is a demo switch so the states can be shown without turning Wi-Fi off.
   - The "device queue" is the demo queue in js/api.js (localStorage). It is NOT IndexedDB, there
     is no service worker, and nothing is synchronized automatically.
   - "Sync now (demo)" only moves a report from the demo queue to the demo store. No server is
     contacted and no server confirmation exists.

   Sync states (the UI is ready for all four):
     local     Saved locally   saved on this device while offline
     pending   Pending sync    back online, waiting to be synchronized
     syncing   Syncing         a sync is running
     submitted Submitted       accepted (reports without a `sync` field count as submitted)

   TODO(offline): replace the queue with a real offline store + background sync, then keep
   setting report.sync to one of the four values above and this UI keeps working. */
const NET={sim:false};                                   // DEMO: simulate offline switch
const isOnline=()=>!NET.sim&&navigator.onLine!==false;

const SYNC_STEPS=[['local','Saved locally'],['pending','Pending sync'],['syncing','Syncing'],['submitted','Submitted']];
const SYNC_COPY={
  local:'Saved on this device. A report made offline is meant to stay here until it can be synchronized. In this prototype it is kept in this browser only.',
  pending:'You are back online and this report is waiting to be synchronized. Automatic sync is not built yet, so use Sync now to simulate it.',
  syncing:'Simulating a sync. Nothing is sent to a real server.',
  submitted:'Submitted to the demo store. There is no real server confirmation yet.'};
/* Server mode (Phase 2): sending a report is real, but the offline queue is still basic (it lives in this browser only). */
const SYNC_COPY_SERVER={
  local:'Saved on this device. It stays here until you are back online. This browser keeps it in its own storage, not in a full offline database yet.',
  pending:'You are back online and this report is waiting to be sent. Automatic sending is not built yet, so use Send now.',
  syncing:'Sending this report to the server.',
  submitted:'Submitted. The report is saved in the READYLINK database.'};
const syncCopy=s=>(API.mode==='server'?SYNC_COPY_SERVER:SYNC_COPY)[s];
const syncState=r=>r.sync||'submitted';
const isQueued=r=>syncState(r)!=='submitted';
const findReport=id=>R.find(r=>r.id===id)||Q.find(r=>r.id===id);       // server reports, then the device queue
const myReports=()=>Q.concat(API.mode==='server'?MY:R.filter(r=>r.mine)); // the resident's reports, queued ones first. Server mode: MY comes from ?mine=1

const syncLabel=s=>SYNC_STEPS.find(x=>x[0]===s)[1];
const syncB=s=>`<span class="sy ${s}">${syncLabel(s)}</span>`;
const syncProg=s=>{const i=SYNC_STEPS.findIndex(x=>x[0]===s);return `<div class="prog" title="${syncLabel(s)}">${SYNC_STEPS.map((x,n)=>`<i class="${n<=i?'on':''}"></i>`).join('')}</div>`};
function syncSteps(cur){const i=SYNC_STEPS.findIndex(x=>x[0]===cur);
  return `<ol class="syncsteps" aria-label="Sync status">${SYNC_STEPS.map(([k,t],n)=>`<li class="${cur==='submitted'||n<i?'done':n===i?'cur '+k:''}">${t}</li>`).join('')}</ol>`}

function netPill(){const on=isOnline();
  return `<span class="net ${on?'on':'off'}" title="${on?'Connected':'No connection'}"><i></i>${on?'Online':'Offline'}${NET.sim?'<em>(simulated)</em>':''}</span>`}
function netBox(){
  return `<div class="netbox" aria-live="polite">${netPill()}<button class="linkbtn" data-act="simoffline" aria-pressed="${NET.sim}">${NET.sim?'Stop simulating offline':'Demo: simulate offline'}</button></div>`}

/* Note shown on the Review step, before sending. */
function connNote(){
  return isOnline()
   ?`<div class="note">${ic('check',16)}<span>${API.mode==='server'?'You are online. Sending saves the report in the READYLINK database.':'You are online. Sending saves the report to the demo store. There is no real server yet.'}</span></div>`
   :`<div class="note">${ic('info',16)}<span>You are offline. Your report is meant to stay on this device until you are back online, then be synchronized. ${API.mode==='server'?'Until you send it, it is kept in this browser only, and the result above is a sample.':'In this prototype it is kept in this browser only (demo), and the result above is a sample.'}</span></div>${syncSteps('local')}`}

/* Sync card used on the success screen and on Track report for reports that are not submitted yet. */
function syncBox(r,withNet=true){const s=syncState(r),can=s==='pending'&&isOnline();
  return `<div class="syncbox"><div class="sb-head"><b>Sync status</b><span class="demotag" style="margin:0">Demo</span></div>${syncSteps(s)}<p class="small muted">${syncCopy(s)}</p>
  ${s!=='submitted'?`<div class="act"><button class="btn primary sm" data-act="syncnow" data-id="${r.id}" ${can?'':'disabled'}>${s==='syncing'?(API.mode==='server'?'Sending…':'Syncing…'):(API.mode==='server'?'Send now':'Sync now (demo)')}</button></div>`:''}${withNet?netBox():''}</div>`}

/* DEMO: updates the queue states to match the connection, then redraws. */
async function applyConnectivity(){await API.setConnectivity(isOnline());await loadQueue()}
function renderNet(){if(!location.hash.startsWith('#/admin'))render(true)}
async function onConnectionChange(){await applyConnectivity();renderNet()}
addEventListener('online',onConnectionChange);
addEventListener('offline',onConnectionChange);

/* DEMO: simulates one sync. TODO(offline): replace API.syncReport with the real sync call. */
async function syncNow(id){
  const r=findReport(id);if(!r||!isQueued(r)||syncState(r)==='syncing')return;
  if(!isOnline()||syncState(r)!=='pending'){toast(API.mode==='server'?'Connect first, then send.':'Connect first, then sync (demo)');return}
  await API.setQueueState(id,'syncing');await loadQueue();render(true);
  try{const nr=await API.syncReport(id);
    try{await Promise.all([loadReports(),loadQueue()])}catch(refreshErr){ // the report IS saved; only the refresh failed
      if(!R.some(x=>x.id===nr.id))R.unshift(nr);try{await loadQueue()}catch(queueErr){/* shown again next time */}}
    if(D.done&&D.done.id===id)D.done=findReport(nr.id)||nr;
    toast(API.mode==='server'?'Report sent to the server.':'Submitted (demo). No real server yet.');
    if(location.hash==='#/track/'+id)goto('#/track/'+nr.id);else render(true)}
  catch(e){await API.setQueueState(id,'pending');await loadQueue();toast((e&&e.userMessage)||'Sync failed (demo). Try again.');render(true)}}
