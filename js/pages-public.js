/* Public pages: Home, Report a risk (4-step wizard), Risk map, My reports, Track report. */

/* =========================================================
   5. PUBLIC PAGES
   ========================================================= */
function heroCard(r){return `<div class="hc">${photo(r)}<div><h3>${title(r)}</h3><p>${r.brgy}</p><div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${lvB(r.lv)}${stB(r.st)}</div></div></div>`}
function pageHome(){
  const open=R.filter(r=>r.st!=='Resolved'),hi=open.filter(r=>r.lv==='hi').length,vr=R.filter(r=>si(r)>=1).length;
  const hs=R.find(r=>r.id===S.heroSel&&r.st!=='Resolved')||open[0];
  const recent=[...R].sort((a,b)=>b.id.localeCompare(a.id)).slice(0,4);
  return `<section class="hero wrap"><div class="hero-copy">
   <h1>Report hazards before they become disasters.</h1>
   <p class="lead">See a leaning tree, a blocked drain or a cracked pole? Take a photo and add the location. AI helps sort what it is and how urgent it looks, and your barangay admin verifies it before it joins the community risk map.</p>
   <div class="cta"><a class="btn primary" href="#/report">${ic('camera')} Report a risk</a><a class="btn ghost" href="#/map">${ic('map')} See the risk map</a></div>
   <dl class="facts"><div><dt>${R.length}</dt><dd>risks reported</dd></div><div><dt>${hi}</dt><dd>high-risk areas still open</dd></div><div><dt>${vr}</dt><dd>checked by an admin</dd></div></dl></div>
   <div class="hero-map glass" data-ctx="hero">${mapSVG({list:open,sel:hs?.id})}${hs?`<div class="float glass" id="heroCard" data-go="#/map" data-sel="${hs.id}" style="cursor:pointer" title="Open on the risk map">${heroCard(hs)}</div>`:''}</div></section>

  <section class="sec wrap"><h2>From a photo to a monitored risk</h2>
  <ol class="flow">
   <li><span class="n">1</span><h3>Spot it</h3><p>A resident notices something that could go wrong in the rain or wind.</p></li>
   <li><span class="n">2</span><h3>Photo and place</h3><p>Upload a picture and pin it on the map. A short note is optional.</p></li>
   <li class="ai"><span class="n">${ic('spark',16)}</span><h3>AI sorts it</h3><p>It suggests a category, a risk level and a one-line reason.</p></li>
   <li class="hu"><span class="n">${ic('check',16)}</span><h3>Admin verifies</h3><p>A person reviews the photo and confirms or changes the level.</p></li>
   <li><span class="n">5</span><h3>Monitor</h3><p>Verified risks appear on the map until they are resolved.</p></li></ol></section>

  <section class="sec wrap"><div class="glass split"><div><h2>AI recommends. People decide.</h2>
   <p class="lead" style="margin-top:14px">The system never declares something dangerous or sends anyone out on its own. It helps admins get through many photo reports faster.</p>
   <ul><li>${ic('eye',20)}<span>Every AI assessment is labeled as a suggestion.</span></li><li>${ic('shield',20)}<span>Nothing is marked verified until an admin has looked at the photo.</span></li><li>${ic('layers',20)}<span>Admins can change the risk level and add remarks at any time.</span></li></ul></div>
   <div class="aibox"><div style="display:flex;justify-content:space-between;align-items:center"><span class="k">AI-assisted risk assessment (sample)</span>${lvB('hi')}</div>
    <div><h3>Damaged electrical pole</h3><p class="muted small" style="margin-top:6px">Visible structural damage and a position beside a residential footpath.</p></div>
    <div class="meter hi"><i></i><i></i><i></i></div><div class="note">${ic('info',16)}<span>Suggestion only. Waiting for admin verification.</span></div></div></div></section>

  <section class="sec wrap"><div class="ph-head" style="padding:0 0 14px"><h2>Latest reports</h2><a class="btn ghost sm" href="#/map">View all on the map</a></div>
   <div class="rows">${recent.length?recent.map(r=>`<div class="rrow" data-go="#/map" data-sel="${r.id}">${photo(r)}<div><h3>${title(r)}</h3><span class="muted small">${r.brgy}, ${r.date}</span></div><span class="hm">${cat(r)}</span><div style="display:flex;gap:8px">${lvB(r.lv)}<span class="hm">${stB(r.st)}</span></div></div>`).join(''):`<div class="hint"><b>No reports yet</b><span>Reports sent by residents will show up here.</span><a class="btn primary" href="#/report">Report a risk</a></div>`}</div></section>`}

/* ---- Report a risk (4-step wizard) ---- */
function wizSide(){const loc=D.x!=null?brgyAt(D.x,D.y):'Not set';
  return `<aside class="glass side-sum"><span class="lab">Your report</span>${D.img||D.type?photo({type:D.type||'road',img:D.img}):`<div class="empty">No photo yet</div>`}
  <dl class="kv"><div><dt>Photo</dt><dd>${D.img?'Uploaded':D.type?'Sample: '+TYPES[D.type].t:'Not added'}</dd></div><div><dt>Location</dt><dd>${loc}</dd></div><div><dt>Note</dt><dd>${D.desc?esc(D.desc.slice(0,70))+(D.desc.length>70?'…':''):'None'}</dd></div></dl></aside>`}
function guessType(t){const m=[[/tree|puno/i,'tree'],[/drain|barado|canal/i,'drain'],[/pole|poste|wire/i,'pole'],[/flood|baha/i,'flood'],[/slope|landslide|bundok/i,'slope'],[/river|ilog|bank|creek|stream/i,'river'],[/wall|pader/i,'wall']];for(const[r,k]of m)if(r.test(t))return k;return 'road'}
const PHRASES=['Near houses','Near a school','Gets worse when it rains','Blocks the road'];
function wizBody(){
  const st=D.step;
  if(D.done){const r=findReport(D.done.id)||D.done,q=isQueued(r);
   return `<div class="glass success"><div class="tick ${q?'q':''}">${ic(q?'info':'check',28)}</div><div><h2>${q?'Saved on this device':'Report sent'}</h2><p class="lead" style="margin-top:10px">${q?'You are offline, so this report is waiting on your device. It is meant to be sent when you are back online.':'Thank you. Your report is now waiting for admin review.'}</p></div>
   <dl class="kv" style="width:100%"><div><dt>Report ID</dt><dd>${q?'Assigned after sync':r.id}</dd></div><div><dt>Category</dt><dd>${cat(r)}</dd></div><div><dt>Demo AI risk level</dt><dd>${lvB(r.lv)}</dd></div><div><dt>${q?'Sync status':'Status'}</dt><dd>${q?syncB(syncState(r)):stB(r.st)}</dd></div></dl>
   ${q?syncBox(r,false):''}
   <div class="cta"><a class="btn primary" href="#/track/${r.id}">${ic('eye')} Track this report</a><a class="btn ghost" href="#/mine">My reports</a><button class="linkbtn" data-act="again">Report another risk</button></div></div>`}
  const head=`<div class="steps">${['Photo','Location','Details','Review'].map((s,i)=>{const n=i+1,c=n<st?'done':n===st?'cur':'';return n<st?`<button class="${c}" data-act="goto" data-s="${n}">${s}</button>`:`<div class="${c}">${s}</div>`}).join('')}</div>`;
  const cancel=`<button class="linkbtn" data-act="cancel">Cancel</button>`;
  let body='';
  if(st===1){const picked=D.img||D.type;
   const FILE=`<input type="file" class="fileinp" id="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" aria-label="Choose a photo">`;
   body=`<div><h2 style="font-size:30px">Add a photo of the risk</h2><p class="muted" style="margin-top:8px">A clear photo helps the admin review it faster.</p></div>
   ${picked?`<div class="picked"><div class="pk-img">${photo({type:D.type||'road',img:D.img})}</div><div class="pk-bar"><span class="small muted pk-name">${D.img?esc(D.fname||'Your photo'):'Sample: '+TYPES[D.type].t}</span><div class="act"><label class="btn ghost sm filebtn">${ic('upload',15)} Choose a different photo${FILE}</label><button class="btn ghost sm" data-act="rmphoto">${ic('x',15)} Remove photo</button></div></div></div>`
   :`<label class="drop">${FILE}${ic('upload',32)}<b>Take or upload a photo</b><span class="muted small">JPG, PNG or WEBP, up to 10 MB</span></label>`}
   <div><span class="lab">Or try a sample photo</span><div class="samples" style="margin-top:10px">${Object.keys(TYPES).map(k=>`<button data-act="sample" data-k="${k}" class="${D.type===k&&!D.img?'on':''}">${scene(k).replace('<svg','<svg class="ph" style="aspect-ratio:4/3;height:auto"')}<span>${TYPES[k].t}</span></button>`).join('')}</div></div>
   <div class="bar"><div style="display:flex;gap:4px;align-items:center">${cancel}</div><button class="btn primary" data-act="next" ${picked?'':'disabled'}>Continue to location</button></div>`}
  if(st===2){const g=D.x!=null?geo(D.x,D.y):null;body=`<div><h2 style="font-size:30px">Where is it?</h2><p class="muted" style="margin-top:8px">Tap the map to place the pin, or use a sample location.</p></div>
   <div style="border-radius:18px;overflow:hidden;border:1px solid var(--line)">${mapSVG({click:true,draft:D.x!=null?{x:D.x,y:D.y}:null})}</div>
   <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn ghost sm" data-act="locate">${ic('locate',16)} ${D.locating?'Finding a spot…':'Use my location'}</button><span class="small ${g?'':'faint'}">${g?`${ic('pin',14)} ${brgyAt(D.x,D.y)} · ${g.lat}, ${g.lng}`:'No location selected'}</span>${g?`<button class="linkbtn" style="padding:4px 6px;font-size:13px" data-act="clearpin">Clear pin</button>`:''}</div>
   <div class="bar"><div style="display:flex;gap:4px;align-items:center"><button class="btn ghost" data-act="back">Back</button>${cancel}</div><button class="btn primary" data-act="next" ${D.x!=null?'':'disabled'}>Continue to details</button></div>`}
  if(st===3){body=`<div><h2 style="font-size:30px">Add a short note</h2><p class="muted" style="margin-top:8px">Optional. Say what you see and who could be affected.</p></div>
   <div class="field"><label for="desc">Description</label><textarea id="desc" maxlength="240" placeholder="Example: Large tree leaning toward houses on the left side of the road.">${esc(D.desc)}</textarea><span class="faint small" id="cnt" style="text-align:right">${D.desc.length}/240</span></div>
   <div><span class="lab">Quick additions</span><div class="chips" style="margin-top:8px">${PHRASES.map(t=>`<button class="chip ${D.desc.includes(t+'.')?'on':''}" data-act="tag" data-t="${t}" aria-pressed="${D.desc.includes(t+'.')}">${t}</button>`).join('')}</div></div>
   <div class="bar"><div style="display:flex;gap:4px;align-items:center"><button class="btn ghost" data-act="back">Back</button>${cancel}</div><button class="btn primary" data-act="next">${ic('spark',16)} Generate demo assessment</button></div>`}
  if(st===4){const a=D.res;body=`<div><h2 style="font-size:30px">Review and send</h2><p class="muted" style="margin-top:8px">${D.scan?'Preparing a sample assessment.':'This is a demo result. An admin will verify the report.'}</p></div>
   <div class="scanwrap ${D.scan?'on':''}">${photo({type:D.type||a?.t||'road',img:D.img})}</div>
   ${D.scan?`<div class="note">${ic('spark',16)}<span>Demo mode: no image analysis happens in this prototype. A sample result is being generated.</span></div>`:`<div class="aibox"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span class="k">AI-assisted risk assessment (demo result)</span>${lvB(a.lv)}</div>
    <dl class="kv"><div><dt>Category</dt><dd>${a.c}</dd></div><div><dt>Possible risk</dt><dd>${TYPES[a.t].t}</dd></div><div><dt>Reason</dt><dd>${a.reason}</dd></div><div><dt>Location</dt><dd>${brgyAt(D.x,D.y)}</dd></div></dl><div class="meter ${a.lv}"><i></i><i></i><i></i></div></div>
    <div class="note">${ic('shield',16)}<span>Demo only. This result comes from sample rules, not from your photo. An admin will review the report before it is verified.</span></div>`}
   ${D.scan?'':connNote()}
   <div class="bar"><div style="display:flex;gap:4px;align-items:center"><button class="btn ghost" data-act="back">Back</button>${cancel}</div><button class="btn primary" data-act="submit" ${D.scan||D.sending?'disabled':''}>${D.sending?'Sending…':isOnline()?'Send report':'Save on this device'}</button></div>`}
  return head+`<div class="glass panel">${body}</div>`}
function pageReport(){return `<div class="wrap"><div class="ph-head"><div><h1 style="font-size:clamp(34px,4.6vw,56px)">Report a risk</h1><p class="lead">Four quick steps. It takes about a minute.</p></div>${netBox()}</div>
  <div class="wiz"><div id="wizMain">${wizBody()}</div><div id="wizSide">${wizSide()}</div></div></div>`}
function wizRender(){const m=$('#wizMain');if(!m)return;m.innerHTML=wizBody();$('#wizSide').innerHTML=D.done?'':wizSide();
  const f=$('#file');if(f){f.onchange=()=>{handleFile(f.files[0]);f.value=''}}
  const dz=$('.drop');if(dz){dz.ondragover=e=>e.preventDefault();dz.ondrop=e=>{e.preventDefault();handleFile(e.dataTransfer.files[0])}}}
/* Local photo only (DEMO). The picked image is resized in the browser and kept as a data URL on the draft,
   then stored on the report so Track Report and Admin detail show the SAME photo.
   TODO(backend): upload the original File to storage (e.g. S3 / Supabase) and save the returned URL instead. */
const PHOTO_OK=['image/jpeg','image/png','image/webp'];
function handleFile(fl){if(!fl)return;
  const extOk=/\.(jpe?g|png|webp)$/i.test(fl.name||'');
  if(!(PHOTO_OK.includes(fl.type)||(!fl.type&&extOk))){toast('Please choose a JPG, PNG or WEBP photo');return}
  if(fl.size>10*1024*1024){toast('That photo is larger than 10 MB');return}
  const rdr=new FileReader();
  rdr.onerror=()=>toast('Could not read that file. Please try another photo.');
  rdr.onload=()=>{const im=new Image();
    im.onload=()=>{const k=Math.min(1,1000/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*k));c.height=Math.max(1,Math.round(im.height*k));
      const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);
      D.img=c.toDataURL('image/jpeg',.8);D.fname=fl.name;D.type=null;wizRender()};
    im.onerror=()=>toast('Could not read that photo. Try a JPG, PNG or WEBP.');im.src=rdr.result};
  rdr.readAsDataURL(fl)}
async function runAnalysis(){const my=++D.run;D.scan=true;D.res=null;wizRender();
  try{const res=await API.analyzeReport(D);if(my!==D.run)return;D.res=res}catch(e){if(my!==D.run)return;toast('Demo assessment failed. Please try again.');D.step=3;D.scan=false;wizRender();return}
  D.scan=false;if(D.step===4)wizRender()}
async function sendReport(){if(D.sending||!D.res)return;D.sending=true;wizRender();
  try{const off=!isOnline();const r=await API.submitReport(D,D.res,{offline:off});
    try{await Promise.all([loadReports(),loadQueue()])}catch(refreshErr){ // the report IS saved: only refreshing the lists failed
      if(!r.sync&&!R.some(x=>x.id===r.id))R.unshift(r)}
    D.done=findReport(r.id)||r;D.sending=false;wizRender();scrollTo({top:0});toast(off?'Saved on this device (demo)':(API.mode==='server'?'Report sent to the server':'Report submitted (demo)'));if(API.lastWarning){toast(API.lastWarning);API.lastWarning=null}}
  catch(e){D.sending=false;wizRender();toast((e&&e.userMessage)||'Could not send the report. Please try again.')}}

/* ---- Risk map ---- */
function filtered(){const f=F();return R.filter(r=>(f.lv==='all'||r.lv===f.lv)&&(f.cat==='all'||cat(r)===f.cat)&&(f.st==='all'||r.st===f.st)&&(!f.q||(r.id+' '+title(r)+' '+r.brgy+' '+r.desc).toLowerCase().includes(f.q.toLowerCase())))}
const isFiltered=()=>{const f=F();return f.lv!=='all'||f.cat!=='all'||f.st!=='all'||!!f.q}
function detail(r,admin){if(!r)return `<div class="hint">${ic('pin',30)}<b style="color:var(--ink2)">Select a pin</b><span>Tap a marker to see the photo, AI assessment and status.</span></div>`;
  return `${photo(r)}<div><div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><h3>${title(r)}</h3><span class="id">${r.id}</span></div><p class="muted small" style="margin-top:4px">${r.brgy}, submitted ${r.date}</p></div>
  <p class="small">${esc(r.desc)}</p><dl class="kv"><div><dt>AI category</dt><dd>${cat(r)}</dd></div><div><dt>AI risk level</dt><dd>${lvB(r.lv)}</dd></div><div><dt>Status</dt><dd>${stB(r.st)}</dd></div></dl>${prog(r)}
  <a class="btn ${admin?'primary':'ghost'} sm" href="#/${admin?'admin/report/':'track/'}${r.id}" style="justify-content:center">${admin?'Open review':'View report'}</a>`}
function mapStage(){const L=filtered(),heat=S.mapView==='heat';return `<div class="glass mapbox" data-ctx="map">${heat?HEAT_LEGEND:`<div class="legend"><span><i style="background:var(--hi)"></i>High</span><span><i style="background:var(--mod)"></i>Moderate</span><span><i style="background:var(--lo)"></i>Low</span></div>`}${mapSVG({list:L,sel:S.sel,heat:heat?{hot:S.hot}:null})}${L.length?'':R.length?`<div class="mapempty glass"><b>No reports match these filters</b><button class="btn ghost sm" data-act="clear">Clear filters</button></div>`:`<div class="mapempty glass"><b>No reports yet</b><a class="btn ghost sm" href="#/report">Report a risk</a></div>`}<div class="mapcap"><span>Boundary, roads, stream and campus from OpenStreetMap.</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div></div>`}
function pageMap(admin){
  const f=F(),L=filtered(),r=R.find(x=>x.id===S.sel),heat=S.mapView==='heat';
  const seg=`<div class="seg" role="group" aria-label="Map view"><button data-act="view" data-v="markers" aria-pressed="${!heat}" class="${!heat?'on':''}">${ic('pin',15)} Markers</button><button data-act="view" data-v="heat" aria-pressed="${heat}" class="${heat?'on':''}">${ic('layers',15)} Heatmap</button></div>`;
  const sel=(k,opts,lab)=>`<select data-f="${k}" aria-label="${lab}"><option value="all">${lab}: all</option>${opts.map(o=>`<option ${f[k]===o?'selected':''} value="${o}">${o}</option>`).join('')}</select>`;
  const head=admin?`<div class="ph-head" style="padding-top:8px"><div><h1 style="font-size:clamp(32px,4vw,48px)">Risk map</h1><p class="muted">Where verified and pending risks are concentrated.</p></div></div>`:`<div class="ph-head"><div><h1 style="font-size:clamp(34px,4.6vw,56px)">Community risk map</h1><p class="lead">Brgy. Alangilan, Batangas City. Every pin is a reported risk, and color shows the AI-suggested level, confirmed or changed by an admin.</p></div></div>`;
  const body=`<div class="mapbar">${seg}<div class="chips">${['all','hi','mod','lo'].map(k=>`<button class="chip ${f.lv===k?'on':''}" data-f="lv" data-v="${k}">${k==='all'?'All levels':LV[k]}</button>`).join('')}</div>${sel('cat',CATS,'Category')}${sel('st',STS,'Status')}<span class="muted small" id="mcount" style="margin-left:auto">${L.length} of ${R.length} shown</span></div>
  <div class="maplay"><div id="mstage">${mapStage()}</div><aside class="glass detail" id="mdetail" data-admin="${admin?1:0}">${heat?heatSummary(L):detail(r&&L.includes(r)?r:null,admin)}</aside></div>`;
  return admin?head+body:`<div class="wrap">${head}${body}</div>`}
function refreshMap(){const admin=$('#mdetail')?.dataset.admin==='1',L=filtered();if(S.sel&&!L.find(r=>r.id===S.sel))S.sel=null;
  $('#mstage').innerHTML=mapStage();$('#mcount').textContent=`${L.length} of ${R.length} shown`;$('#mdetail').innerHTML=S.mapView==='heat'?heatSummary(L):detail(R.find(r=>r.id===S.sel),admin);
  document.querySelectorAll('.chip[data-f]').forEach(c=>c.classList.toggle('on',c.dataset.v===F().lv));
  document.querySelectorAll('.seg [data-v]').forEach(b=>{const on=b.dataset.v===S.mapView;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)})}

/* ---- My reports / Track ---- */
/* My reports. Server mode: the list comes from GET /api/reports?mine=1 (see loadMyReports) and shows loading and error states. */
function pageMine(){const L=myReports(),server=API.mode==='server',st=server?S.mine.state:'ready';
  let inner,wrap='';
  if(st==='idle'||st==='loading')inner=`<div class="hint" role="status" aria-live="polite" aria-busy="true"><b>Loading your reports…</b><span>Checking the server for the reports sent from this device.</span></div>`;
  else if(st==='error')inner=`<div class="hint" role="alert"><b>Couldn't load your reports</b><span>${esc(S.mine.message)}</span><button class="btn primary" data-act="retry-mine">Try again</button></div>`;
  else if(L.length){wrap='mine-list';inner=L.map(r=>`<div class="rrow mine-row" data-go="#/track/${r.id}" style="grid-template-columns:84px 1.4fr 1.2fr auto">${photo(r)}<div><h3>${title(r)}</h3><span class="muted small meta-d">${r.id}, ${r.brgy}, ${r.date}</span><dl class="meta-m"><div><dt>Report ID</dt><dd>${r.id}</dd></div><div><dt>Location</dt><dd>${r.brgy}</dd></div><div><dt>Submitted</dt><dd>${r.date}</dd></div></dl></div>${isQueued(r)?syncProg(syncState(r)):prog(r)}<div class="mine-end" style="display:flex;gap:8px;align-items:center">${isQueued(r)?syncB(syncState(r)):stB(r.st)}<span class="chv">${ic('chev',16)}</span><span class="viewlink">View report ${ic('arrow',15)}</span></div></div>`).join('')}
  else inner=`<div class="hint"><b>No reports yet</b><span>Reports you send will show up here.</span><a class="btn primary" href="#/report">Report your first risk</a></div>`;
  return `<div class="wrap"><div class="ph-head"><div><h1 style="font-size:clamp(34px,4.6vw,56px)">My reports</h1><p class="lead">Follow what happens after you report a risk.</p></div><a class="btn primary" href="#/report">${ic('camera')} New report</a></div>
  <div class="glass ${wrap}" style="padding:8px 24px">${inner}</div></div>`}
async function loadMyReports(){
  S.mine={state:'loading',message:''};render(true);
  try{await loadMine();S.mine={state:'ready',message:''}}
  catch(e){S.mine={state:'error',message:(e&&e.userMessage)||'Something went wrong. Please try again.'}}
  if(location.hash.startsWith('#/mine'))render(true)}
function tlHTML(r){const todo=isQueued(r)?['Sync','Verified']:STS.slice(si(r)+1);return `<ol class="tl">${r.log.map(e=>`<li>${e.t}${e.n?`<small>“${esc(e.n)}”</small>`:''}<small>${e.d}</small></li>`).join('')}${todo.map(s=>`<li class="todo">${s==='Sync'?'Waiting to sync':s==='Verified'?'Admin verification':s==='Under monitoring'?'Monitoring':'Resolution'}<small>Not yet</small></li>`).join('')}</ol>`}
const coords=r=>{const g=geo(r.x,r.y);return `${r.brgy} · ${g.lat}, ${g.lng}`};
function pageTrack(id){const r=findReport(id);
  if(!r)return `<div class="wrap"><div class="glass" style="margin-top:46px"><div class="hint"><b>Report not found</b><span>It may have been removed when the demo data was reset.</span><a class="btn primary" href="#/mine">Back to My reports</a></div></div></div>`;
  return `<div class="wrap"><div class="ph-head"><div><div class="crumb"><a href="#/mine">My reports</a>${ic('chev',12)}<span>${r.id}</span></div><h1 style="font-size:clamp(32px,4.4vw,52px)">${title(r)}</h1><p class="lead">${r.brgy}, submitted ${r.date}</p></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${lvB(r.lv)}${isQueued(r)?syncB(syncState(r)):stB(r.st)}${isQueued(r)?'':`<button class="btn ghost sm" data-go="#/map" data-sel="${r.id}">${ic('map',15)} View on map</button>`}</div></div>
  <div class="review" style="padding-bottom:40px"><div class="glass" style="padding:14px;display:grid;gap:16px">${photo(r)}<p style="padding:0 6px">${esc(r.desc)}</p><div style="border-radius:16px;overflow:hidden;border:1px solid var(--line)">${mapSVG({list:[r],sel:r.id})}</div><p class="small muted" style="padding:0 6px">${coords(r)}</p></div>
  <div class="stack">${isQueued(r)?`<div class="glass box">${syncBox(r)}</div>`:''}<div class="glass box"><h3>Progress</h3>${tlHTML(r)}</div><div class="glass box"><h3>AI-assisted assessment (demo)</h3><dl class="kv"><div><dt>Category</dt><dd>${cat(r)}</dd></div><div><dt>Suggested level</dt><dd>${lvB(r.ai)}</dd></div><div><dt>Reason</dt><dd>${AI_REASON[r.type]}</dd></div></dl><div class="note" style="margin-top:14px">${ic('shield',16)}<span>Admins verify every report before it is treated as confirmed.</span></div></div></div></div></div>`}
