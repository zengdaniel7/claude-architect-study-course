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
