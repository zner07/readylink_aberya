/* DEMO INSIGHTS DATA (sample only).

   Used by the admin "Reports to prioritize" section.
   These entries are written BY HAND for the prototype. They are NOT produced by an AI model.
   The UI labels this section "Demo data" everywhere it is shown.

   Shape: { id: report id, level: 'hi' | 'mod' | 'lo', reason: short explanation }

   TODO(ai): delete this file and make API.getPriorityQueue() (js/api.js) call the real
   prioritization service. Keep the returned shape above and the admin UI will keep working.
   Entries whose report is missing or already Resolved are skipped by the UI. */
const DEMO_PRIORITY=[
  {id:'RL-026',level:'hi', reason:'A loose wire hangs over a footpath and the report has not been reviewed yet.'},
  {id:'RL-023',level:'hi', reason:'Low ground beside the stream where water reaches the road quickly.'},
  {id:'RL-028',level:'hi', reason:'Cracks above four homes. It is already monitored, so check whether they are growing.'},
  {id:'RL-024',level:'mod',reason:'A leaning tree beside houses, still waiting for review.'},
  {id:'RL-030',level:'mod',reason:'A bulging retaining wall beside the court. Not yet reviewed.'},
  {id:'RL-027',level:'mod',reason:'A blocked drain near the school may flood the road in heavy rain.'}
];
