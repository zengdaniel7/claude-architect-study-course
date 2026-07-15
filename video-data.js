/* Reviewed video map for the CCA-F course.
   Community videos are teaching aids, not official Anthropic exam specifications. */
(function(){
  var PLAYLIST_URL="https://www.youtube.com/playlist?list=PLviC8AFqAj5A9MHkRIn2fU5Ac2lEdJxNf";
  var REVIEWED_AT="2026-07-15";

  function episode(id,number,title,durationSec,uploaded,status,lessons,note){
    return {id:id,number:number,title:title,durationSec:durationSec,uploaded:uploaded,status:status,lessons:lessons||[],note:note||"",channel:"Peace Of Code",authority:"community",reviewedAt:REVIEWED_AT};
  }

  var episodes={
    ep00:episode("rcpNFm_poQs","00","The AI Certification That Will Make You Irreplaceable | Full Breakdown",544,"2026-03-25","excluded",[],"Promotional overview. It is not needed for learning and its exam claims are not official Anthropic specifications."),
    ep01:episode("ldqOnljDINc","01","Agentic Loops and stop_reason Explained",2967,"2026-04-05","used",["o1"],"The assigned clip stops before the inaccurate claim that only two stop reasons exist. The full episode simplifies the current API behavior."),
    ep02:episode("ejPWvBcc_DU","02","Multi-Agent Systems and Coordinator Patterns",1955,"2026-04-07","used",["o2"],"Use the short coordinator clip; the official subagents lesson remains the authority."),
    ep03:episode("a2N6vKdQUfE","03","Subagent Context Passing and Session Management",2016,"2026-04-12","used",["t2"],"The selected clip focuses on provenance and conflicting findings."),
    ep04:episode("e7ijjK173zI","04","Multi-Agent System in Python and Claude SDK | Hands On",767,"2026-04-17","reference",["o2","t2"],"Useful full build-along after the orchestration lessons; not required in the core path."),
    ep05:episode("JJBcpwpsKzk","05","PreToolUse, PostToolUse Hooks and Task Decomposition",2723,"2026-04-19","used",["t1"],"The assigned clip shows deterministic prerequisite gates."),
    ep06:episode("s1j1vTnCKns","06","Tool Descriptions and Tool Misrouting",1490,"2026-04-24","used",["m2"],"The assigned clip shows why names and descriptions change tool selection."),
    ep07:episode("eZj6FtTVV58","07","Agent Error Handling and tool_choice",2286,"2026-04-26","reference",["m2","rel"],"Useful extra review for tool errors; the core lesson already covers the same ground more briefly."),
    ep08:episode("IVUxGTxSuH8","08","MCP Servers, Configuration, Cline and More",5348,"2026-04-29","used",["o3"],"The assigned MCP introduction is current. A later full-episode section saying all MCP tools load at once is outdated: Claude Code now uses Tool Search by default."),
    ep09:episode("eh-xxQpfBBY","09","Claude Built-in Tools Explained",2139,"2026-05-01","used",["m4"],"The assigned clip demonstrates a search, read, and edit exploration path."),
    ep10:episode("qIee1aqSAwY","10","CLAUDE.md Hierarchy and Configuration Rules",1896,"2026-05-03","reference",["o4"],"Reference only. Current CLAUDE.md loading and post-compaction behavior should be learned from the official memory documentation."),
    ep11:episode("v3tMqTmgg2Q","11","Custom Slash Commands and Skills",1997,"2026-05-06","reference",["o4"],"Reference only. Custom commands have since merged into Skills; .claude/commands remains compatible."),
    ep12:episode("q-n1cut5e7c","12","Plan Mode vs Execute in Claude Code",3102,"2026-05-10","used",["o4"],"The assigned clip gives a clear decision rule for planning before execution."),
    ep13:episode("GWCnDhgH840","13","Claude Code CI/CD Pipelines",1881,"2026-05-13","used",["d2"],"The assigned clip connects a pull request to automated Claude Code checks."),
    ep14:episode("HqwULqy1egw","14","Prompt Engineering: Explicit Criteria and False Positives",2065,"2026-05-17","used",["m3"],"Primary playlist lesson for explicit criteria."),
    ep15:episode("FbIcU6YFrhw","15","Few-Shot Prompting Explained",1662,"2026-05-20","used",["m3"],"Optional clip for targeted examples after explicit criteria."),
    ep16:episode("CaDaLn7DcQ0","16","Structured Output and JSON Schema",2211,"2026-05-25","reference",["m1"],"Reference only. Its fake-tool forcing method is historical; current JSON outputs use output_config.format and strict tools use strict: true."),
    ep17:episode("BXs7QoLQxX0","17","Batch API and Multi-Pass Review",2044,"2026-05-29","used",["p2"],"The selected multi-pass section is current. Earlier Batch API limitations in the full episode no longer describe all supported tool-use and multi-turn cases."),
    ep18:episode("7kaJdZ7veDs","18","Why AI Agents Forget: Context Engineering",2598,"2026-06-02","used",["rel"],"Treat context as working input, not durable memory. Compaction and summaries are useful but lossy."),
    ep19:episode("MqnElZw6NYk","19","Subagent Error Propagation and Context Management",2546,"2026-06-07","reference",["rel","o2"],"Useful extra review. A scratchpad persists only when the application writes it and deliberately reads it again."),
    ep20:episode("tsIxzFg76Nw","20","When AI Needs a Human",3078,"2026-06-10","used",["px"],"The assigned clip focuses on synthesis risk and human review."),
    exam:episode("-NymqBcFy6E","Bonus","Exam Questions Solved and Exam Traps",3650,"2026-06-21","excluded",["p1"],"Unofficial exam coaching. It is excluded from the teaching path so reported exam claims are not presented as facts."),
    unavailable:episode("bBeuTxCiWYA","?","Unavailable playlist video",0,"","unavailable",[],"YouTube reports this video as unavailable."),
    hidden:episode("","?","Hidden unavailable playlist item",0,"","unavailable",[],"The playlist reports one additional hidden or unavailable item without a usable video ID.")
  };

  function clip(id,episodeKey,startSec,endSec,focus){
    return {id:id,episode:episodeKey,startSec:startSec,endSec:endSec,focus:focus,reviewedAt:REVIEWED_AT,captionSource:"YouTube native captions",status:"current"};
  }

  var clips={
    agentLoop:clip("agent-loop-basics","ep01",1157,1306,"See chat become a loop: reason, call a tool, read the result, and decide again."),
    coordinator:clip("coordinator-role","ep02",362,514,"Name the coordinator's jobs before adding workers."),
    provenance:clip("provenance-conflicts","ep03",640,1104,"Pass sources with findings and resolve conflicts before synthesis."),
    gates:clip("deterministic-gates","ep05",1338,1660,"Use code to block an action until a required fact is verified."),
    toolDescriptions:clip("tool-descriptions","ep06",58,588,"See how names, descriptions, and overlap change tool selection."),
    mcpBasics:clip("mcp-basics","ep08",104,684,"See the MCP client-server picture and what MCP connects."),
    builtInTools:clip("codebase-exploration","ep09",1216,1648,"Follow search -> read -> edit instead of guessing where code lives."),
    planMode:clip("plan-mode","ep12",280,548,"Choose plan mode for complex, ambiguous, or risky work."),
    cicd:clip("ci-integration","ep13",342,502,"Connect pull-request changes to automatic Claude Code checks."),
    criteria:clip("explicit-criteria","ep14",902,1320,"Replace vague guidance with concrete pass and fail criteria."),
    fewShot:clip("targeted-examples","ep15",772,1046,"Use a few examples that target the ambiguous edge cases."),
    multiPass:clip("multi-pass-review","ep17",1246,1726,"Review each item first, then run a second integration pass."),
    context:clip("context-and-summaries","ep18",206,702,"Separate working context from durable memory and see why summaries lose detail."),
    synthesisRisk:clip("synthesis-risk","ep20",2544,2742,"See why high-risk synthesis still needs a human checkpoint.")
  };

  function authorityFor(url){
    if(!/^https?:/i.test(url))return "local";
    if(/(?:anthropic\.skilljar\.com|anthropic\.com|claude\.com|platform\.claude\.com|code\.claude\.com)/i.test(url))return "official";
    return "external";
  }
  function resource(tuple){
    return {type:"resource",url:tuple[0],title:tuple[1],focus:tuple[2]||"",authority:authorityFor(tuple[0])};
  }
  function clipItem(clipKey){return {type:"clip",clip:clipKey,authority:"community"};}

  var lessons={};
  var course=window.CCAF_COURSE;
  if(course&&Array.isArray(course.units)){
    course.units.forEach(function(unit){
      var original=(unit.watch||[]).map(resource);
      lessons[unit.id]={primary:original.shift()||null,optional:null,references:original,noVideoReason:""};
    });
  }

  function lead(unitId,clipKey){
    var lesson=lessons[unitId];if(!lesson)return;
    if(lesson.primary)lesson.references.unshift(lesson.primary);
    lesson.primary=clipItem(clipKey);
  }
  function optional(unitId,clipKey){if(lessons[unitId])lessons[unitId].optional=clipItem(clipKey);}

  lead("m3","criteria");
  optional("m3","fewShot");
  lead("o1","agentLoop");
  optional("m2","toolDescriptions");
  optional("d2","cicd");
  optional("m4","builtInTools");
  optional("o3","mcpBasics");
  optional("o4","planMode");
  optional("o2","coordinator");
  optional("rel","context");
  optional("t1","gates");
  optional("t2","provenance");
  optional("px","synthesisRisk");
  optional("p2","multiPass");

  function youtubeUrl(videoId,startSec){
    return "https://www.youtube.com/watch?v="+encodeURIComponent(videoId)+(startSec?"&t="+startSec+"s":"");
  }
  function resolve(item){
    if(!item)return null;
    if(item.type!=="clip")return item;
    var selected=clips[item.clip],ep=selected&&episodes[selected.episode];
    if(!selected||!ep)return null;
    return {
      type:"clip",clipId:selected.id,episodeKey:selected.episode,videoId:ep.id,number:ep.number,
      title:ep.title,focus:selected.focus,startSec:selected.startSec,endSec:selected.endSec,
      url:youtubeUrl(ep.id,selected.startSec),fullUrl:youtubeUrl(ep.id,0),thumbnail:"https://i.ytimg.com/vi/"+ep.id+"/hqdefault.jpg",
      authority:"community",channel:ep.channel,uploaded:ep.uploaded,reviewedAt:selected.reviewedAt,
      captionSource:selected.captionSource,note:ep.note,status:selected.status
    };
  }

  window.CCAF_MEDIA={
    playlistUrl:PLAYLIST_URL,
    reviewedAt:REVIEWED_AT,
    episodes:episodes,
    clips:clips,
    lessons:lessons,
    resolve:resolve,
    youtubeUrl:youtubeUrl,
    communityNotice:"Community explanation from Peace Of Code. It is not official Anthropic guidance or an official exam specification."
  };
})();
