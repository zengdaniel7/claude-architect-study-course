/* Shared compact top nav for all CCA-F study pages.
   Usage on a page:  <nav class="top" id="site-nav"></nav><script src="nav.js"></script>
   5 primary tabs + a "More ▾" menu. Auto-highlights the current page. */
(function(){
  var PRIMARY=[
    {href:"dashboard.html",   label:"🏠 Home",     cls:"home", m:["dashboard.html",""]},
    {href:"today.html",       label:"▶️ Today",    m:["today.html"]},
    {href:"curriculum.html",  label:"📚 Learn",    m:["curriculum.html"]},
    {href:"quizzes.html",     label:"🎯 Practice", m:["quizzes.html","quiz.html","pretest.html","flashcards.html","exercise.html","repair-map.html"]},
    {href:"timeline.html",    label:"🛤️ Timeline", m:["timeline.html"]}
  ];
  var MORE=[
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
