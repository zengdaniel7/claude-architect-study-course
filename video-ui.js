/* Shared dyslexia-friendly media renderer. Load after course-data.js and video-data.js. */
(function(){
  function esc(value){return String(value==null?"":value).replace(/[&<>\"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function time(seconds){
    seconds=Math.max(0,Number(seconds)||0);
    var h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=Math.floor(seconds%60);
    return (h?h+":"+String(m).padStart(2,"0"):String(m))+":"+String(s).padStart(2,"0");
  }
  function authorityLabel(authority){
    return authority==="official"?"Official source":authority==="local"?"Course visual":authority==="community"?"Community video":"Extra source";
  }
  function resolved(item){return window.CCAF_MEDIA?CCAF_MEDIA.resolve(item):item;}
  function externalAttrs(url){return /^https?:/i.test(url||"")?' target="_blank" rel="noopener"':"";}

  function resourceCard(item,role){
    var label=authorityLabel(item.authority);
    var verb=item.authority==="local"?"Open visual lesson":item.authority==="official"?"Open official lesson":"Open source";
    return '<article class="media-card media-resource">'+
      '<div class="media-copy"><div class="media-meta"><span class="source-badge '+esc(item.authority)+'">'+esc(label)+'</span>'+
      (role?'<span class="media-role">'+esc(role)+'</span>':"")+'</div>'+
      '<h3>'+esc(item.title)+'</h3>'+(item.focus?'<p>'+esc(item.focus.replace(/^Focus:\s*/,""))+'</p>':"")+
      '<div class="media-actions"><a class="media-btn primary" href="'+esc(item.url)+'"'+externalAttrs(item.url)+'>'+verb+'</a></div></div></article>';
  }

  function clipCard(item,role){
    var clipLength=item.endSec-item.startSec;
    var title=(item.number&&item.number!=="?"?"Episode "+item.number+" · ":"")+item.title;
    return '<article class="media-card media-video">'+
      '<a class="media-thumb" href="'+esc(item.url)+'" target="_blank" rel="noopener" aria-label="Watch '+esc(title)+' lesson clip">'+
        '<img src="'+esc(item.thumbnail)+'" alt="Video thumbnail for '+esc(title)+'" loading="lazy" width="480" height="360">'+
        '<span class="media-play" aria-hidden="true">▶</span></a>'+
      '<div class="media-copy"><div class="media-meta"><span class="source-badge community">Community video</span>'+
        (role?'<span class="media-role">'+esc(role)+'</span>':"")+'<span>'+esc(time(item.startSec)+"–"+time(item.endSec))+'</span><span>'+esc(time(clipLength))+' clip</span></div>'+
      '<h3>'+esc(title)+'</h3><p><b>Focus:</b> '+esc(item.focus)+'</p>'+
      '<p class="community-line">'+esc(CCAF_MEDIA.communityNotice)+'</p>'+
      (item.note?'<div class="media-note"><b>Full episode note:</b> '+esc(item.note)+'</div>':"")+
      '<div class="media-actions">'+
        '<a class="media-btn primary" href="'+esc(item.url)+'" target="_blank" rel="noopener">▶ Watch '+esc(time(clipLength))+' clip</a>'+
        '<a class="media-btn secondary" href="'+esc(item.fullUrl)+'" target="_blank" rel="noopener">Full episode · '+esc(time((CCAF_MEDIA.episodes[item.episodeKey]||{}).durationSec))+'</a>'+
      '</div></div></article>';
  }

  function card(item,role){
    item=resolved(item);if(!item)return "";
    return item.type==="clip"?clipCard(item,role):resourceCard(item,role);
  }

  function referenceLinks(items){
    if(!items||!items.length)return "";
    return '<details class="media-references"><summary>Official and supporting sources</summary><div class="media-reference-list">'+
      items.map(function(raw){var item=resolved(raw);return '<a href="'+esc(item.url)+'"'+externalAttrs(item.url)+'><span>'+esc(authorityLabel(item.authority))+'</span>'+esc(item.title)+'</a>';}).join("")+
      '</div></details>';
  }

  function lessonHTML(unitId,options){
    options=options||{};
    var lesson=window.CCAF_MEDIA&&CCAF_MEDIA.lessons[unitId];
    if(!lesson)return '<p class="hint">Open this lesson\'s visual and notes.</p>';
    var optional=lesson.optional?'<details class="media-optional"><summary>Optional second explanation</summary>'+card(lesson.optional,"Optional")+'</details>':"";
    var flow=options.hideFlow?"":'<nav class="media-flow" aria-label="Lesson learning order">'+
      '<span class="flow-step active">1 · Watch</span><span aria-hidden="true">→</span>'+
      '<a class="flow-step" href="notes.html?unit='+esc(unitId)+'">2 · Notes</a><span aria-hidden="true">→</span>'+
      '<a class="flow-step" href="review.html?unit='+esc(unitId)+'">3 · Review notes</a></nav>';
    return '<section class="lesson-media'+(options.compact?' compact':'')+'" aria-label="Watch before reading">'+
      '<div class="media-heading"><div><span class="eyebrow">Watch first</span><h2>'+(options.title?esc(options.title):"This lesson's visual source")+'</h2></div>'+
      '<a class="library-link" href="video-library.html?lesson='+esc(unitId)+'">All reviewed videos</a></div>'+flow+
      card(lesson.primary,"Primary")+optional+(options.showReferences===false?"":referenceLinks(lesson.references))+'</section>';
  }

  function inlineHTML(unitId){
    var lesson=window.CCAF_MEDIA&&CCAF_MEDIA.lessons[unitId];if(!lesson)return "";
    function one(raw,label){
      var item=resolved(raw);if(!item)return "";
      if(item.type!=="clip")return '<a class="vid" href="'+esc(item.url)+'"'+externalAttrs(item.url)+'>'+esc(label+": "+item.title)+'</a>';
      return '<span class="media-inline-item"><a class="vid" href="'+esc(item.url)+'" target="_blank" rel="noopener">▶ '+esc(label+" clip "+time(item.startSec)+"–"+time(item.endSec))+'</a><a class="full-inline" href="'+esc(item.fullUrl)+'" target="_blank" rel="noopener">Full episode</a></span>';
    }
    return '<div class="media-inline">'+one(lesson.primary,"Primary")+one(lesson.optional,"Optional")+
      '<a class="full-inline" href="video-library.html?lesson='+esc(unitId)+'">Video details</a></div>';
  }

  window.CCAFMediaUI={formatTime:time,resolve:resolved,cardHTML:card,lessonHTML:lessonHTML,inlineHTML:inlineHTML,esc:esc};
})();
