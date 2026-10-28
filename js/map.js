/* Map helpers: point-in-boundary test, location label, lat/lng conversion, and mapSVG() which draws the map with pins. */

function inPoly(x,y){let c=false;for(let i=0,j=POLY.length-1;i<POLY.length;j=i++){const[a,b]=POLY[i],[p,q]=POLY[j];if((b>y)!==(q>y)&&x<(p-a)*(y-b)/(q-b)+a)c=!c}return c}
const brgyAt=()=>'Brgy. Alangilan';
const geo=(x,y)=>({lat:(GEO.la1-(y-GEO.oy)/GEO.s/GEO.ky).toFixed(5),lng:(GEO.lo0+(x-GEO.ox)/GEO.s/GEO.kx).toFixed(5)});

function mapSVG({list=[],sel=null,draft=null,click=false,heat=null}={}){
 const pins=heat?heatLayer(list,heat.hot):list.map((r,i)=>`<g class="pin ${r.lv} ${sel===r.id?'sel':''}" data-pin="${r.id}" transform="translate(${r.x} ${r.y})" tabindex="0" role="button"><title>${esc(title(r))} – ${LV[r.lv]}</title><g class="pi" style="--i:${i}"><circle class="halo" r="26"/><circle class="ring" r="17"/><circle class="dot" r="9"/></g></g>`).join('');
 const dp=draft?`<g class="dpin" transform="translate(${draft.x} ${draft.y})"><circle class="dh" r="28"/><circle class="dd" r="10"/></g>`:'';
 return `<svg class="map ${click?'pickable':''}" viewBox="0 0 1000 611" role="img" aria-label="Community risk map">${BASE}${pins}${dp}</svg>`}
