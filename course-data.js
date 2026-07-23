/* One inspectable source for study order, prerequisites, resources, builds, and concepts.
   Existing progress keys stay valid because original unit ids never change. */
(function(){
  var SK="https://anthropic.skilljar.com/";
  var units=[
    {
      id:"w1",level:"Foundation Workbench",title:"Files, folders, and plain text",
      one:"Know where a file lives, what its ending means, and which app edits it.",
      prereq:[],concepts:["file","folder","path","extension","plain-text"],exercise:"file-map",
      quiz:"quiz.html",notes:"foundation-lab.html?unit=w1",
      ask:"Teach me files, folders, paths, extensions, and plain text as a complete beginner. Use one Finder example, one boxes-and-arrows sketch, then make me point to each part of a path.",
      watch:[
        ["foundation-lab.html?unit=w1","Foundation Workbench | Files and folders","Focus: Finder, file endings, and why TextEdit must use plain text."],
        ["https://edu.gcfglobal.org/en/basic-computer-skills/understanding-file-extensions/1/","GCFGlobal | Understanding File Extensions","Focus: the ending tells you the file type; .json is not .txt."]
      ]
    },
    {
      id:"w2",level:"Foundation Workbench",title:"JSON by hand",
      one:"Build valid labeled data with braces, quotes, colons, and commas.",
      prereq:["w1"],concepts:["json-object","key","value","array","validation"],exercise:"json-card",
      quiz:"quiz.html",notes:"foundation-lab.html?unit=w2",
      ask:"Teach me JSON from zero. Show one tiny object, label every symbol, let me repair one broken example, then quiz me without showing the answer.",
      watch:[
        ["foundation-lab.html?unit=w2","Foundation Workbench | JSON by hand","Focus: key/value pairs and the four punctuation rules."],
        ["https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON","MDN | Working with JSON","Focus: JSON is text that carries structured data between programs."]
      ]
    },
    {
      id:"w3",level:"Foundation Workbench",title:"Programs, functions, and errors",
      one:"Follow input into a function, see an output, and read an error as a clue.",
      prereq:["w2"],concepts:["program","function","argument","return-value","error"],exercise:"function-machine",
      quiz:"quiz.html",notes:"foundation-lab.html?unit=w3",
      ask:"Teach me program, function, argument, return value, and error from zero. Use a toaster-like input-process-output example and one tiny pseudo-code function.",
      watch:[["foundation-lab.html?unit=w3","Foundation Workbench | Programs and functions","Focus: input -> named action -> output, and errors as useful messages."]]
    },
    {
      id:"w4",level:"Foundation Workbench",title:"API request and response",
      one:"See how one program asks another program for work and receives a result.",
      prereq:["w3"],concepts:["api","request","response","status","environment-variable"],exercise:"api-envelope",
      quiz:"quiz.html",notes:"foundation-lab.html?unit=w4",
      ask:"Teach me an API request and response from zero. Label the URL, headers, body, status, and response. Explain why API keys live in environment variables.",
      watch:[
        ["foundation-lab.html?unit=w4","Foundation Workbench | API request and response","Focus: request goes out, response comes back, secret stays outside the file."],
        [SK+"claude-platform-101","Anthropic Academy | Claude Platform 101","Focus: watch one Claude API request travel to the model and back."]
      ]
    },
    {
      id:"w5",level:"Foundation Workbench",title:"Safe Terminal basics",
      one:"Navigate, inspect, and validate without using risky commands.",
      prereq:["w4"],concepts:["terminal","command","working-directory","relative-path","exit-code"],exercise:"terminal-simulator",
      quiz:"quiz.html",notes:"foundation-lab.html?unit=w5",
      ask:"Teach me safe Terminal basics on a Mac. Explain pwd, ls, cd, cat, and exit codes. Do not ask me to delete, overwrite, or install anything.",
      watch:[["foundation-lab.html?unit=w5","Foundation Workbench | Safe Terminal basics","Focus: pwd tells where you are; ls looks; cd moves; validation checks safely."]]
    },
    {
      id:"a1",level:"Atoms",title:"Core vocabulary",
      one:"API, JSON, schema, token, context window, prompt, tool, and model.",
      prereq:["w5"],concepts:["schema","token","context-window","prompt","tool","model"],exercise:"vocabulary-flow",
      quiz:"quiz.html?set=foundations",notes:"notes.html?unit=a1",
      ask:"Quiz me on the 8 core CCA-F terms in plain words, one at a time. Ask me to give an example, not just repeat a definition.",
      watch:[[SK+"claude-101/383389","Claude 101 | Meet Claude","Focus: identify model, prompt, context, and response."],[SK+"claude-platform-101","Claude Platform 101","Focus: connect API, JSON, and model in one request."]]
    },
    {
      id:"m3",level:"Molecules",title:"Prompt techniques",
      one:"Write clear criteria, examples, output format, and small chains.",
      prereq:["a1"],concepts:["explicit-criteria","few-shot","output-format","prompt-chain"],exercise:"prompt-clinic",
      quiz:"quiz.html?set=prompting",notes:"notes.html?unit=m3",
      ask:"Teach me explicit criteria, few-shot examples, output format, and prompt chaining. Use one support-ticket example, then have me improve a vague prompt.",
      watch:[[SK+"claude-with-the-anthropic-api","Building with the Claude API | Prompting","Focus: compare a vague prompt with explicit criteria and examples."]]
    },
    {
      id:"m1",level:"Molecules",title:"A structured-output call",
      one:"Prompt plus schema produces validated JSON that still needs meaning checks.",
      prereq:["m3"],concepts:["required","nullable","enum","structured-output","semantic-validation"],exercise:"schema-lab",
      quiz:"quiz.html?set=prompting",notes:"notes.html?unit=m1",
      ask:"Teach me structured output with required, nullable, enum, validation, and retry. Show why schema-valid data can still be factually wrong.",
      watch:[[SK+"claude-with-the-anthropic-api","Building with the Claude API | Structured data","Focus: schema controls shape; application checks meaning."]]
    },
    {
      id:"m2",level:"Molecules",title:"One tool call",
      one:"Claude requests one action; the application runs it and returns a result.",
      prereq:["m1"],concepts:["tool-description","tool-use","tool-result","is-error","tool-choice"],exercise:"tool-call-envelope",
      quiz:"quiz.html?set=tools-mcp",notes:"notes.html?unit=m2",
      ask:"Teach me one complete tool call: definition -> tool_use -> application action -> tool_result -> final response. Label every handoff and show one error.",
      watch:[[SK+"claude-with-the-anthropic-api","Building with the Claude API | Tool use","Focus: the application, not Claude, runs the requested action."]]
    },
    {
      id:"o1",level:"Organisms",title:"The Agent Loop",
      one:"Model plus tools repeats until stop_reason says the turn is done.",
      prereq:["m2"],concepts:["agent-loop","stop-reason","tool-use-loop","guardrail","workflow-vs-agent"],exercise:"agent-loop-board",
      quiz:"quiz.html?set=agentic",notes:"notes.html?unit=o1",
      ask:"Teach me the agent loop: model -> tool request -> application -> tool result -> model. Cover stop_reason, runaway guards, and when one call is enough.",
      watch:[["article-effective-agents.html","Building effective agents | Visual article","Focus: workflow holds a fixed map; agent chooses its next step."],["https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons","Anthropic docs | Handling stop reasons","Focus: branch on the returned reason; tool_use requires a tool result."]]
    },
    {
      id:"a2",level:"Atoms",title:"Model physics and economics",
      one:"Pick the right model, cache stable prefixes, and batch work that can wait.",
      prereq:["o1"],concepts:["model-routing","latency","prompt-caching","batch-api","token-cost"],exercise:"model-router",
      quiz:"quiz.html?set=foundations",notes:"notes.html?unit=a2",
      ask:"Teach me model choice, token cost, latency, prompt caching, and batch versus real-time. Give me three jobs and make me choose.",
      watch:[["https://platform.claude.com/docs/en/about-claude/models/choosing-a-model","Anthropic docs | Choosing a model","Focus: match capability and cost to the job."],["https://platform.claude.com/docs/en/build-with-claude/prompt-caching","Anthropic docs | Prompt caching","Focus: stable prefix first."],["https://platform.claude.com/docs/en/build-with-claude/batch-processing","Anthropic docs | Batch processing","Focus: delayed bulk work can cost less."]]
    },
    {
      id:"d1",level:"Developer Bridge",title:"Repositories, trees, and diffs",
      one:"Read a project as a folder tree and inspect exactly what changed.",
      prereq:["a2"],concepts:["repository","file-tree","diff","added-line","removed-line"],exercise:"diff-reader",
      quiz:"quiz.html",notes:"foundation-lab.html?unit=d1",
      ask:"Teach me repository, file tree, and diff from zero. Show a three-line before-and-after diff and make me say what changed.",
      watch:[["foundation-lab.html?unit=d1","Developer Bridge | Repositories and diffs","Focus: a repository is a tracked project folder; a diff is the change, not the whole file."],["https://docs.github.com/en/get-started/start-your-journey/hello-world","GitHub | Hello World","Focus: repository and branch before commits and pull requests."]]
    },
    {
      id:"d2",level:"Developer Bridge",title:"Commits, pull requests, and CI",
      one:"Package a change, request review, and let automatic checks run.",
      prereq:["d1"],concepts:["branch","commit","pull-request","review","continuous-integration"],exercise:"pr-paper-sim",
      quiz:"quiz.html",notes:"foundation-lab.html?unit=d2",
      ask:"Teach me branch, commit, pull request, review, and CI from zero. Use one typo fix moving through the whole flow.",
      watch:[["foundation-lab.html?unit=d2","Developer Bridge | Commits, PRs, and CI","Focus: commit records a change; PR asks to merge it; CI checks it."],["https://github.com/skills/introduction-to-github","GitHub Skills | Introduction to GitHub","Focus: create branch -> commit -> pull request -> merge."]]
    },
    {
      id:"m4",level:"Molecules",title:"Built-in tools",
      one:"Choose Read, Write, Edit, Bash, Grep, or Glob for the job.",
      prereq:["d2"],concepts:["read-tool","edit-tool","grep","glob","bash-tool"],exercise:"tool-picker",
      quiz:"quiz.html?set=tools-mcp",notes:"notes.html?unit=m4",
      ask:"Teach me when to use Read, Write, Edit, Bash, Grep, and Glob. Give one file-tree task at a time and make me pick the safest tool.",
      watch:[[SK+"claude-code-101/469789","Claude Code 101 | How it works","Focus: watch Claude inspect before it edits."],[SK+"claude-code-in-action","Claude Code in Action","Focus: follow search -> read -> edit -> test."]]
    },
    {
      id:"o3",level:"Organisms",title:"An MCP server",
      one:"Expose actions, read-only data, and reusable workflows through a standard connection.",
      prereq:["m4"],concepts:["mcp","mcp-tool","mcp-resource","mcp-prompt","transport"],exercise:"mcp-menu",
      quiz:"quiz.html?set=tools-mcp",notes:"notes.html?unit=o3",
      ask:"Teach me MCP tools, resources, prompts, transports, scope, and secrets. Make me classify six capabilities.",
      watch:[[SK+"claude-code-101/469797","Claude Code 101 | MCP","Focus: see an MCP connection inside Claude Code."],[SK+"introduction-to-model-context-protocol","Introduction to MCP","Focus: tool is an action; resource is read-only context; prompt is user-chosen workflow."]]
    },
    {
      id:"o4",level:"Organisms",title:"Claude Code workflows",
      one:"Use project rules, skills, subagents, hooks, and headless runs deliberately.",
      prereq:["o3"],concepts:["claude-md","skill","subagent","hook","headless"],exercise:"claude-code-blueprint",
      quiz:"quiz.html?set=claude-code",notes:"notes.html?unit=o4",
      ask:"Teach me CLAUDE.md, skills, subagents, hooks, plan mode, and headless claude -p. Make me choose prompt versus hook for each rule.",
      watch:[[SK+"claude-code-101/469789","Claude Code 101 | How it works","Focus: project context and tool permissions."],[SK+"claude-code-101/469795","Claude Code 101 | CLAUDE.md","Focus: durable project instructions, not secrets."],[SK+"claude-code-in-action","Claude Code in Action","Focus: build, check, and revise a real change."]]
    },
    {
      id:"o2",level:"Organisms",title:"Orchestrator-Workers",
      one:"A coordinator chooses subtasks, passes context, and combines worker results.",
      prereq:["o4"],concepts:["orchestrator","worker","decomposition","context-passing","provenance"],exercise:"orchestrator-board",
      quiz:"quiz.html?set=agentic",notes:"notes.html?unit=o2",
      ask:"Teach me orchestrator-workers versus fixed parallelization. Show coordinator -> workers -> synthesis and the explicit context each worker needs.",
      watch:[[SK+"claude-code-101/469796","Claude Code 101 | Subagents","Focus: each subagent starts with fresh context."],["article-multi-agent.html","Multi-agent research | Visual article","Focus: coordinator delegates and synthesizes; workers do not chat directly."]]
    },
    {
      id:"rel",level:"Reliability Rail",title:"Reliability, context, and evals",
      one:"Design for failures, changing context, verification, and human review.",
      prereq:["o2"],concepts:["lost-in-middle","compaction","eval","retry","human-in-loop","provenance-conflict"],exercise:"reliability-lab",
      quiz:"quiz.html?set=reliability",notes:"notes.html?unit=rel",
      ask:"Teach me reliability deeply: context loss, compaction, RAG versus long context, retries, evals, provenance, guardrails, and human review. Use one failure at a time.",
      watch:[[SK+"claude-code-101/469793","Claude Code 101 | Context management","Focus: what survives and what gets summarized."],["https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents","Anthropic | Effective context engineering","Focus: keep the smallest high-signal context that supports the next decision."]]
    },
    {
      id:"t1",level:"Templates",title:"Support-agent system",
      one:"Combine tools, deterministic limits, normalization, and structured handoff.",
      prereq:["rel"],concepts:["support-agent","pre-tool-hook","post-tool-hook","escalation","handoff"],exercise:"support-blueprint",
      quiz:"quiz.html?set=agentic",notes:"notes.html?unit=t1",
      ask:"Walk me through a support agent with lookup, refund, deterministic refund limit, normalization, and human handoff. Ask me where each rule belongs.",
      watch:[[SK+"claude-code-101/469798","Claude Code 101 | Hooks","Focus: critical limits belong in deterministic code."],["article-effective-agents.html","Building effective agents | Visual article","Focus: choose the simplest pattern that works."]]
    },
    {
      id:"t2",level:"Templates",title:"Research multi-agent system",
      one:"Decompose, search, deduplicate, verify provenance, and synthesize.",
      prereq:["t1"],concepts:["research-plan","source-slice","deduplication","synthesis","finding"],exercise:"research-blueprint",
      quiz:"quiz.html?set=agentic",notes:"notes.html?unit=t2",
      ask:"Walk me through a research multi-agent system. Make me choose worker slices, context, finding fields, a second-round gap check, and when not to use it.",
      watch:[[SK+"claude-code-101/469796","Claude Code 101 | Subagents","Focus: distinct worker scopes prevent duplicate work."],["article-multi-agent.html","Multi-agent research | Visual article","Focus: claim + source + date + confidence."]]
    },
    {
      id:"p1",level:"Pages",title:"Production scenarios",
      one:"Read a whole system, choose an approach, and defend the tradeoff.",
      prereq:["t2"],concepts:["scenario","tradeoff","constraint","architecture-choice","failure-mode"],exercise:"scenario-decision",
      quiz:"pretest.html",notes:"notes.html?unit=p1",
      ask:"Give me one unofficial CCA-F-style production scenario. Make me choose the architecture, name a tradeoff and failure mode, and defend my choice before you grade it.",
      watch:[["pretest.html","Course practice | Pre-Test scenarios","Focus: identify the constraint before choosing a pattern."],["article-effective-agents.html","Building effective agents | Visual article","Focus: complexity must earn its cost."]]
    },
    {
      id:"px",level:"Pages",title:"Anti-patterns and decisions",
      one:"Spot attractive wrong answers and replace them with reliable designs.",
      prereq:["p1"],concepts:["anti-pattern","deterministic-gate","complexity-escalation","tool-scope","independent-review"],exercise:"anti-pattern-repair",
      quiz:"pretest.html",notes:"notes.html?unit=px",
      ask:"Drill me on architecture anti-patterns one scenario at a time. Do not reveal the answer until I choose and explain it.",
      watch:[["repair-map.html","Repair guide | Classic wrong answers","Focus: replace each tempting shortcut with its reliable control."],["article-multi-agent.html","Multi-agent research | Visual article","Focus: extra agents add cost and new failure modes."]]
    },
    {
      id:"p2",level:"Pages",title:"Capstone: PR-review pipeline",
      one:"Build a narrow end-to-end review path with validation and one hard guardrail.",
      prereq:["px"],concepts:["pr-review","file-pass","integration-pass","guardrail","human-review"],exercise:"capstone-scope",
      quiz:"projects.html",notes:"notes.html?unit=p2",
      ask:"Help me scope a small PR-review pipeline with one file pass, one integration pass, JSON validation, one code guardrail, and human review. Keep it finishable.",
      watch:[["projects.html","Projects and rubrics | Capstone","Focus: read the rubric before building."],[SK+"claude-code-101/469794","Claude Code 101 | Code review","Focus: inspect the change and produce verifiable findings."],[SK+"claude-code-in-action","Claude Code in Action","Focus: run, check, and revise end to end."]]
    }
  ];

  var lessons={
    w1:{plain:"A file is one saved item. A folder holds files. A path is the full route to an item. An extension is the ending after the final dot.",example:"/Users/student/Documents/study/tiny-order.json",diagram:["Finder","study folder","tiny-order.json","JSON text"],danger:"Saving rich text or adding .txt changes the file you meant to create."},
    w2:{plain:"JSON is plain text arranged as labeled key and value pairs. The punctuation is part of the format.",example:'{ "item": "tea", "quantity": 2 }',diagram:["{ object }","\"key\"","value","validator"],danger:"Missing quotes, extra commas, and smart quotes make JSON invalid."},
    w3:{plain:"A program follows instructions. A function is a named action. Arguments go in, a return value comes out, and an error explains why it could not finish.",example:"total(2, 3) -> 5",diagram:["arguments","function","return value","caller"],danger:"An error is not proof you failed. It is evidence about the next repair."},
    w4:{plain:"An API lets one program ask another program to do work. The request goes out; the response comes back.",example:"order app -> GET /orders/42 -> order service -> 200 + JSON",diagram:["your app","request","API","response"],danger:"An API key is a secret. Keep it in an environment variable, not inside a shared file."},
    w5:{plain:"The Terminal runs typed commands in a working directory. Start by looking, then move carefully, then validate.",example:"pwd -> ls -> cd study -> pwd",diagram:["prompt","command","working directory","output + exit code"],danger:"Do not run delete, overwrite, install, or administrator commands until you understand and intend every part."},
    d1:{plain:"A repository is a tracked project folder. A file tree shows its shape. A diff shows only what changed.",example:"- old title\n+ clearer title",diagram:["repository","file tree","changed file","diff"],danger:"A diff is not the whole project. Read surrounding code before judging a change."},
    d2:{plain:"A branch isolates work. A commit records a meaningful change. A pull request asks to merge it. CI runs automatic checks.",example:"branch -> edit -> commit -> pull request -> CI -> review -> merge",diagram:["branch","commit","pull request","CI + review"],danger:"A green CI check means the configured checks passed, not that every possible problem is absent."}
  };

  var banks={
    w1:{questions:[
      {q:"Which item is a file?",opts:["study","Documents","tiny-order.json","/Users/student"],ans:2,why:"The .json item is one saved file; the others name folders or a partial path."},
      {q:"TextEdit saved tiny-order.json.txt. What happened?",opts:["It became an API","A .txt extension was added","The folder was deleted","JSON requires .txt"],ans:1,why:"The final extension is now .txt, so it is not the filename the task requested."},
      {q:"What does a path tell you?",opts:["The route to a file or folder","The file's password","The program's output","The JSON schema"],ans:0,why:"A path names the folders to follow to reach an item."},
      {q:"Why use plain text for JSON?",opts:["It removes formatting codes","It encrypts the file","It makes every value a number","It runs the file"],ans:0,why:"JSON is a text data format; rich-text formatting can add content JSON parsers do not understand."},
      {q:"You want to edit JSON by clicking in an app. Which category fits?",opts:["Text editor","Terminal command","API response","Model"],ans:0,why:"A text editor edits file contents; a terminal runs typed commands."}
    ]},
    w2:{questions:[
      {q:"In JSON, what is the key in { \"city\": \"Berkeley\" }?",opts:["Berkeley","city","Both values","The braces"],ans:1,why:"The key is the label before the colon."},
      {q:"Which is valid JSON?",opts:['{ item: "tea" }','{ "item": "tea", }','{ "item": "tea" }','{ “item”: “tea” }'],ans:2,why:"JSON keys use straight double quotes and there is no trailing comma."},
      {q:"What does a JSON array hold?",opts:["An ordered list of values","Only one key","A secret","A command"],ans:0,why:"Square brackets contain an ordered list."},
      {q:"A validator reports a missing comma. Best next step?",opts:["Read the exact location and repair it","Retry the same file forever","Change every value","Hide the error"],ans:0,why:"Specific validation feedback points to the repair."},
      {q:"Valid JSON guarantees what?",opts:["Correct punctuation and structure","Every fact is true","The API is online","The model is safe"],ans:0,why:"Syntax validity does not prove the facts are correct."}
    ]},
    w3:{questions:[
      {q:"In add(2, 3), what are 2 and 3?",opts:["Arguments","Errors","Files","Return statements"],ans:0,why:"Arguments are input values passed into a function."},
      {q:"What is a return value?",opts:["The output a function gives back","A folder path","A terminal prompt","A secret key"],ans:0,why:"The caller receives the returned result."},
      {q:"A function cannot find an order ID. What should it do?",opts:["Return or raise a clear error","Invent an order","Silently return success","Delete the request"],ans:0,why:"A specific error lets the caller recover or ask for better input."},
      {q:"Which sketch matches a function?",opts:["input -> named action -> output","output -> delete -> secret","folder -> folder -> folder","model -> no result"],ans:0,why:"Functions transform inputs into outputs."},
      {q:"Why read an error message?",opts:["It contains evidence about what failed","It always blames the learner","It is a final score","It is the same as output"],ans:0,why:"Errors are diagnostic information."}
    ]},
    w4:{questions:[
      {q:"Who sends an API request?",opts:["A client program","The file extension","A folder","A schema alone"],ans:0,why:"The client asks a server or service for work."},
      {q:"What comes back from an API?",opts:["A response","A folder","A branch","A prompt only"],ans:0,why:"The response contains status and data or an error."},
      {q:"Where should an API key live?",opts:["An environment variable","A public README","The JSON example","A screenshot"],ans:0,why:"Keep secrets outside shared source files."},
      {q:"A response has status 404. What does that usually mean?",opts:["The requested item was not found","Everything succeeded","The JSON is an array","The model needs more tokens"],ans:0,why:"404 is a not-found response status."},
      {q:"Which flow is correct?",opts:["app -> request -> API -> response -> app","API -> folder -> branch","response -> no request -> app","key -> public log -> API"],ans:0,why:"The client sends a request and receives a response."}
    ]},
    w5:{questions:[
      {q:"What does pwd show?",opts:["Your current working directory","Every file on the computer","A password","The last error only"],ans:0,why:"pwd means print working directory."},
      {q:"What does ls do?",opts:["Lists items in a directory","Deletes a file","Installs software","Changes JSON"],ans:0,why:"ls is a look command."},
      {q:"Before running a command that changes files, what should a beginner do?",opts:["Confirm the directory and understand every part","Add sudo","Run it twice","Hide the output"],ans:0,why:"Orientation and intent come before mutation."},
      {q:"What does a zero exit code usually mean?",opts:["The command completed successfully","The file is empty","The API key leaked","The folder moved"],ans:0,why:"Conventionally, zero means success and nonzero signals a problem."},
      {q:"Which command changes the working directory?",opts:["cd","pwd","ls","cat"],ans:0,why:"cd means change directory."}
    ]},
    d1:{questions:[
      {q:"What is a repository?",opts:["A project folder whose changes are tracked","One API response","A model context window","A JSON key"],ans:0,why:"A repository tracks a project and its history."},
      {q:"What does a diff show?",opts:["Lines added and removed","Every file on the computer","Only test results","API prices"],ans:0,why:"A diff focuses on the change."},
      {q:"In a normal diff, what does a line starting + mean?",opts:["Added","Removed","Secret","Unchanged"],ans:0,why:"A plus marks an added line."},
      {q:"Why inspect surrounding code after reading a diff?",opts:["The change may depend on nearby behavior","The diff is always false","It changes the branch","It validates JSON"],ans:0,why:"Context reveals contracts and side effects the changed lines rely on."},
      {q:"What does a file tree show?",opts:["Folders and files arranged by location","Only deleted lines","A model answer","A network request"],ans:0,why:"It is the project's folder structure."}
    ]},
    d2:{questions:[
      {q:"Why create a branch?",opts:["To isolate a change from the main line","To store an API key","To validate JSON","To increase context size"],ans:0,why:"A branch gives the work its own line until review."},
      {q:"What is a commit?",opts:["A recorded project change with a message","A live API request","A folder extension","A model refusal"],ans:0,why:"A commit records a coherent change in version history."},
      {q:"What does a pull request ask for?",opts:["Review and merge of branch changes","A larger model","A new JSON key","A terminal password"],ans:0,why:"A PR presents a branch for checks, discussion, and merge."},
      {q:"What is CI?",opts:["Automatic checks triggered by changes","A manual folder","A prompt technique","An MCP resource"],ans:0,why:"Continuous integration runs configured tests and checks automatically."},
      {q:"CI is green. What can you conclude?",opts:["The configured checks passed","The change has no possible bug","Human review is unnecessary","Every requirement was tested"],ans:0,why:"Green CI is evidence, not proof of everything."}
    ]}
  };

  var cards={
    w1:[["File","One saved item, such as tiny-order.json."],["Path","The route through folders to reach an item."],["Plain text","Text without hidden rich formatting."]],
    w2:[["JSON key","A quoted label before a colon."],["JSON value","The data after a key's colon."],["Validation","Checking data against syntax or shape rules."]],
    w3:[["Function","A named action that receives inputs and returns an output."],["Argument","An input value passed to a function."],["Error","A useful signal that explains why work could not finish."]],
    w4:[["API request","A program's structured message asking a service for work."],["API response","The status and data returned to the requester."],["Environment variable","A value stored outside source code, often used for secrets."]],
    w5:[["Working directory","The folder where a terminal command currently operates."],["pwd","Print the current working directory."],["Exit code","A number reporting whether a command succeeded or failed."]],
    a1:[["Context window","The text budget the model can use for one request."],["Schema","Rules for the expected shape and types of data."],["Tool","An action an application lets a model request."]],
    m3:[["Few-shot","A few examples inside a prompt that demonstrate the desired pattern."],["Explicit criteria","Concrete rules that say what counts as correct."],["Prompt chain","Multiple calls where one step's output feeds the next."]],
    m1:[["Nullable","A field may honestly contain null when the fact is absent."],["Enum","A field limited to a fixed set of allowed values."],["Semantic validation","Checking whether validly shaped data also makes sense."]],
    m2:[["tool_use","A model request for the application to run a tool."],["tool_result","The application's returned output for a tool request."],["is_error","A real tool-result signal that the tool failed."]],
    o1:[["Agent loop","Model -> tool request -> result -> model, repeated until done."],["stop_reason","The response field that says why generation stopped."],["Guardrail","A control that limits or blocks unsafe behavior."]],
    a2:[["Prompt caching","Reusing a stable prompt prefix instead of processing it fresh."],["Batch API","Delayed bulk processing for work that does not need an immediate result."],["Model routing","Choosing a model based on difficulty, cost, and latency."]],
    d1:[["Repository","A tracked project folder and its history."],["Diff","The lines added and removed by a change."],["File tree","The nested map of project folders and files."]],
    d2:[["Commit","A recorded coherent change with a message."],["Pull request","A proposal to review and merge branch changes."],["CI","Automatic checks run when project changes occur."]],
    m4:[["Grep","Search inside files for matching text."],["Glob","Match file names or paths by a pattern."],["Edit","Change a specific, uniquely identified piece of a file."]],
    o3:[["MCP tool","A model-controlled action exposed by an MCP server."],["MCP resource","Read-only context selected by the application."],["MCP prompt","A reusable workflow selected by a user."]],
    o4:[["CLAUDE.md","Project instructions Claude Code reads for work in that project."],["Hook","Deterministic code run before or after a tool event."],["Subagent","A worker with fresh context and a scoped prompt and tools."]],
    o2:[["Orchestrator","The coordinator that chooses tasks, delegates, and synthesizes."],["Explicit context passing","Putting everything a fresh worker needs into its prompt."],["Provenance","A record of where each finding came from."]],
    rel:[["Eval","A saved case and rubric rerun to measure behavior."],["Lost in the middle","Important text is present but buried and overlooked."],["Human in the loop","A person reviews risky, uncertain, or policy-sensitive cases."]],
    t1:[["PreToolUse hook","A deterministic check before a tool runs."],["PostToolUse hook","A deterministic check or normalization after a tool runs."],["Structured handoff","Fixed fields that give a human the facts and recommended next action."]],
    t2:[["Finding","A claim plus source, date, and confidence."],["Deduplication","Removing repeated findings before synthesis."],["Second-round delegation","Sending workers to fill gaps found after the first results."]],
    p1:[["Tradeoff","A benefit gained by accepting a cost or limitation."],["Constraint","A condition the architecture must satisfy."],["Failure mode","A specific way the system can break."]],
    px:[["Anti-pattern","A tempting design that repeatedly causes problems."],["Deterministic gate","Code that enforces a rule instead of merely asking a model."],["Independent review","A fresh evaluator that is less biased by the original run."]],
    p2:[["File pass","Review each changed file for local problems."],["Integration pass","Review interactions across files after local checks."],["PR guardrail","A deterministic block for a critical merge rule."]]
  };

  var map={};units.forEach(function(u){map[u.id]=u;});
  window.CCAF_COURSE={version:2,units:units,map:map,order:units.map(function(u){return u.id;}),lessons:lessons,banks:banks,cards:cards};
})();
