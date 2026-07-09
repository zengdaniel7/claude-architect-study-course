/* Shared compact top nav for all CCA-F study pages.
   Usage on a page:  <nav class="top" id="site-nav"></nav><script src="nav.js"></script>
   5 primary tabs + a "More ▾" menu. Auto-highlights the current page. */

/* ---- progress file-sync (runs on every page, localhost only) ----
   Mirrors every ccaf-* localStorage change into my-progress.json on disk
   (via serve.py) and restores from that file when the browser copy is
   missing or older — clearing browser data can no longer lose progress.
   On the hosted site this whole block stays inactive (browser-only saves). */
(function(){
  var LOCAL=(location.hostname==="localhost"||location.hostname==="127.0.0.1");
  window.CCAF_SYNC={mode:LOCAL?"probing":"pages",ts:0};
  function snap(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
    if(k&&k.indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")d[k]=localStorage.getItem(k);}return d;}
  window.CCAF_SYNC.snapshot=snap;
  if(!LOCAL)return;
  function announce(m){window.CCAF_SYNC.mode=m;
    try{document.dispatchEvent(new CustomEvent("ccaf-sync-mode"));}catch(e){}}
  // 1) restore from the file BEFORE page scripts read localStorage.
  //    Synchronous request on purpose: local + tiny = instant, and the page's
  //    own scripts (which run right after this file) must see restored state.
  try{
    var x=new XMLHttpRequest();
    x.open("GET","my-progress.json?nocache="+Date.now(),false);x.send(null);
    if(x.status===200){
      var f=JSON.parse(x.responseText);
      var mine=parseInt(localStorage.getItem("ccaf-sync-ts")||"0",10);
      if(f&&f.data&&typeof f.ts==="number"&&f.ts>mine){
        for(var k in f.data){try{localStorage.setItem(k,f.data[k]);}catch(e){}}
        try{localStorage.setItem("ccaf-sync-ts",String(f.ts));}catch(e){}
      }
    }
  }catch(e){}
  // 2) push every ccaf-* change to disk (debounced), plus once on load to seed the file
  var t=null;
  function push(){clearTimeout(t);t=setTimeout(function(){
    var ts=Date.now();
    fetch("/__save",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ts:ts,data:snap()})})
    .then(function(r){
      if(r.ok){try{localStorage.setItem("ccaf-sync-ts",String(ts));}catch(e){}
        window.CCAF_SYNC.ts=ts;announce("file");}
      else{announce("nofile");}
    }).catch(function(){announce("nofile");});
  },400);}
  // Storage objects turn direct property writes into stored items, so the
  // hook must go on Storage.prototype, not on localStorage itself.
  try{
    var proto=Object.getPrototypeOf(localStorage);
    var set0=proto.setItem,rm0=proto.removeItem;
    function touched(){
      // local state is now the newest truth — an older file must never clobber it on a later load
      try{set0.call(localStorage,"ccaf-sync-ts",String(Date.now()));}catch(e){}
      push();
    }
    proto.setItem=function(k,v){set0.apply(this,arguments);
      if(this===localStorage&&String(k).indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")touched();};
    proto.removeItem=function(k){rm0.apply(this,arguments);
      if(this===localStorage&&String(k).indexOf("ccaf-")===0&&k!=="ccaf-sync-ts")touched();};
    // navigating right after a click must not lose the click: flush the snapshot as the page unloads
    window.addEventListener("pagehide",function(){
      try{
        var ts=Date.now();
        var ok=navigator.sendBeacon&&navigator.sendBeacon("/__save",new Blob([JSON.stringify({ts:ts,data:snap()})],{type:"application/json"}));
        if(ok){try{set0.call(localStorage,"ccaf-sync-ts",String(ts));}catch(e){}}
      }catch(e){}
    });
  }catch(e){}
  push();
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
  var ORDER=["o1","a1","a2","m3","m1","m2","m4","o3","o4","o2","rel","t1","t2","p1","px","p2"];
  var TITLES={o1:"The Agent Loop",a1:"Core vocabulary",a2:"Model physics & economics",m3:"Prompt techniques",m1:"A structured-output call",m2:"One tool call",m4:"Built-in tools",o3:"An MCP server",o4:"Claude Code workflows",o2:"Orchestrator–Workers",rel:"Reliability, context & evals",t1:"Support-agent system",t2:"Research multi-agent system",p1:"The 6 exam scenarios",px:"Anti-patterns & decision frameworks",p2:"Capstone: PR-review pipeline"};
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
  window.CCAF={ORDER:ORDER,TITLES:TITLES,cur:cur,today:tod,getSteps:getSteps,setStep:setStep,stepsFor:stepsFor,syncPipeline:syncPipeline};
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
   "nav.top{position:sticky;top:0;z-index:40;background:rgba(251,246,236,.96);border-bottom:2px solid var(--line);padding:10px 0}"+
   "nav.top .wrap{display:flex;flex-wrap:wrap;gap:6px;align-items:center}"+
   "nav.top a{display:inline-block;text-decoration:none;color:var(--ink);font-weight:700;font-size:.82rem;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:#fff}"+
   "nav.top a:hover{border-color:var(--accent);color:var(--accent)}"+
   "nav.top a.home{background:var(--accent);color:#fff;border-color:var(--accent)}"+
   "nav.top a.here{background:var(--ink);color:#fff;border-color:var(--ink)}"+
   ".nav-more{position:relative;display:inline-block}"+
   ".nav-morebtn{font:inherit;font-weight:700;font-size:.82rem;padding:6px 11px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--ink);cursor:pointer}"+
   ".nav-morebtn:hover{border-color:var(--accent);color:var(--accent)}"+
   ".nav-morebtn.here{background:var(--ink);color:#fff;border-color:var(--ink)}"+
   ".nav-menu{position:absolute;top:118%;right:0;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.14);padding:6px;display:none;flex-direction:column;gap:3px;z-index:60;min-width:172px}"+
   ".nav-menu.open{display:flex}"+
   ".nav-menu a{white-space:nowrap;padding:8px 12px;border-radius:9px;text-decoration:none;color:var(--ink);font-weight:700;font-size:.86rem;border:0;background:transparent}"+
   ".nav-menu a:hover{background:#F3EBDA}"+
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
