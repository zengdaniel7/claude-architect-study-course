/* Shared compact top nav for all CCA-F study pages.
   Usage on a page: load course-data.js before nav.js, then render #site-nav.
   5 primary tabs + a "More ▾" menu. Auto-highlights the current page. */

/* ---- progress file-sync (runs on every page, localhost only) ----
   Mirrors every ccaf-* localStorage change into my-progress.json on disk
   (via serve.py) and restores from that file when the browser copy is
   missing or older — clearing browser data can no longer lose progress.
   On the hosted site this whole block stays inactive (browser-only saves). */
(function(){
  var LOCAL=(location.hostname==="localhost"||location.hostname==="127.0.0.1");
  window.CCAF_SYNC={mode:LOCAL?"probing":"pages",ts:0,restored:false};
  function snap(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
    if(k&&k.indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")d[k]=localStorage.getItem(k);}return d;}
  window.CCAF_SYNC.snapshot=snap;
  if(!LOCAL)return;
  function announce(m){window.CCAF_SYNC.mode=m;
    try{document.dispatchEvent(new CustomEvent("ccaf-sync-mode"));}catch(e){}}
  // Restore without blocking first paint. Embedded previews can deadlock on a
  // synchronous XHR here, leaving a titled but completely blank tab.
  var t=null,restoring=true,proto=null,set0=null,rm0=null;
  function rawSet(k,v){try{if(set0)set0.call(localStorage,k,v);else localStorage.setItem(k,v);}catch(e){}}
  function push(){
    if(restoring)return;
    clearTimeout(t);t=setTimeout(function(){
    var ts=Date.now();
    fetch("/__save",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ts:ts,data:snap()})})
    .then(function(r){
      if(r.ok){rawSet("ccaf-sync-ts",String(ts));
        window.CCAF_SYNC.ts=ts;announce("file");}
      else{announce("nofile");}
    }).catch(function(){announce("nofile");});
  },400);}
  // Storage objects turn direct property writes into stored items, so the
  // hook must go on Storage.prototype, not on localStorage itself.
  try{
    proto=Object.getPrototypeOf(localStorage);
    set0=proto.setItem;rm0=proto.removeItem;
    function touched(){
      if(restoring)return;
      // local state is now the newest truth — an older file must never clobber it on a later load
      rawSet("ccaf-sync-ts",String(Date.now()));
      push();
    }
    proto.setItem=function(k,v){set0.apply(this,arguments);
      if(this===localStorage&&String(k).indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")touched();};
    proto.removeItem=function(k){rm0.apply(this,arguments);
      if(this===localStorage&&String(k).indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")touched();};
    // navigating right after a click must not lose the click: flush the snapshot as the page unloads
    window.addEventListener("pagehide",function(){
      if(restoring)return;
      try{
        var ts=Date.now();
        var ok=navigator.sendBeacon&&navigator.sendBeacon("/__save",new Blob([JSON.stringify({ts:ts,data:snap()})],{type:"application/json"}));
        if(ok)rawSet("ccaf-sync-ts",String(ts));
      }catch(e){}
    });
  }catch(e){}

  var ctl=(typeof AbortController!=="undefined")?new AbortController():null;
  var opts={cache:"no-store"};if(ctl)opts.signal=ctl.signal;
  var abortTimer=setTimeout(function(){if(ctl)ctl.abort();},1500);
  fetch("my-progress.json?nocache="+Date.now(),opts)
    .then(function(r){if(!r.ok)throw new Error("progress unavailable");return r.json();})
    .then(function(f){
      clearTimeout(abortTimer);
      var mine=parseInt(localStorage.getItem("ccaf-sync-ts")||"0",10),didRestore=false;
      if(f&&f.data&&typeof f.ts==="number"&&f.ts>mine){
        for(var k in f.data)rawSet(k,f.data[k]);
        rawSet("ccaf-sync-ts",String(f.ts));
        window.CCAF_SYNC.ts=f.ts;window.CCAF_SYNC.restored=true;didRestore=true;
      }
      restoring=false;announce("file");
      // Page scripts may already have read the old local state. One reload is
      // enough; the saved timestamp prevents a loop on the second load.
      if(didRestore)setTimeout(function(){location.reload();},0);else push();
    })
    .catch(function(){clearTimeout(abortTimer);restoring=false;announce("nofile");push();});
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
    var sg=stepsFor(u), q=(J("ccaf-quizdone",{})||{})[u]||null;
    var ev=evidence()[u]||{}, unit=COURSE&&COURSE.map?COURSE.map[u]:null;
    var isProject=!!(unit&&String(unit.quiz).indexOf("projects.html")===0);
    var quizOK=ever||isProject||!!(q&&q.total>0&&(q.score/q.total)>=0.8&&Number(q.guessed||0)===0);
    var buildOK=ever||!!(ev.build&&ev.build.data&&ev.build.data.mode==="independent");
    var teachOK=ever||!!(ev.teachback&&ev.teachback.data&&ev.teachback.data.complete);
    var allOK=ever||(sg.all&&quizOK&&buildOK&&teachOK);
    var touched=sg.n>0||!!q||!!ev.build||!!ev.teachback;
    var practiced=!!q||!!ev.build||!!ev.teachback;
    var state=allOK?"proficient":(practiced?"practiced":(touched?"seen":"new"));
    return {unit:u,state:state,mastered:allOK,grandfathered:ever,steps:sg,quiz:q,quizOK:quizOK,buildOK:buildOK,teachOK:teachOK};
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
  window.CCAF={ORDER:ORDER,TITLES:TITLES,COURSE:COURSE,cur:cur,today:tod,getSteps:getSteps,setStep:setStep,stepsFor:stepsFor,syncPipeline:syncPipeline,recordEvidence:recordEvidence,mastery:mastery};
})();

(function(){
  var PRIMARY=[
    {href:"dashboard.html",   label:"🏠 Home",     cls:"home", m:["dashboard.html",""]},
    {href:"today.html",       label:"▶️ Lesson",   m:["today.html"]},
    {href:"curriculum.html",  label:"📚 Learn",    m:["curriculum.html"]},
    {href:"quizzes.html",     label:"🎯 Practice", m:["quizzes.html","quiz.html","pretest.html","flashcards.html","exercise.html","repair-map.html"]},
    {href:"timeline.html",    label:"🛤️ Timeline", m:["timeline.html"]}
  ];
  var MORE=[
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
   "nav.top .wrap{display:flex;flex-wrap:wrap;gap:6px;align-items:center}"+
   "nav.top a{display:inline-block;text-decoration:none;color:var(--ink);font-weight:700;font-size:.82rem;padding:6px 11px;border-radius:6px;border:1px solid var(--line);background:#fff}"+
   "nav.top a:hover{border-color:var(--accent);color:var(--accent)}"+
   "nav.top a.home{background:var(--accent);color:#fff;border-color:var(--accent)}"+
   "nav.top a.here{background:var(--ink);color:#fff;border-color:var(--ink)}"+
   ".nav-more{position:relative;display:inline-block}"+
   ".nav-morebtn{font:inherit;font-weight:700;font-size:.82rem;padding:6px 11px;border-radius:6px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer}"+
   ".nav-morebtn:hover{border-color:var(--accent);color:var(--accent)}"+
   ".nav-morebtn.here{background:var(--ink);color:#fff;border-color:var(--ink)}"+
   ".nav-menu{position:absolute;top:118%;right:0;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.14);padding:6px;display:none;flex-direction:column;gap:3px;z-index:60;min-width:172px}"+
   ".nav-menu.open{display:flex}"+
   ".nav-menu a{white-space:nowrap;padding:8px 12px;border-radius:6px;text-decoration:none;color:var(--ink);font-weight:700;font-size:.86rem;border:0;background:transparent}"+
   ".nav-menu a:hover{background:#EAF0F2}"+
   ".nav-menu a.here{background:var(--ink);color:#fff}";
  document.head.appendChild(st);

  function here(m){return m.indexOf(cur)>=0;}
  var inMore=MORE.some(function(x){return x.href.toLowerCase()===cur;});

  var html='<div class="wrap">';
  html+='<a href="dashboard.html" onclick="if(history.length>1){history.back();return false}">← Back</a>';
  PRIMARY.forEach(function(p){
    var c=[]; if(p.cls)c.push(p.cls); if(here(p.m))c.push("here");
    html+='<a class="'+c.join(" ")+'" href="'+p.href+'">'+p.label+'</a>';
  });
  html+='<div class="nav-more"><button type="button" class="nav-morebtn'+(inMore?" here":"")+'" id="navMoreBtn">More ▾</button><div class="nav-menu" id="navMenu">';
  MORE.forEach(function(x){ html+='<a href="'+x.href+'"'+(x.href.toLowerCase()===cur?' class="here"':'')+'>'+x.label+'</a>'; });
  html+='</div></div></div>';

  var host=document.getElementById("site-nav");
  if(!host) return;
  host.innerHTML=html;

  var btn=document.getElementById("navMoreBtn"), menu=document.getElementById("navMenu");
  if(btn&&menu){
    btn.addEventListener("click",function(e){e.stopPropagation();menu.classList.toggle("open");});
    document.addEventListener("click",function(){menu.classList.remove("open");});
  }
})();
