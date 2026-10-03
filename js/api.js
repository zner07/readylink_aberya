/* DEMO DATA LAYER: the one file to replace with real backend / AI / auth calls. */

/* =========================================================
   2. DEMO DATA LAYER  ->  REPLACE WITH BACKEND LATER
   ---------------------------------------------------------
   Everything the UI needs from a server goes through the
   `API` object below. Each method is async on purpose, so a
   groupmate can swap its body for a fetch() call without
   touching any page/UI code.

   DEMO behavior right now:
   - Data lives in the SEED array + this browser's localStorage.
   - analyzeReport() is a MOCK. It does NOT look at the photo.
   - signIn() accepts any non-empty email/password.

   TODO(backend)  listReports / submitReport / updateReport
   TODO(ai)       analyzeReport  (real model / API call)
   TODO(auth)     signIn / signOut  (real session or JWT)
   ========================================================= */
const DEMO_KEY='readylink-demo-v1';
const MINE=['RL-027','RL-031','RL-033'];                       // DEMO: which seed reports "belong" to the signed-in resident
const SEED=()=>rd.map(([id,type,x,y,lv,si,date,desc])=>{        // DEMO: sample reports (see `rd` above)
  const log=[{t:'Report submitted',d:date},{t:'AI-assisted assessment generated',d:date}];
  if(si>=1)log.push({t:'Verified by barangay admin',d:'Sep 28'});
  if(si>=2)log.push({t:'Placed under monitoring',d:'Sep 29'});
  if(si>=3)log.push({t:'Marked as resolved',d:'Oct 1'});
  return{id,type,x,y,ai:lv,lv,st:STS[si],date,desc,brgy:brgyAt(x,y),mine:MINE.includes(id),log}});
const R=[];                                                     // UI reads reports from here. Filled by loadReports().
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const todayStr=()=>new Date().toLocaleString('en-US',{month:'short',day:'numeric'});
const stampStr=()=>new Date().toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
let _db=null;                                                   // DEMO: in-memory copy of the "database"
const dbLoad=()=>{if(_db)return _db;try{const j=localStorage.getItem(DEMO_KEY);if(j)_db=JSON.parse(j)}catch(e){}return _db||(_db=SEED())};
/* Saves to localStorage. If the browser quota is hit, older photos are dropped from STORAGE only
   (the in-memory copy, and so the current session, keeps every photo). Returns true when everything was stored. */
const dbSave=()=>{const withImg=_db.filter(r=>r.img);
  for(let n=withImg.length;n>=0;n--){const keep=new Set(withImg.slice(0,n));
    try{localStorage.setItem(DEMO_KEY,JSON.stringify(_db.map(r=>r.img&&!keep.has(r)?{...r,img:null}:r)));return n===withImg.length}catch(e){}}
  return false};

const API={
  /** GET /reports  -> Report[]   (TODO(backend)) */
  async listReports(){return dbLoad().map(r=>({...r,log:[...r.log]}))},

  /** POST /reports/analyze  -> {t,c,lv,reason}   (TODO(ai))
   *  MOCK ONLY: picks a result from the sample photo type or from keywords in the note.
   *  It never inspects the uploaded image. */
  async analyzeReport(draft){
    await wait(1600);
    const t=draft.type||guessType(draft.desc);let lv=BASE_LV[t],note='';
    if(/house|school|bahay|bata|children|residential|homes/i.test(draft.desc)){if(lv==='lo')lv='mod';else if(lv==='mod')lv='hi';note=' The note mentions people nearby, so the demo raises the priority.'}
    return{t,c:TYPES[t].c,lv,reason:AI_REASON[t]+note,demo:true}},

  /** POST /reports  -> Report   (TODO(backend): upload draft.img to storage, save row) */
  async submitReport(draft,analysis){
    await wait(500);const db=dbLoad();
    const n=Math.max(0,...db.map(r=>parseInt(r.id.slice(3),10)))+1,id='RL-'+String(n).padStart(3,'0');
    const r={id,type:analysis.t,x:draft.x,y:draft.y,ai:analysis.lv,lv:analysis.lv,st:'Pending',date:todayStr(),desc:draft.desc.trim()||'No description provided.',brgy:brgyAt(draft.x,draft.y),mine:true,img:draft.img||null,
      log:[{t:'Report submitted',d:stampStr()},{t:'AI-assisted assessment generated (demo)',d:stampStr()}]};
    db.unshift(r);
    if(!dbSave())API.lastWarning='Your photo is shown now, but this browser is too full to keep it after a refresh.'
    return{...r}},

  /** PATCH /reports/:id  {status?, level?, remark?}  -> Report   (TODO(backend), admin only) */
  async updateReport(id,patch){
    await wait(200);const r=dbLoad().find(x=>x.id===id);if(!r)throw new Error('not found');const d=stampStr(),n=patch.remark||undefined;
    if(patch.status&&patch.status!==r.st){const a=STS.indexOf(r.st),b=STS.indexOf(patch.status);
      r.st=patch.status;r.log.push({t:b===a+1?['','Verified by barangay admin','Placed under monitoring','Marked as resolved'][b]:'Status changed to '+patch.status,d,n})}
    else if(patch.remark)r.log.push({t:'Admin remark added',d,n});
    if(patch.level&&patch.level!==r.lv){r.lv=patch.level;r.log.push({t:'Risk level set to '+LV[patch.level]+' by admin',d})}
    dbSave();return{...r}},

  /** POST /auth/login   (TODO(auth)) DEMO: any non-empty details are accepted */
  async signIn(email,password){await wait(350);if(!(email&&password))return{ok:false};try{sessionStorage.setItem('readylink-demo-admin','1')}catch(e){}return{ok:true,user:{name:'LGU Admin'}}},
  /** POST /auth/logout  (TODO(auth)) */
  async signOut(){try{sessionStorage.removeItem('readylink-demo-admin')}catch(e){}return{ok:true}},
  /** DEMO: remembers the fake sign-in for this tab only. TODO(auth): read the real session/token instead. */
  hasSession(){try{return sessionStorage.getItem('readylink-demo-admin')==='1'}catch(e){return false}},

  /** DEMO ONLY: restore the sample data. Delete when a real DB exists. */
  async resetDemo(){_db=SEED();dbSave()}
};
async function loadReports(){R.splice(0,R.length,...await API.listReports())}
