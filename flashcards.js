// Flashcard decks. Each card: front (prompt), back (answer + a danger/why).
window.FLASH_ORDER = ["foundations","pretest-repair","reliability","effective-agents","writing-tools"];
window.FLASH_DECKS = {
  "foundations": { title:"Foundations terms", emoji:"🔵", date:"2026-06-24",
    cards:[
      {front:"API", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> two programs talking — you send a request, you get a response.<br><b>Picture:</b> ordering at a counter — you ask, the kitchen hands it back.<br><b>Example:</b> your code asks the Claude API \"summarize this\" → it returns the summary.<br><b>Why:</b> every Claude app is just your code talking to the API.<br>⚠️ <b>Watch out:</b> the API key is secret — never put it in code.</div>"},
      {front:"JSON", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> a simple text way to write structured data.<br><b>Picture:</b> a labeled form — each field has a name and a value.<br><b>Example:</b> name = \"Dan\", score = 20, wrapped in curly braces { }.<br><b>Why:</b> it's how data moves in/out of the API — the language of tools &amp; structured output.<br>⚠️ <b>Watch out:</b> a missing comma/quote and it won't parse.</div>"},
      {front:"Schema", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> the rules for the shape of data — which fields, what type.<br><b>Picture:</b> a cookie cutter — data must fit the shape.<br><b>Example:</b> an invoice schema requires total (number), allows notes (text/empty).<br><b>Why:</b> makes output predictable + catches bad data.<br>⚠️ <b>Watch out:</b> too strict breaks on messy data; too loose lets junk through.</div>"},
      {front:"Context window", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> the model's short-term memory — how much text it holds at once.<br><b>Picture:</b> a desk that only fits so many papers — extras fall off.<br><b>Example:</b> paste a huge doc + long chat → the earliest text falls out of view.<br><b>Why:</b> if info falls out, the model forgets it.<br>⚠️ <b>Watch out:</b> overstuffing buries key facts (lost-in-the-middle).</div>"},
      {front:"Tool", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> an action you let the model call.<br><b>Picture:</b> giving someone a phone + calculator — now they can look things up.<br><b>Example:</b> a lookup_order tool lets Claude check a real order, not guess.<br><b>Why:</b> tools turn a chat model into an agent that can act.<br>⚠️ <b>Watch out:</b> vague descriptions → wrong tool / bad inputs.</div>"},
      {front:"Agent", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> model + tools + a LOOP (think → use tool → read result → repeat → finish).<br><b>Picture:</b> a worker who keeps going until the job's done.<br><b>Example:</b> a support agent checks an order, decides on a refund, escalates if needed.<br><b>Why:</b> Agentic is the biggest exam domain.<br>⚠️ <b>Watch out:</b> no stop rules → it can run away.</div>"},
      {front:"MCP", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> a standard plug connecting Claude to outside tools &amp; data.<br><b>Picture:</b> a USB port — anything that fits the standard plugs in.<br><b>Example:</b> an MCP server exposes a doc catalog + a search_docs tool.<br><b>Why:</b> how teams give Claude safe, reusable access to real systems.<br>⚠️ <b>Watch out:</b> don't mix its 3 parts — tools (actions), resources (read-only), prompts (workflows).</div>"},
      {front:"Prompt", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> the instruction you give the model.<br><b>Picture:</b> a recipe — clear steps = good dish; vague = a mess.<br><b>Example:</b> \"Extract the invoice total as JSON. If missing, return null.\"<br><b>Why:</b> prompts shape behavior, output format, error handling.<br>⚠️ <b>Watch out:</b> prompt-only rules aren't enough for safety-critical — use code/hooks.</div>"},
      {front:"Resource (MCP)", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> read-only context exposed by MCP (docs, catalogs, lists).<br><b>Picture:</b> a reference shelf — you read it, you don't change it.<br><b>Example:</b> a refund-policy resource lets Claude read the current policy.<br><b>Why:</b> gives Claude trusted context without messy searching.<br>⚠️ <b>Watch out:</b> don't use a tool (an action) when a read-only resource fits.</div>"},
      {front:"Provenance", back:"<div style='text-align:left;font-size:.82em;line-height:1.55'><b>Plain:</b> tracking where each fact/claim came from.<br><b>Picture:</b> a receipt — proof of where something came from.<br><b>Example:</b> \"refund policy allows 30 days\" → source: refund-policy.md (2026-06-01).<br><b>Why:</b> production systems need source tracking so humans can audit.<br>⚠️ <b>Watch out:</b> no source = sounds confident but can't be verified.</div>"}
    ]},
  "pretest-repair": { title:"Pre-Test repair", emoji:"🩹", date:"2026-06-24",
    cards:[
      {front:"What turns a chat model into an agent?", back:"Tools + a <b>LOOP</b> (acting on results). JSON is just data, not the ability to act."},
      {front:"Why are nullable fields useful in extraction?", back:"They let the model say \"not present\" <b>without fabricating</b> a value."},
      {front:"A required fact is missing from the source — what should happen?", back:"<b>Mark it missing</b> or route to a human. Never invent it."},
      {front:"What is prompt chaining?", back:"Breaking a task into <b>sequential steps</b>, each using the previous output."},
      {front:"Best error info so Claude can recover from a timeout?", back:"Return <code>is_error: true</code> with a clear message. (There is no real \"isRetryable\" field — that's exam-prep wording.)"},
      {front:"What are path-specific rules for?", back:"Loading <b>different conventions for different file areas</b> of a project."},
      {front:"Why are fixed iteration caps a weak PRIMARY stop method?", back:"They may stop too early/late without understanding task state. Check <code>stop_reason</code> instead."},
      {front:"When enforce a rule in code, not just the prompt?", back:"When <b>deterministic compliance</b> is required (safety-critical) — use hooks / app gates."},
      {front:"Risk of long conversations with many verbose tool results?", back:"Important info gets <b>buried / pushed out of context</b> (lost-in-the-middle)."},
      {front:"When is batch processing a good fit?", back:"Work that can <b>tolerate delayed results</b> (not urgent / not live)."},
      {front:"Good multi-pass code-review pattern?", back:"File-by-file local review, <b>then</b> a cross-file integration pass."}
    ]},
  "reliability": { title:"Reliability (your weak spot)", emoji:"🟢", date:"2026-06-24",
    cards:[
      {front:"Provenance", back:"Tracking the source of every claim — so humans can audit answers."},
      {front:"Human-in-the-loop review is for…", back:"Routing <b>uncertain / risky / policy-sensitive</b> cases to a person."},
      {front:"Lost-in-the-middle", back:"Important info buried in a long context gets <b>overlooked</b> — prune/summarise."},
      {front:"Most robust way to verify an agent's work?", back:"<b>Rule/code-based checks</b> (tests, types, linters) &gt; visual &gt; LLM-judge (least robust)."},
      {front:"Batch vs real-time — pick batch when…", back:"Results can wait (cheaper). Real-time for live/blocking steps."}
    ]},
  "effective-agents": { title:"Building effective agents", emoji:"🧩", date:"2026-07-02",
    cards:[
      {front:"Workflow vs agent — what's the real difference?", back:"<b>Workflow:</b> LLMs + tools follow a path YOUR CODE predefined. <b>Agent:</b> the LLM <b>dynamically directs its own</b> process and tool use. You drew the map vs it holds the map."},
      {front:"What is the augmented LLM?", back:"The basic building block: an LLM + <b>retrieval + tools + memory</b>. Every workflow pattern assumes each call has these. It's the <b>engine</b> — the patterns are circuit designs wired around it."},
      {front:"What is a GATE in prompt chaining?", back:"A <b>programmatic check between steps</b>: output 1 (e.g. an outline) only moves on to step 2 (write the doc) if it passes criteria — otherwise revise/regenerate. Code decides, not vibes."},
      {front:"Prompt chaining — when and why?", back:"Task splits into <b>fixed sequential subtasks</b>; each call gets one easy job. Trades latency for accuracy. Ex: copy → translate; outline → gate → document."},
      {front:"Routing — when and why?", back:"<b>Classify the input, send it to a specialized path</b> (own prompt/tools/model). Ex: refund vs tech-support tickets; easy queries → Haiku (cheap), hard → Sonnet."},
      {front:"Parallelization — the two flavors?", back:"<b>Sectioning:</b> independent subtasks at once (one answers, another screens safety). <b>Voting:</b> same task several times, compare (multiple reviewers flag vulnerabilities)."},
      {front:"Orchestrator-workers vs parallelization?", back:"Looks similar, but subtasks are <b>NOT predefined</b> — the orchestrator LLM decides them per input, delegates to workers, synthesizes. Ex: coding across many files; multi-source research."},
      {front:"Evaluator-optimizer — when is it a good fit?", back:"One LLM generates, another <b>critiques in a loop</b>. Fit when there are clear criteria AND iteration measurably helps. Ex: literary translation critique; repeated search rounds."},
      {front:"When should you NOT build an agent?", back:"When something simpler works: <b>one optimized call + retrieval + examples is usually enough</b>. Agents trade latency + cost for performance — only pay when needed."},
      {front:"What is a framework, and what's the tradeoff?", back:"<b>Your definition:</b> a reusable set of code and rules that makes common tasks easier in a standard way. <b>Tradeoff:</b> abstraction layers hide prompts/tools/errors — start with raw API calls; open the box before trusting it."},
      {front:"What is retrieval?", back:"The model <b>looking things up in an outside source</b> (docs, database, search) and reading the results before answering — one of the 3 augmentations (retrieval + tools + memory). No retrieval = only stale training data."},
      {front:"What is the aggregator (in voting)?", back:"The <b>CODE step that merges parallel answers into one result</b> — majority vote, a threshold (\"flag if ≥2 of 3 say unsafe\"), or a combined report. Voting without an aggregator decides nothing."},
      {front:"⚠️ CLASSIC MISTAKE: \"orchestrator = advanced parallelization\"?", back:"<b>No — different patterns.</b> Parallelization: your code runs <b>KNOWN</b> subtasks side-by-side. Orchestrator-workers: the LLM <b>DECIDES</b> the subtasks per input, then delegates (maybe in parallel). Fixed menu + 3 cooks vs a head chef who invents the dishes."}
    ]},
  "writing-tools": { title:"Writing tools for agents", emoji:"🔧", date:"2026-07-02",
    cards:[
      {front:"How is a tool different from a normal function?", back:"A function serves <b>deterministic code</b>; a tool serves a <b>non-deterministic AGENT</b> — it's a contract that must be clear enough for a model to use correctly."},
      {front:"How do you prototype a tool before trusting it?", back:"Build a quick version, let a <b>real agent use it</b>, read the transcripts for confusion/misuse, then iterate."},
      {front:"What makes a GOOD evaluation task for a tool?", back:"<b>Realistic, multi-step tasks</b> drawn from real usage — not toy one-shot checks."},
      {front:"Why consolidate several API calls into ONE tool?", back:"Fewer round-trips + less context noise. One purpose-built tool (find availability AND book it) beats chaining thin API wrappers."},
      {front:"What is namespacing (tools) and why does it matter?", back:"Clear prefixes/grouping — <code>asana_search</code> vs <code>jira_search</code> — so the agent picks the <b>right</b> tool among many similar ones."},
      {front:"What should a tool RETURN — raw data or something else?", back:"<b>High-signal context</b>: names, labels, summaries the agent needs — not a raw dump of IDs and 40 fields."},
      {front:"How do you keep tool responses token-efficient?", back:"Pagination, filtering, truncation with sensible defaults — protect the context window from monster responses."},
      {front:"Why do small wording changes in a tool description matter?", back:"The description <b>IS prompt engineering</b> — write it like a great docstring for a junior dev; clarity changes agent accuracy massively."}
    ]}
};
