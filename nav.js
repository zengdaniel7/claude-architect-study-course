/* Shared compact top nav for all CCA-F study pages.
   Usage on a page: load course-data.js before nav.js, then render #site-nav.
   5 primary tabs + a "More ▾" menu. Auto-highlights the current page. */

/* Progress files are user-controlled input. Keep one compatibility-preserving
   validator for file restore, dashboard import, and safe resume links. */
(function(global){
  var MAX_KEYS=1000,MAX_KEY=128,MAX_VALUE=1000000,MAX_TOTAL=1800000;
  function isObject(value){return Object.prototype.toString.call(value)==="[object Object]";}
  function validKey(key){return typeof key==="string"&&key.length<=MAX_KEY&&/^ccaf-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key)&&key!=="ccaf-sync-ts";}
  function snapshot(value){
    if(!isObject(value))return {ok:false,error:"Progress data must be an object."};
    var keys=Object.keys(value),out={},total=0;
    if(keys.length>MAX_KEYS)return {ok:false,error:"Progress data has too many saved items."};
    for(var i=0;i<keys.length;i++){
      var key=keys[i],item=value[key];
      if(!validKey(key))return {ok:false,error:"Progress data contains an invalid key."};
      if(typeof item!=="string"||item.length>MAX_VALUE)return {ok:false,error:"Progress data contains an invalid value."};
      total+=key.length+item.length;
      if(total>MAX_TOTAL)return {ok:false,error:"Progress data is too large."};
      out[key]=item;
    }
    return {ok:true,data:out,count:keys.length};
  }
  function backup(value){
    if(!isObject(value))return {ok:false,error:"That file is not a progress backup."};
    var wrapped=Object.prototype.hasOwnProperty.call(value,"data"),ts=wrapped?value.ts:null;
    if(wrapped&&(!Number.isFinite(ts)||ts<0))return {ok:false,error:"That backup has an invalid timestamp."};
    var checked=snapshot(wrapped?value.data:value);
    if(!checked.ok)return checked;
    checked.ts=wrapped?ts:null;checked.legacy=!wrapped;
    return checked;
  }
  function localPage(value){
    if(typeof value!=="string"||!value||value.length>2048)return null;
    try{
      var url=new URL(value,global.location.href);
      if(url.origin!==global.location.origin||!/^https?:$/.test(url.protocol))return null;
      if(!/\/[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(url.pathname))return null;
      return url.href;
    }catch(error){return null;}
  }
  global.CCAFProgress={snapshot:snapshot,backup:backup,localPage:localPage};
})(window);

/* ---- progress file-sync (runs on every page served over local HTTP) ----
   Mirrors every ccaf-* localStorage change into my-progress.json on disk
   (via serve.py) and restores from that file when the browser copy is
   missing or older — clearing browser data can no longer lose progress.
   On the hosted site this whole block stays inactive (browser-only saves). */
(function(){
  var LOCAL=location.protocol==="http:";
  window.CCAF_SYNC={mode:LOCAL?"probing":"pages",ts:0,restored:false};
  function snap(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
    if(k&&k.indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")d[k]=localStorage.getItem(k);}
    var checked=window.CCAFProgress.snapshot(d);return checked.ok?checked.data:{};}
  window.CCAF_SYNC.snapshot=snap;
  if(!LOCAL)return;
  function announce(m){window.CCAF_SYNC.mode=m;
    try{document.dispatchEvent(new CustomEvent("ccaf-sync-mode"));}catch(e){}}
  // Restore without blocking first paint. Embedded previews can deadlock on a
  // synchronous XHR here, leaving a titled but completely blank tab.
  var t=null,restoring=true,proto=null,set0=null,rm0=null,lastIssued=0,dirty=false,saveCapable=false;
  var SESSION_KEY="ccaf-sync-checked-v3";
  function rawSet(k,v){try{if(set0)set0.call(localStorage,k,v);else localStorage.setItem(k,v);}catch(e){}}
  function nextTs(){var stored=parseInt(localStorage.getItem("ccaf-sync-ts")||"0",10)||0;lastIssued=Math.max(Date.now(),stored+1,lastIssued+1);return lastIssued;}
  function push(){
    if(restoring||!saveCapable)return;
    clearTimeout(t);t=setTimeout(function(){
    var ts=nextTs();
    fetch("/__save",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ts:ts,data:snap()})})
    .then(function(r){
      if(!r.ok)throw new Error("save unavailable");
      return r.json().catch(function(){return {};});
    }).then(function(result){
      var accepted=Number(result.ts)||ts,current=parseInt(localStorage.getItem("ccaf-sync-ts")||"0",10)||0;
      accepted=Math.max(accepted,current);rawSet("ccaf-sync-ts",String(accepted));
      window.CCAF_SYNC.ts=Math.max(window.CCAF_SYNC.ts||0,accepted);dirty=false;announce("file");
      try{sessionStorage.setItem(SESSION_KEY,"file");}catch(e){}
    }).catch(function(){dirty=false;saveCapable=false;announce("nofile");try{sessionStorage.setItem(SESSION_KEY,"nofile");}catch(e){}});
  },400);}
  // Storage objects turn direct property writes into stored items, so the
  // hook must go on Storage.prototype, not on localStorage itself.
  try{
    proto=Object.getPrototypeOf(localStorage);
    set0=proto.setItem;rm0=proto.removeItem;
    function touched(){
      if(restoring||!saveCapable)return;
      // local state is now the newest truth — an older file must never clobber it on a later load
      dirty=true;rawSet("ccaf-sync-ts",String(Date.now()));
      push();
    }
    proto.setItem=function(k,v){set0.apply(this,arguments);
      if(this===localStorage&&String(k).indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")touched();};
    proto.removeItem=function(k){rm0.apply(this,arguments);
      if(this===localStorage&&String(k).indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")touched();};
    // navigating right after a click must not lose the click: flush the snapshot as the page unloads
    window.addEventListener("pagehide",function(){
      if(restoring||!saveCapable||!dirty)return;
      try{
        var ts=nextTs();
        if(navigator.sendBeacon)navigator.sendBeacon("/__save",new Blob([JSON.stringify({ts:ts,data:snap()})],{type:"application/json"}));
      }catch(e){}
    });
  }catch(e){}

  // A tab only needs to compare browser progress with the file once. Repeating
  // the probe on every page made normal navigation feel like a reload loop.
  var checked="";try{checked=sessionStorage.getItem(SESSION_KEY)||"";}catch(e){}
  if(checked){saveCapable=checked==="file";restoring=false;announce(checked);return;}

  var ctl=(typeof AbortController!=="undefined")?new AbortController():null;
  var opts={cache:"no-store"};if(ctl)opts.signal=ctl.signal;
  var abortTimer=setTimeout(function(){if(ctl)ctl.abort();},1500);
  // Only serve.py exposes this endpoint. Plain http.server gets one harmless
  // 404 per tab, then stays browser-only instead of flooding unsupported POSTs.
  fetch("/__health",opts)
    .then(function(r){if(!r.ok)throw new Error("file saving unavailable");return r.json();})
    .then(function(health){if(!health||health.save!==true)throw new Error("file saving unavailable");saveCapable=true;return fetch("my-progress.json?nocache="+Date.now(),opts);})
    .then(function(r){return r.ok?r.json().catch(function(){return {};}):{};})
    .then(function(f){
      clearTimeout(abortTimer);
      var mine=parseInt(localStorage.getItem("ccaf-sync-ts")||"0",10),didRestore=false;
      var checked=(f&&f.data)?window.CCAFProgress.snapshot(f.data):{ok:false};
      if(checked.ok&&typeof f.ts==="number"&&Number.isFinite(f.ts)&&f.ts>mine){
        for(var k in checked.data)rawSet(k,checked.data[k]);
        rawSet("ccaf-sync-ts",String(f.ts));
        window.CCAF_SYNC.ts=f.ts;window.CCAF_SYNC.restored=true;didRestore=true;
      }
      restoring=false;announce("file");try{sessionStorage.setItem(SESSION_KEY,"file");}catch(e){}
      // Page scripts may already have read the old local state. One reload is
      // enough; the saved timestamp prevents a loop on the second load.
      if(didRestore)setTimeout(function(){location.reload();},0);
    })
    .catch(function(){clearTimeout(abortTimer);saveCapable=false;restoring=false;announce("nofile");try{sessionStorage.setItem(SESSION_KEY,"nofile");}catch(e){}});
})();

(function(){ // completion-gate upgrade: strict about the future, GENEROUS about the past.
  // Lessons closed before the gate existed stay closed and re-closable (no confiscated work).
  try{
    var done=(JSON.parse(localStorage.getItem("ccaf-curriculum")||"{}").done)||{};
    var qd=JSON.parse(localStorage.getItem("ccaf-quizdone")||"{}");
    var ev=JSON.parse(localStorage.getItem("ccaf-everdone")||"{}");
    var ch=false;
    for(var k in done){if(done[k]){
      if(!ev[k]){ev[k]=true;ch=true;}
      if(!qd[k]){qd[k]={legacy:true,ts:new Date().toLocaleDateString()};ch=true;}
    }}
    if(ch){localStorage.setItem("ccaf-everdone",JSON.stringify(ev));localStorage.setItem("ccaf-quizdone",JSON.stringify(qd));}
    var st=JSON.parse(localStorage.getItem("ccaf-pipeline-stash")||"null"); // old single-slot stash -> per-unit map
    if(st&&st.unit&&Array.isArray(st.checks)){var m={};m[st.unit]=st.checks;localStorage.setItem("ccaf-pipeline-stash",JSON.stringify(m));}
  }catch(e){}
})();

(function(){ // ---- per-lesson steps: ONE source of truth + a NOW-lesson mirror (council ruling 2026-07-08) ----
  // ccaf-steps   = {unitId:{checks:[5 bools],date}} — the only real step store.
  // ccaf-pipeline = a MIRROR of the current (first-not-done) lesson, kept so
  //   older tabs/pages keep working. Never a source of truth again.
  // ccaf-week-sources[date][step] = {unitId:true,…} — which lesson(s) earned
  //   today's habit tick, so un-ticking one lesson can't erase another's credit.
  function J(k,f){try{var v=JSON.parse(localStorage.getItem(k)||"null");return v==null?f:v;}catch(e){return f;}}
  function S(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
  function tod(){var n=new Date();return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0");}
  function blank(){return [false,false,false,false,false];}
  var COURSE=window.CCAF_COURSE||null;
  var ORDER=COURSE?COURSE.order.slice():["w1","w2","w3","w4","w5","a1","m3","m1","m2","o1","a2","d1","d2","m4","o3","o4","o2","rel","t1","t2","p1","px","p2"];
  var TITLES={};
  if(COURSE){COURSE.units.forEach(function(u){TITLES[u.id]=u.title;});}
  else{TITLES={w1:"Files, folders, and plain text",w2:"JSON by hand",w3:"Programs, functions, and errors",w4:"API request and response",w5:"Safe Terminal basics",a1:"Core vocabulary",m3:"Prompt techniques",m1:"A structured-output call",m2:"One tool call",o1:"The Agent Loop",a2:"Model physics & economics",d1:"Repositories, trees, and diffs",d2:"Commits, pull requests, and CI",m4:"Built-in tools",o3:"An MCP server",o4:"Claude Code workflows",o2:"Orchestrator-Workers",rel:"Reliability, context & evals",t1:"Support-agent system",t2:"Research multi-agent system",p1:"Production scenarios",px:"Anti-patterns & decision frameworks",p2:"Capstone: PR-review pipeline"};}
  function cur(){var d=(J("ccaf-curriculum",{})||{}).done||{};for(var i=0;i<ORDER.length;i++){if(!d[ORDER[i]])return ORDER[i];}return "end";}
  function getSteps(u){var st=J("ccaf-steps",{})||{};var r=st[u];
    return (r&&Array.isArray(r.checks)&&r.checks.length===5)?r.checks.slice():blank();}
  function syncPipeline(){var c=cur();
    try{var nw=JSON.stringify({date:tod(),unit:c,checks:getSteps(c)});
      if(localStorage.getItem("ccaf-pipeline")!==nw)localStorage.setItem("ccaf-pipeline",nw);}catch(e){}}
  function setStep(u,i,val){
    var st=J("ccaf-steps",{})||{};
    var r=(st[u]&&Array.isArray(st[u].checks)&&st[u].checks.length===5)?st[u]:{checks:blank()};
    r.checks[i]=!!val; r.date=tod(); st[u]=r; S("ccaf-steps",st);
    var t=tod(), src=J("ccaf-week-sources",{})||{};
    src[t]=src[t]||{}; src[t][i]=src[t][i]||{};
    if(val)src[t][i][u]=true; else delete src[t][i][u];
    S("ccaf-week-sources",src);
    var wl=J("ccaf-week-log",{})||{};
    wl[t]=(Array.isArray(wl[t])&&wl[t].length===5)?wl[t]:blank();
    wl[t][i]=Object.keys(src[t][i]).length>0;
    S("ccaf-week-log",wl);
    syncPipeline();
  }
  function stepsFor(u){
    if((J("ccaf-everdone",{})||{})[u])return {mine:true,n:5,all:true};
    var st=J("ccaf-steps",{})||{};var r=st[u];
    if(r&&Array.isArray(r.checks)&&r.checks.length===5){var n=r.checks.filter(Boolean).length;
      return {mine:n>0,n:n,all:n===5};}
    return {mine:false,n:0,all:false};
  }
  function evidence(){return J("ccaf-evidence",{})||{};}
  function recordEvidence(u,type,data){
    var all=evidence();all[u]=all[u]||{};
    all[u][type]={data:data||{},ts:Date.now()};S("ccaf-evidence",all);
    return all[u][type];
  }
  function mastery(u){
    var ever=!!((J("ccaf-everdone",{})||{})[u]);
    var sg=stepsFor(u), q=(J("ccaf-quizdone",{})||{})[u]||null,qPass=q&&q.qualified?q.qualified:q;
    var ev=evidence()[u]||{}, unit=COURSE&&COURSE.map?COURSE.map[u]:null;
    var isProject=!!(unit&&String(unit.quiz).indexOf("projects.html")===0);
    var quizOK=ever||isProject||!!(qPass&&qPass.total>0&&(qPass.score/qPass.total)>=0.8&&Number(qPass.guessed||0)===0);
    var buildOK=ever||!!(ev.build&&ev.build.data&&ev.build.data.mode==="independent"&&unit&&ev.build.data.exercise===unit.exercise);
    var teachOK=ever||!!(ev.teachback&&ev.teachback.data&&ev.teachback.data.complete);
    var allOK=ever||(sg.all&&quizOK&&buildOK&&teachOK);
    var touched=sg.n>0||!!q||!!ev.build||!!ev.teachback;
    var practiced=!!q||!!ev.build||!!ev.teachback;
    var state=allOK?"proficient":(practiced?"practiced":(touched?"seen":"new"));
    return {unit:u,state:state,mastered:allOK,grandfathered:ever,steps:sg,quiz:q,quizOK:quizOK,buildOK:buildOK,teachOK:teachOK};
  }
  function qualifiesQuiz(result){return !!(result&&result.total>0&&(result.score/result.total)>=0.8&&Number(result.guessed||0)===0);}
  function quizRecord(result){return {score:result.score,total:result.total,guessed:Number(result.guessed||0),set:result.set||"",ts:result.ts||""};}
  function mergeQuizResult(previous,latest){
    var qualified=previous&&previous.qualified?quizRecord(previous.qualified):(qualifiesQuiz(previous)?quizRecord(previous):null);
    if(qualifiesQuiz(latest))qualified=quizRecord(latest);
    if(qualified)latest.qualified=qualified;
    return latest;
  }
  // one-time migration: OR-merge old pipeline + stash into ccaf-steps (true wins, backup first)
  try{
    if(!localStorage.getItem("ccaf-steps-v")){
      var oldP=J("ccaf-pipeline",null), oldM=J("ccaf-pipeline-stash",null);
      S("ccaf-steps-backup-1",{pipeline:oldP,stash:oldM,steps:J("ccaf-steps",null)});
      var st0=J("ccaf-steps",{})||{};
      var orIn=function(u,checks){ if(!u||!Array.isArray(checks)||checks.length!==5)return;
        var r=(st0[u]&&Array.isArray(st0[u].checks)&&st0[u].checks.length===5)?st0[u]:{checks:blank()};
        for(var i=0;i<5;i++)r.checks[i]=r.checks[i]||!!checks[i];
        r.date=r.date||tod(); st0[u]=r; };
      if(oldP&&Array.isArray(oldP.checks))orIn(oldP.unit||cur(),oldP.checks);
      var m=oldM;
      if(m&&m.unit&&m.checks){var m2={};m2[m.unit]=m.checks;m=m2;} // old single-slot shape
      if(m&&typeof m==="object"){for(var k in m)orIn(k,m[k]);}
      S("ccaf-steps",st0);
      // today's habit row predates source tracking — credit it to the lesson it belonged to
      var t0=tod(), wl0=J("ccaf-week-log",{})||{}, src0=J("ccaf-week-sources",{})||{};
      if(Array.isArray(wl0[t0])&&!src0[t0]){src0[t0]={};var su=(oldP&&oldP.unit)||cur();
        for(var i0=0;i0<5;i0++){src0[t0][i0]={};if(wl0[t0][i0])src0[t0][i0][su]=true;}
        S("ccaf-week-sources",src0);}
      localStorage.setItem("ccaf-steps-v","1");
    }
  }catch(e){}
  // absorb a tick an OLD tab may have written straight into the mirror, then re-mirror
  try{var pAb=J("ccaf-pipeline",null),cAb=cur();
    if(pAb&&pAb.unit===cAb&&Array.isArray(pAb.checks)&&pAb.checks.length===5){
      var stA=J("ccaf-steps",{})||{};
      var rA=(stA[cAb]&&Array.isArray(stA[cAb].checks)&&stA[cAb].checks.length===5)?stA[cAb]:{checks:blank()};
      var chA=false;
      for(var iA=0;iA<5;iA++){if(pAb.checks[iA]&&!rA.checks[iA]){rA.checks[iA]=true;chA=true;}}
      if(chA){rA.date=tod();stA[cAb]=rA;S("ccaf-steps",stA);}
    }}catch(e){}
  syncPipeline();
  window.CCAF={ORDER:ORDER,TITLES:TITLES,COURSE:COURSE,cur:cur,today:tod,getSteps:getSteps,setStep:setStep,stepsFor:stepsFor,syncPipeline:syncPipeline,recordEvidence:recordEvidence,mastery:mastery,mergeQuizResult:mergeQuizResult};
})();

(function(global){ // ---- one lesson path shared by every learning surface ----
  var STAGES=[
    {id:"learn",label:"Learn",step:0},
    {id:"draw",label:"Draw",step:1},
    {id:"build",label:"Build",step:2},
    {id:"teach",label:"Teach",step:3},
    {id:"quiz",label:"Quiz"},
    {id:"review",label:"Review",step:4}
  ];
  function addUnit(href,id){
    if(!href)return "today.html";
    if(!/^(quiz|pretest)\.html/.test(href))return href;
    return href+(href.indexOf("?")>=0?"&":"?")+"unit="+encodeURIComponent(id);
  }
  function unit(id){return global.CCAF_COURSE&&global.CCAF_COURSE.map?global.CCAF_COURSE.map[id]:null;}
  function route(id,stage){
    var u=unit(id);if(!u)return "today.html";
    if(stage==="learn")return u.notes||("notes.html?unit="+encodeURIComponent(id));
    if(stage==="draw")return "draw.html?unit="+encodeURIComponent(id);
    if(stage==="build")return "exercise.html?id="+encodeURIComponent(u.exercise);
    if(stage==="teach")return "teachback.html?unit="+encodeURIComponent(id);
    if(stage==="quiz")return addUnit(u.quiz,id);
    if(stage==="review")return "review.html?unit="+encodeURIComponent(id);
    return "today.html?unit="+encodeURIComponent(id);
  }
  function states(id){
    var checks=global.CCAF?global.CCAF.getSteps(id):[false,false,false,false,false];
    var mastery=global.CCAF?global.CCAF.mastery(id):null;
    return {
      learn:!!checks[0],draw:!!checks[1],
      build:!!(mastery&&mastery.buildOK),teach:!!(mastery&&mastery.teachOK),
      quiz:!!(mastery&&mastery.quizOK),review:!!checks[4]
    };
  }
  function next(id){
    var done=states(id);
    for(var i=0;i<STAGES.length;i++)if(!done[STAGES[i].id])return {id:STAGES[i].id,label:STAGES[i].label,href:route(id,STAGES[i].id)};
    return {id:"complete",label:"Finish lesson",href:"today.html?unit="+encodeURIComponent(id)};
  }
  function mount(target,options){
    var host=typeof target==="string"?document.getElementById(target):target;
    options=options||{};var id=options.unit,u=unit(id);if(!host||!u)return;
    var done=states(id),count=STAGES.filter(function(s){return done[s.id];}).length;
    host.textContent="";host.className="lesson-flow-shell"+(options.compact?" compact":"");
    var head=document.createElement("div");head.className="lesson-flow-head";
    var title=document.createElement("b");title.textContent="Lesson path";
    var summary=document.createElement("span");summary.textContent=count+" of "+STAGES.length+" complete";
    head.appendChild(title);head.appendChild(summary);host.appendChild(head);
    var track=document.createElement("nav");track.className="lesson-flow-track";track.setAttribute("aria-label",u.title+" lesson path");
    STAGES.forEach(function(stage,index){
      var link=document.createElement("a");link.className="lesson-stage"+(done[stage.id]?" is-done":"")+(options.stage===stage.id?" is-current":"");
      link.href=route(id,stage.id);if(options.stage===stage.id)link.setAttribute("aria-current","step");
      var mark=document.createElement("span");mark.className="lesson-stage-mark";mark.setAttribute("aria-hidden","true");mark.textContent=done[stage.id]?"✓":String(index+1);
      var label=document.createElement("span");label.textContent=stage.label;
      link.appendChild(mark);link.appendChild(label);track.appendChild(link);
    });
    host.appendChild(track);
  }
  function mountNext(target,id,options){
    var host=typeof target==="string"?document.getElementById(target):target;if(!host||!unit(id))return;
    options=options||{};var action=options.stage?{id:options.stage,label:STAGES.filter(function(s){return s.id===options.stage;})[0].label,href:route(id,options.stage)}:next(id);
    host.textContent="";host.className="study-actionbar";
    var context=document.createElement("span");context.className="study-action-context";context.textContent=options.context||"Ready for the next step?";
    var link=document.createElement("a");link.className="study-primary-action";link.href=action.href;link.textContent=(options.label||("Next: "+action.label))+" →";
    host.appendChild(context);host.appendChild(link);
  }
  global.CCAFFlow={stages:STAGES,route:route,states:states,next:next,mount:mount,mountNext:mountNext};
})(window);

(function(){
  var PRIMARY=[
    {href:"dashboard.html",   label:"Home",     cls:"home nav-core", m:["dashboard.html",""]},
    {href:"today.html",       label:"Today",    cls:"nav-core", m:["today.html"]},
    {href:"curriculum.html",  label:"Course",   cls:"nav-wide", m:["curriculum.html"]},
    {href:"quizzes.html",     label:"Practice", cls:"nav-wide", m:["quizzes.html","quiz.html","pretest.html","flashcards.html","exercise.html","repair-map.html"]},
    {href:"timeline.html",    label:"Progress", cls:"nav-wide", m:["timeline.html"]}
  ];
  var MORE=[
    {href:"curriculum.html",   label:"Course",mobile:true},
    {href:"quizzes.html",      label:"Practice",mobile:true},
    {href:"timeline.html",     label:"Progress",mobile:true},
    {href:"notes.html",        label:"📖 Lesson notes"},
    {href:"video-library.html",label:"🎥 Video library"},
    {href:"concept-map.html",  label:"Concept map"},
    {href:"review.html",       label:"Review queue"},
    {href:"tutor-bridge.html", label:"Ask tutor"},
    {href:"engineer-path.html",label:"Applied Engineer"},
    {href:"learning-map.html", label:"🗺️ Visual Map"},
    {href:"my-plan.html",      label:"🧭 My Plan"},
    {href:"daily-pipeline.html",label:"📋 Weekly Pipeline"},
    {href:"exam-facts.html",   label:"✅ Exam Facts"},
    {href:"projects.html",     label:"🔨 Projects"},
    {href:"resources.html",    label:"📚 Resources"}
  ];
  var cur=(location.pathname.split("/").pop()||"dashboard.html").toLowerCase();

  var st=document.createElement("style");
  st.textContent=
   "nav.top{position:sticky;top:0;z-index:40;background:rgba(243,247,248,.96);border-bottom:2px solid var(--line);padding:10px 0}"+
   "nav.top .wrap{display:flex;gap:6px;align-items:center}"+
   "nav.top a{display:inline-block;text-decoration:none;color:var(--ink);font-weight:700;font-size:.82rem;padding:6px 11px;border-radius:6px;border:1px solid var(--line);background:#fff}"+
   "nav.top a:hover{border-color:var(--accent);color:var(--accent)}"+
   "nav.top a.home.here{background:var(--accent);color:#fff;border-color:var(--accent)}"+
   "nav.top a.here{background:var(--ink);color:#fff;border-color:var(--ink)}"+
   ".skip-link{position:fixed;left:12px;top:8px;z-index:100;transform:translateY(-160%);background:#fff;color:var(--ink);padding:8px 12px;border:2px solid var(--accent);font-weight:800}"+
   ".skip-link:focus{transform:none}"+
   ".nav-more{position:relative;display:inline-block}"+
   ".nav-morebtn{font:inherit;font-weight:700;font-size:.82rem;padding:6px 11px;border-radius:6px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer}"+
   ".nav-morebtn:hover{border-color:var(--accent);color:var(--accent)}"+
   ".nav-morebtn.here{background:var(--ink);color:#fff;border-color:var(--ink)}"+
   ".nav-menu{position:absolute;top:118%;right:0;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.14);padding:6px;display:none;flex-direction:column;gap:3px;z-index:60;min-width:172px}"+
   ".nav-menu.open{display:flex}"+
   ".nav-menu a{white-space:normal;overflow-wrap:anywhere;padding:8px 12px;border-radius:6px;text-decoration:none;color:var(--ink);font-weight:700;font-size:.86rem;border:0;background:transparent}"+
   ".nav-menu a:hover{background:#EAF0F2}"+
   ".nav-menu a.here{background:var(--ink);color:#fff}"+
   ".nav-mobile-only{display:none}"+
   "@media(max-width:680px){nav.top{padding:7px 0}nav.top .wrap{padding:0 12px}.nav-wide{display:none!important}.nav-mobile-only{display:block}.nav-more{margin-left:auto}.nav-morebtn{min-height:42px}.nav-menu{position:fixed;left:12px;right:12px;top:58px;max-height:calc(100vh - 72px);overflow:auto}.nav-menu a{min-height:44px;display:flex;align-items:center}}";
  document.head.appendChild(st);

  function here(m){return m.indexOf(cur)>=0;}
  var inMore=MORE.some(function(x){return x.href.toLowerCase()===cur;});

  var html='<a class="skip-link" href="#main-content">Skip to content</a><div class="wrap">';
  PRIMARY.forEach(function(p){
    var c=[]; if(p.cls)c.push(p.cls); if(here(p.m))c.push("here");
    html+='<a class="'+c.join(" ")+'" href="'+p.href+'"'+(here(p.m)?' aria-current="page"':'')+'>'+p.label+'</a>';
  });
  html+='<div class="nav-more"><button type="button" class="nav-morebtn'+(inMore?" here":"")+'" id="navMoreBtn" aria-expanded="false" aria-controls="navMenu" aria-haspopup="true"><span aria-hidden="true">☰</span> Menu</button><div class="nav-menu" id="navMenu" hidden>';
  MORE.forEach(function(x){var active=x.href.toLowerCase()===cur;html+='<a href="'+x.href+'" class="'+(x.mobile?'nav-mobile-only ':'')+(active?'here':'')+'"'+(active?' aria-current="page"':'')+'>'+x.label+'</a>'; });
  html+='</div></div></div>';

  var host=document.getElementById("site-nav");
  if(!host) return;
  host.innerHTML=html;
  function markMain(){var main=document.querySelector("main")||document.querySelector("body > .wrap");if(main&&!main.id)main.id="main-content";}
  markMain();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",markMain);

  var btn=document.getElementById("navMoreBtn"), menu=document.getElementById("navMenu");
  if(btn&&menu){
    function setOpen(open,returnFocus){menu.hidden=!open;menu.classList.toggle("open",open);btn.setAttribute("aria-expanded",String(open));if(returnFocus)btn.focus();}
    btn.addEventListener("click",function(e){e.stopPropagation();setOpen(menu.hidden);});
    btn.addEventListener("keydown",function(e){if(e.key==="ArrowDown"){e.preventDefault();setOpen(true);var first=menu.querySelector("a");if(first)first.focus();}else if(e.key==="Escape")setOpen(false,true);});
    menu.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();setOpen(false,true);}});
    document.addEventListener("click",function(){setOpen(false,false);});
  }
})();
