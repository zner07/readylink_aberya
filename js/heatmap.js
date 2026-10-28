/* Community risk heatmap (UI).

   Draws a heat layer ON TOP of the existing map (same boundary, roads and report coordinates).
   It is calculated in the browser from the reports currently in view. There is no separate
   heatmap data source, and the reports themselves are demo data, so every heatmap surface is
   labeled "Demo data".

   TODO(backend): if hotspots should be computed on the server (clustering / density), replace
   hotspots() with an API call that returns the same shape. */
const HEAT_R=100;        // blob radius in map units (about 235 m)
const HEAT_LINK=150;     // reports closer than this belong to the same hotspot (about 350 m)
const HEAT_W={hi:3,mod:2,lo:1};
const heatPath=()=>'M'+POLY.map(p=>p[0]+' '+p[1]).join('L')+'Z';

/* Group nearby reports into up to 3 hotspots (needs 2 or more reports each). */
function hotspots(list){
  let pool=list.slice();const out=[];
  while(out.length<3&&pool.length){
    let best=null;
    for(const a of pool){
      const near=pool.filter(b=>Math.hypot(a.x-b.x,a.y-b.y)<=HEAT_LINK);
      const score=near.reduce((s,b)=>s+HEAT_W[b.lv],0);
      if(!best||score>best.score)best={near,score};
    }
    if(best.near.length<2)break;
    const sw=best.score,x=best.near.reduce((s,b)=>s+b.x*HEAT_W[b.lv],0)/sw,y=best.near.reduce((s,b)=>s+b.y*HEAT_W[b.lv],0)/sw;
    const cats={};best.near.forEach(b=>{const c=cat(b);cats[c]=(cats[c]||0)+1});
    out.push({x,y,count:best.near.length,cats,ids:best.near.map(b=>b.id)});
    pool=pool.filter(b=>!best.near.includes(b));
  }
  return out;
}

/* SVG added over the base map when the Heatmap view is on. */
function heatLayer(list,hot){
  const hs=hotspots(list);
  const g=(id,o)=>`<radialGradient id="${id}"><stop offset="0" style="stop-color:var(--hi);stop-opacity:${o}"/><stop offset=".42" style="stop-color:var(--mod);stop-opacity:${o*.52}"/><stop offset="1" style="stop-color:var(--mod);stop-opacity:0"/></radialGradient>`;
  const defs=`<defs><clipPath id="heatclip"><path d="${heatPath()}"/></clipPath>${g('hgH',.82)}${g('hgM',.58)}${g('hgL',.36)}</defs>`;
  const blobs=list.map(r=>`<circle cx="${r.x}" cy="${r.y}" r="${HEAT_R}" fill="url(#hg${r.lv==='hi'?'H':r.lv==='mod'?'M':'L'})"/>`).join('');
  const dots=list.map(r=>`<circle cx="${r.x}" cy="${r.y}" r="3.2" fill="var(--ink)" opacity=".55"/>`).join('');
  const ring=hot!=null&&hs[hot]?`<circle cx="${hs[hot].x}" cy="${hs[hot].y}" r="${HEAT_LINK*.72}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="6 6" opacity=".6"/>`:'';
  const badges=hs.map((h,i)=>`<g class="hsb ${hot===i?'sel':''}" data-act="hot" data-i="${i}" transform="translate(${h.x.toFixed(0)} ${h.y.toFixed(0)})" tabindex="0" role="button" aria-label="Hotspot ${i+1}, ${h.count} reports"><circle r="13"/><text y="4.6">${i+1}</text></g>`).join('');
  return `${defs}<g clip-path="url(#heatclip)">${blobs}</g>${dots}${ring}${badges}`;
}

const HEAT_LEGEND=`<div class="legend"><span>Fewer reports</span><i class="hgrad"></i><span>More reports</span><span class="demotag">Demo data</span></div>`;

/* Side panel shown instead of the report detail while the Heatmap view is on. */
function heatSummary(list){
  const hs=hotspots(list),high=list.filter(r=>r.lv==='hi').length;
  const cats=CATS.map(c=>[c,list.filter(r=>cat(r)===c).length]).filter(x=>x[1]).sort((a,b)=>b[1]-a[1]);
  const mx=cats.length?cats[0][1]:1;
  const names=h=>Object.entries(h.cats).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]).join(' and ');
  return `<div class="hs"><div class="hs-head"><h3>Hotspot summary</h3><span class="demotag" style="margin:0">Demo data</span></div>
  <p class="small muted">Based on the sample reports in this prototype. It is not a real analysis.</p>
  <dl class="kv"><div><dt>Reports in view</dt><dd>${list.length}</dd></div><div><dt>High risk</dt><dd>${high}</dd></div><div><dt>Hotspots</dt><dd>${hs.length||'None yet'}</dd></div></dl>
  <div><span class="lab">Common hazard categories</span><div class="hbar" style="margin-top:10px">${cats.slice(0,4).map(([c,k])=>`<div><span><b>${c}</b><span class="muted">${k}</span></span><i><b style="width:${k/mx*100}%"></b></i></div>`).join('')||'<span class="faint small">No reports in view</span>'}</div></div>
  <div><span class="lab">Hotspots</span><div class="hs-list">${hs.map((h,i)=>`<button class="hs-item ${S.hot===i?'on':''}" data-act="hot" data-i="${i}"><span class="hs-n">${i+1}</span><span><b>${h.count} reports nearby</b><small>${names(h)}</small></span></button>`).join('')||'<span class="faint small">Reports are spread out. No group of 2 or more nearby reports yet.</span>'}</div></div></div>`;
}
