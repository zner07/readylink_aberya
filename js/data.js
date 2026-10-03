/* Static constants: risk types, categories, levels, statuses, mock AI reasons, small lookups. */

const TYPES={tree:{t:'Leaning tree',c:'Environmental'},drain:{t:'Clogged drainage',c:'Flood'},road:{t:'Roadside crack',c:'Road Hazard'},pole:{t:'Damaged electrical pole',c:'Electrical'},flood:{t:'Flood-prone area',c:'Flood'},slope:{t:'Landslide-prone slope',c:'Environmental'},river:{t:'Eroded creek bank',c:'Flood'},wall:{t:'Cracked retaining wall',c:'Structural'}};
const CATS=['Structural','Environmental','Flood','Electrical','Road Hazard'];
const LV={hi:'High',mod:'Moderate',lo:'Low'};
const STS=['Pending','Verified','Under monitoring','Resolved'];
const BASE_LV={tree:'mod',drain:'mod',road:'lo',pole:'hi',flood:'hi',slope:'hi',river:'hi',wall:'mod'};
const AI_REASON={tree:'The tree appears to lean noticeably toward a nearby house.',drain:'Debris visibly blocks the drainage opening, which may cause water to pool during heavy rain.',road:'Visible cracking along the road edge suggests deterioration on a frequently used route.',pole:'Visible damage on the pole and loose wiring near a walkway may be a safety hazard.',flood:'Water marks and low ground suggest the area could be inundated during sustained rain.',slope:'Surface cracks and exposed soil on a steep slope above homes may indicate instability.',river:'The bank shows visible erosion that may undermine nearby structures.',wall:'Cracking and bulging on the wall suggest its structure may be compromised.'};

const cat=r=>TYPES[r.type].c, title=r=>TYPES[r.type].t, si=r=>STS.indexOf(r.st);
