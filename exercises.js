/* CCA-F build exercises — the exercise lives IN the site, you do it IN the site.
   Each step card has its OWN answer box right under it (no hunting for where to type).
   Two finish buttons: 🧠 instant check (copy → any AI chat) and 📤 report (copy → Claude Code).
   APPEND new exercises, never reorder — ids keep saved answers stable.
   Used by: exercise.html (picker + runner), curriculum.html (unit links), today.html (Build step). */
var EXERCISES=[
{
 id:"gate-chain",
 units:["o1","m3"],
 icon:"🚦",
 title:"Flashcard Factory — a prompt chain with a gate",
 mins:"~25 min",
 level:"Beginner · no code",
 goal:"Run a 3-step pipeline BY HAND: draft → gate → route (pass / revise / fallback). You are the pipeline — each AI chat is one step.",
 why:"Prompt chaining + gates is the workflow pattern from your current unit, and the exam loves asking WHO decides what happens next (your rules, not the model).",
 steps:[
  {h:"How it works",
   body:"You'll run <b>two separate AI chats</b> — one per pipeline step. <b>Each step gets its OWN new chat</b>, because in a real chain every step is a separate call that only sees what you pass it. ⚠️ If you use an AI browser sidebar (like Comet), it can also see this page — that's fine, but always start a <b>fresh chat</b> per step so the gate can't peek at the drafter's conversation. Type your results into the box under each step — they save as you type."},
  {h:"Step 1 — the DRAFTER (call #1)",
   body:"Open a <b>new chat</b> and paste this. Then paste the 3 cards it gives you into the box below (if you revise later in Step 3, update this box to the final version).",
   prompt:"You are Step 1 of a pipeline. Topic: \"retrieval (in AI agents)\". Write exactly 3 flashcards as plain text — for each one write FRONT: ... and BACK: ... Output only the 3 cards, nothing else.",
   pl:"📋 Copy the drafter prompt",
   field:{id:"cards", label:"Your 3 cards (final version)", ph:"FRONT: ...\nBACK: ..."}},
  {h:"Step 2 — the GATE (call #2)",
   body:"Open <b>another new chat</b> (a gate never trusts the drafter's chat). Paste this, then paste your 3 cards under it. Write the verdict below.",
   prompt:"You are a GATE in a pipeline. Check the 3 flashcards I paste below against these rules: (1) every BACK is under 25 words, (2) every BACK contains a concrete example, (3) no card just repeats its FRONT in different words. Reply with exactly one word first — PASS or FAIL — then, if FAIL, list which card broke which rule. Here are the cards:",
   pl:"📋 Copy the gate prompt",
   field:{id:"verdict", label:"What the gate said (first round)", ph:"PASS / FAIL + which rules it named..."}},
  {h:"Step 3 — ROUTE the verdict (you are the pipeline code)",
   body:"<b>PASS</b> → the chain is done. <b>FAIL</b> → go back to the drafter chat, paste the revise message below + the gate's list, then run the gate AGAIN on the new cards. <b>FAIL twice</b> → fallback: keep the best card, drop the rest — a real pipeline must never loop forever. Log what happened below.",
   prompt:"REVISE: the gate failed some cards. Fix ONLY the failing cards and keep the passing ones exactly as they are. Here is the gate's report:",
   pl:"📋 Copy the revise message",
   field:{id:"route", label:"How many rounds? What did you do on a FAIL?", ph:"e.g. FAIL once → sent the revise message → PASS on round 2"}},
  {h:"Step 4 — say it out loud (60 sec)",
   body:"No notes: <i>&ldquo;A gate is a checkpoint between two calls. The pipeline's rules decide pass, revise or fallback — not the model.&rdquo;</i> Then write YOUR version below.",
   field:{id:"ownwords", label:"Your own words: what is a gate, and WHO decides the route?", ph:"A gate is..."}}
 ],
 quiz:{
  title:"🧠 Understanding check — answer these YOURSELF, in your own words",
  intro:"No AI for this part — that's the whole point. Short answers are fine. When you hit the green check button, your tutor grades these too.",
  questions:[
   {id:"q1", q:"In AI agents and RAG systems, what does \"retrieval\" do — what happens between the knowledge base and the model?", ph:"Retrieval is when..."},
   {id:"q2", q:"Why can many applications be solved with ONE augmented LLM call (with retrieval), instead of a full agent loop?", ph:"Because..."},
   {id:"q3", q:"In the draft → gate → route pipeline, what exact job does the GATE do between the draft and the routing decision?", ph:"The gate..."},
   {id:"q4", q:"Why put gates on the MIDDLE steps of a chain, instead of only checking the final answer at the very end?", ph:"Because if you only check at the end..."},
   {id:"q5", q:"In the Flashcard Factory: who decides pass / revise / fallback — the model, or the pipeline's rules? Why does that matter?", ph:"The ... decides, because..."}
  ]
 },
 rubric:[
  "There are exactly 3 flashcards about retrieval, each with a FRONT and a BACK.",
  "The gate verdict starts with PASS or FAIL and refers to the 3 rules (under 25 words, has an example, no repeating the front).",
  "The learner routed correctly: on FAIL they sent a revise message and re-ran the gate; they know the fallback rule (after 2 FAILs, keep the best card and stop).",
  "Their own-words definition says a gate is a checkpoint BETWEEN calls, and that the PIPELINE'S RULES decide pass/revise/fallback — not the model.",
  "Understanding check: q1 retrieval = search an external knowledge source and feed the relevant bits into the model's context before it answers; q2 one augmented call is enough when the task is a single bounded step — an agent loop only pays off for open-ended multi-step work; q3 the gate checks the draft against explicit rules and outputs a verdict the route step acts on; q4 gates on middle steps catch errors early, before they compound downstream and get expensive to trace; q5 the pipeline's rules (the human/code), NOT the model — that keeps control and debuggability.",
  "Bonus: they noticed each step was a separate chat = a separate call with its own context."
 ]
}
];
