// Question banks for the CCA-F checkpoint quizzes.
// Each question: q (text), opts (4 strings), ans (0-indexed correct), why (one-line teach).
window.QUIZ_ORDER = ["foundations","prompting","tools-mcp","claude-code","agentic","reliability"];
window.QUIZ_BANKS = {
  "foundations": { title:"Foundations check", emoji:"🔵", phase:"Phase 0",
    questions:[
      {q:"What does a schema describe?",opts:["The AI's memory","An API key","The expected shape and types of data","A chat history"],ans:2,why:"A schema = which fields exist and what type each is."},
      {q:"Why does the context window matter?",opts:["It sets the screen size","Bigger is always cheaper","It stores your API key","Anything beyond it can't be used — the model 'forgets' it"],ans:3,why:"If info falls outside the window, the model can't use it."},
      {q:"JSON is best described as…",opts:["A text format for structured data","A programming language","A database","An AI model"],ans:0,why:"JSON = simple text for structured data, like { \"a\": 1 }."},
      {q:"What turns a chat model into an 'agent'?",opts:["A bigger prompt","Calling tools in a loop and acting on the results","Using JSON","A faster API"],ans:1,why:"Agent = think → use tool → read result → repeat."},
      {q:"Where should an API key live?",opts:["In your README","Hard-coded in the file","Secret, in an environment variable","Printed to the logs"],ans:2,why:"Keys are secrets — env vars, never in code or logs."}
    ]},
  "prompting": { title:"Prompting & Structured Output check", emoji:"🟠", phase:"Phase 1",
    questions:[
      {q:"Few-shot prompting means…",opts:["Using fewer words","Giving examples of the behavior you want","One-word prompts","Removing instructions"],ans:1,why:"Show 2–5 examples of the output you want."},
      {q:"Most reliable way to get schema-valid JSON?",opts:["Ask nicely in the prompt","Lower temperature only","Retry 10 times","Use Structured Outputs (constrained decoding)"],ans:3,why:"Constrained decoding guarantees the shape — no luck needed."},
      {q:"A required fact is missing from the source. The system should…",opts:["Invent a plausible value","Mark it missing or route to a human","Retry forever","Delete the whole record"],ans:1,why:"Never fabricate — flag missing / send to review."},
      {q:"Why add explicit criteria to a review prompt?",opts:["To reduce vague or false-positive feedback","To make it slower","To hide errors","To add randomness"],ans:0,why:"Clear criteria = fewer false positives."},
      {q:"Prompt chaining is…",opts:["One giant prompt","Caching prompts","Sequential steps, each building on the last output","Running prompts in parallel"],ans:2,why:"Break a task into focused steps; trade latency for accuracy."}
    ]},
  "tools-mcp": { title:"Tools & MCP check", emoji:"🟣", phase:"Phase 2",
    questions:[
      {q:"The single biggest factor in tool-use performance is…",opts:["The tool's name length","The model temperature","Extremely detailed tool descriptions","The number of tools"],ans:2,why:"Good descriptions tell the model what/when/how to use a tool."},
      {q:"How do you return a tool error so Claude can recover?",opts:["Throw and crash","tool_result with is_error: true + a clear message","Return an empty string","Return a fake success"],ans:1,why:"Real mechanism = is_error (NOT 'isRetryable') + instructive text."},
      {q:"In MCP, a read-only data source for context is a…",opts:["Tool","Prompt","Transport","Resource"],ans:3,why:"Tools = actions, Resources = readable context, Prompts = workflows."},
      {q:"In MCP, who decides when a TOOL is used?",opts:["The model","The user","The application","The server admin"],ans:0,why:"Tools are model-controlled; prompts user-controlled; resources app-controlled."},
      {q:"Good reason to merge several tiny tools into one with an 'action' parameter?",opts:["To use more tokens","To reduce tool-choice ambiguity","To avoid writing descriptions","To hide errors"],ans:1,why:"Fewer, clearer tools = less wrong-tool confusion."}
    ]},
  "claude-code": { title:"Claude Code check", emoji:"🟠", phase:"Phase 3",
    questions:[
      {q:"CLAUDE.md is for…",opts:["Persistent project instructions and conventions","Storing API keys","A spreadsheet","Chat history"],ans:0,why:"It's re-loaded every request — durable project rules."},
      {q:"`claude -p` is useful for…",opts:["Printing images","Password reset","Non-interactive CLI use in automation (CI)","Model training"],ans:2,why:"Headless mode → scripts and pipelines."},
      {q:"Plan mode is most useful when…",opts:["Typing one obvious word","The task is complex with multiple valid approaches","Deleting files","Hiding context"],ans:1,why:"Plan first when there's more than one good path."},
      {q:"Does a subagent automatically get the parent's full conversation?",opts:["Yes, it inherits everything","Only if same model","Only with hooks","No — you must pass needed context in its prompt"],ans:3,why:"Fresh context window; the prompt is the only channel."},
      {q:"A rule that must ALWAYS hold (e.g., block big refunds) is best enforced by…",opts:["A polite prompt line","A hook or app-level gate (programmatic)","A bigger model","More examples"],ans:1,why:"Safety-critical = code/hooks/permissions, not just a prompt."}
    ]},
  "agentic": { title:"Agentic Architecture check", emoji:"🔴", phase:"Phase 4",
    questions:[
      {q:"What does an agent loop check to decide whether to keep going?",opts:["Output color","stop_reason","Word count","Filename"],ans:1,why:"Loop while stop_reason == 'tool_use'; exit otherwise."},
      {q:"stop_reason == 'tool_use' means…",opts:["The model is done","An error occurred","Run the requested tool and return a tool_result, then continue","Stop everything"],ans:2,why:"It's a contract: you run the tool and feed the result back."},
      {q:"Orchestrator-workers differs from simple parallelization because…",opts:["The orchestrator decides the subtasks dynamically","It's always faster","It uses no tools","It needs no prompts"],ans:0,why:"Parallelization = pre-defined subtasks; orchestrator = decided at runtime."},
      {q:"When is multi-agent a POOR fit?",opts:["Big parallelizable research","Tasks exceeding one context window","High-value tasks","Tightly-coupled tasks needing shared context"],ans:3,why:"Subagents can't coordinate mid-flight — dependencies hurt."},
      {q:"Why pass a subagent explicit context?",opts:["To make diagrams nicer","It runs in a fresh context and inherits nothing automatically","To disable its tools","To save money only"],ans:1,why:"Include file paths, errors, decisions in its prompt."}
    ]},
  "reliability": { title:"Context & Reliability check", emoji:"🟢", phase:"Phase 5",
    questions:[
      {q:"'Lost-in-the-middle' means…",opts:["The model crashes","JSON breaks","Important info buried in a long context gets overlooked","Tools fail"],ans:2,why:"Long contexts can bury key facts — prune/summarize."},
      {q:"Batch processing is a good fit when…",opts:["A live checkout step","Work can wait (delayed results are OK)","An emergency escalation","A blocking pre-merge gate"],ans:1,why:"Batch = cheaper, for non-urgent work."},
      {q:"Provenance means…",opts:["A model's name","A retry policy","A CSS style","Tracking where each claim/fact came from"],ans:3,why:"Know the source of every claim — trust + auditing."},
      {q:"Human-in-the-loop review is for…",opts:["Slowing everything down","Routing risky or uncertain cases to a person","Replacing automation","Avoiding schemas"],ans:1,why:"Send the uncertain/policy-sensitive cases to humans."},
      {q:"The most robust way to verify an agent's work is…",opts:["Clear rule/code-based checks (tests, types, linters)","Ask the model if it's sure","Trust it","Longer prompts"],ans:0,why:"Rules/code feedback > visual > LLM-judge (least robust)."}
    ]}
};
