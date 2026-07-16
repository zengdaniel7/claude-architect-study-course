(function(global){
  "use strict";

  var RATE_KEY="ccaf-read-aloud-rate";

  function formatTime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return "0:00";
    var whole=Math.floor(seconds),minutes=Math.floor(whole/60),rest=String(whole%60).padStart(2,"0");
    return minutes+":"+rest;
  }
  function preferredVoice(){
    if(!global.speechSynthesis)return null;
    var voices=global.speechSynthesis.getVoices().filter(function(voice){return /^en\b/i.test(voice.lang||"");});
    var preferred=[/Ava/i,/Samantha/i,/Alex/i,/Aria/i,/Google US English/i];
    for(var i=0;i<preferred.length;i++){
      var match=voices.find(function(voice){return preferred[i].test(voice.name);});
      if(match)return match;
    }
    return voices[0]||null;
  }
  function splitWords(text){
    var chunks=String(text||"").match(/\S+\s*/g)||[];
    var cursor=0;
    return chunks.map(function(chunk){
      var word=chunk.trimEnd(),start=cursor;
      cursor+=chunk.length;
      return {text:word,space:chunk.slice(word.length),start:start,end:start+word.length};
    });
  }
  function wordWeight(word){
    var letters=(word.text.match(/[A-Za-z0-9]/g)||[]).length;
    var weight=1+Math.sqrt(Math.max(1,letters))*.36;
    if(/[,;:]$/.test(word.text))weight+=.55;
    if(/[.!?]$/.test(word.text))weight+=1.05;
    return weight;
  }

  function mount(options){
    var root=options&&options.root;
    if(!root)return null;
    var text=String(options.text||"").trim();
    var transcript=root.querySelector("[data-read-text]");
    var audio=root.querySelector("[data-read-audio]");
    var play=root.querySelector("[data-read-play]");
    var restart=root.querySelector("[data-read-restart]");
    var speed=root.querySelector("[data-read-speed]");
    var progress=root.querySelector("[data-read-progress]");
    var time=root.querySelector("[data-read-time]");
    var status=root.querySelector("[data-read-status]");
    if(!transcript||!audio||!play||!restart||!speed||!progress)return null;

    var reduceMotion=!!(global.matchMedia&&global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var words=splitWords(text),spans=[],timings=[],active=-1,frame=0,fallback=false,fallbackState="idle",utterance=null;
    transcript.textContent="";
    words.forEach(function(word,index){
      var span=document.createElement("span");
      span.className="read-word";
      span.dataset.word=String(index);
      span.textContent=word.text;
      transcript.appendChild(span);
      if(word.space)transcript.appendChild(document.createTextNode(word.space));
      spans.push(span);
    });

    function announce(message){if(status)status.textContent=message;}
    function setActive(index){
      if(reduceMotion)index=-1;
      if(index===active)return;
      if(spans[active])spans[active].classList.remove("is-active");
      active=index;
      if(spans[active])spans[active].classList.add("is-active");
    }
    function buildTimings(){
      if(!Number.isFinite(audio.duration)||audio.duration<=0)return;
      var weights=words.map(wordWeight),total=weights.reduce(function(sum,value){return sum+value;},0),cursor=0;
      timings=weights.map(function(weight){
        var start=cursor;
        cursor+=(weight/total)*audio.duration;
        return {start:start,end:cursor};
      });
    }
    function highlightAt(seconds){
      if(!timings.length)buildTimings();
      var index=timings.findIndex(function(mark){return seconds>=mark.start&&seconds<mark.end;});
      if(index<0&&timings.length&&seconds>=timings[timings.length-1].end-.08)index=timings.length-1;
      setActive(index);
    }
    function updateClock(){
      var duration=Number.isFinite(audio.duration)?audio.duration:0;
      if(time)time.textContent=formatTime(audio.currentTime)+" / "+formatTime(duration);
      progress.value=duration?String(Math.round(audio.currentTime/duration*1000)):"0";
      if(audio.currentTime===0&&audio.paused)setActive(-1);
      else highlightAt(audio.currentTime);
    }
    function animationLoop(){
      updateClock();
      if(!reduceMotion&&!audio.paused&&!audio.ended)frame=global.requestAnimationFrame(animationLoop);
    }
    function setPlayLabel(label,icon){
      play.innerHTML='<span aria-hidden="true">'+icon+'</span> '+label;
      play.setAttribute("aria-label",label+" narration");
    }
    function markIdle(){setPlayLabel(audio.currentTime>0&&!audio.ended?"Resume":"Listen","▶");}
    function findWordForCharacter(charIndex){
      for(var i=words.length-1;i>=0;i--)if(charIndex>=words[i].start)return i;
      return 0;
    }
    function speakFallback(restartFromBeginning){
      if(!global.speechSynthesis||!global.SpeechSynthesisUtterance){announce("Read-aloud is not available in this browser.");return;}
      if(fallbackState==="playing"&&!restartFromBeginning){
        global.speechSynthesis.pause();fallbackState="paused";setPlayLabel("Resume","▶");announce("Narration paused.");return;
      }
      if(fallbackState==="paused"&&!restartFromBeginning){
        global.speechSynthesis.resume();fallbackState="playing";setPlayLabel("Pause","Ⅱ");announce("Narration resumed.");return;
      }
      global.speechSynthesis.cancel();setActive(-1);
      utterance=new global.SpeechSynthesisUtterance(text);
      utterance.rate=Number(speed.value)||1;
      var voice=preferredVoice();if(voice)utterance.voice=voice;
      utterance.onboundary=function(event){if(event.name==="word"||Number.isFinite(event.charIndex))setActive(findWordForCharacter(event.charIndex||0));};
      utterance.onstart=function(){fallbackState="playing";setPlayLabel("Pause","Ⅱ");announce("Narration playing at "+speed.value+" times speed.");};
      utterance.onend=function(){fallbackState="idle";setActive(-1);setPlayLabel("Listen","▶");announce("Narration complete.");};
      utterance.onerror=function(){fallbackState="idle";setActive(-1);setPlayLabel("Listen","▶");announce("Read-aloud could not start.");};
      global.speechSynthesis.speak(utterance);
    }

    try{
      var stored=global.localStorage.getItem(RATE_KEY);
      if(stored&&Array.from(speed.options).some(function(option){return option.value===stored;}))speed.value=stored;
    }catch(error){}
    audio.addEventListener("loadedmetadata",function(){buildTimings();updateClock();});
    audio.addEventListener("timeupdate",function(){if(reduceMotion)updateClock();});
    audio.addEventListener("play",function(){
      global.cancelAnimationFrame(frame);setPlayLabel("Pause","Ⅱ");announce("Narration playing at "+speed.value+" times speed.");if(reduceMotion)updateClock();else animationLoop();
    });
    audio.addEventListener("pause",function(){global.cancelAnimationFrame(frame);updateClock();if(!audio.ended)markIdle();});
    audio.addEventListener("ended",function(){global.cancelAnimationFrame(frame);updateClock();setActive(-1);setPlayLabel("Listen","▶");announce("Narration complete.");});
    audio.addEventListener("error",function(){fallback=true;progress.disabled=true;announce("Using this device's best English voice.");});

    play.addEventListener("click",function(){
      if(fallback){speakFallback(false);return;}
      if(audio.paused){
        if(audio.ended)audio.currentTime=0;
        audio.play().catch(function(){fallback=true;speakFallback(true);});
      }else audio.pause();
    });
    restart.addEventListener("click",function(){
      if(fallback){speakFallback(true);return;}
      audio.currentTime=0;setActive(0);audio.play().catch(function(){fallback=true;speakFallback(true);});
    });
    speed.addEventListener("change",function(){
      audio.playbackRate=Number(speed.value)||1;
      try{global.localStorage.setItem(RATE_KEY,speed.value);}catch(error){}
      announce("Speed set to "+speed.value+" times.");
      if(fallback&&fallbackState!=="idle")speakFallback(true);
    });
    progress.addEventListener("input",function(){
      if(!Number.isFinite(audio.duration))return;
      audio.currentTime=(Number(progress.value)/1000)*audio.duration;updateClock();
    });
    audio.preload="metadata";
    audio.src=options.src;
    audio.playbackRate=Number(speed.value)||1;
    if(audio.readyState>=1){buildTimings();updateClock();}
    global.addEventListener("pagehide",function(){audio.pause();if(global.speechSynthesis)global.speechSynthesis.cancel();});
    return {audio:audio,destroy:function(){audio.pause();global.cancelAnimationFrame(frame);}};
  }

  global.CCAFReadAloud={mount:mount};
})(window);
