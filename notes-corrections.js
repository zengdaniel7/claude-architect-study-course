/* Current-product corrections applied after the compact generated notes file loads. */
(function(){
  var notes=window.LESSON_NOTES;
  if(!notes)return;

  function replaceEvery(text,from,to){return String(text).split(from).join(to);}
  function revise(id,replacements){
    var note=notes[id];
    if(!note)return;
    replacements.forEach(function(pair){note.html=replaceEvery(note.html,pair[0],pair[1]);});
  }

  revise("a1",[
    ["the model's short-term memory. It is how much text the model can hold at one time.","the model's limited working input space. It is how much text the model can use at one time; it is not durable memory."],
    ["the model's short-term memory; text beyond it cannot be used.","the model's limited working input space; text beyond the limit cannot be used in that request."]
  ]);

  revise("o1",[
    ["tool_use = continue, end_turn = done","tool_use = run the requested tool, end_turn = natural completion; handle every other value explicitly"],
    ["tool_use = keep going, end_turn = done","tool_use = run the requested tool, end_turn = natural completion; handle every other value explicitly"]
  ]);

  revise("m3",[
    ["The shape is guaranteed, not left to luck.","On a normally completed response, the output follows the schema. Refusals and token cutoffs still need their own branch."],
    ["Structured Outputs makes sure the reply always fits it — no missing braces.","A normally completed Structured Outputs reply fits it — no missing braces."],
    ["do NOT guarantee valid JSON. Only constrained decoding guarantees the shape.","do NOT enforce valid JSON. Constrained decoding enforces the shape on a normally completed response; handle refusals and truncation separately."],
    ["a feature that guarantees valid JSON via constrained decoding.","a feature that constrains normally completed responses to schema-valid JSON."],
    ["forcing the model's output to fit a schema so it is always valid.","constraining a normally completed response to fit a schema; refusals and truncation need separate handling."],
    ["Only Structured Outputs (constrained decoding) guarantees the reply fits your schema.","Structured Outputs constrains normal responses to fit your schema; refusal and truncation paths still need handling."]
  ]);

  revise("m1",[
    ["locking the shape during generation so JSON is always valid","constraining the shape during normal generation; refusals and truncation still need handling"],
    ["Only Structured Outputs (constrained decoding) guarantees it.","Structured Outputs constrains it on normal completion; handle refusals and truncation separately."]
  ]);

  revise("o4",[
    ["a file of project rules Claude re-reads every request.","scoped project instructions Claude Code loads for a session. The file is not a secret store, and its content can be re-injected after compaction."],
    ["a saved prompt you run by its /name.","a compatibility form for a saved workflow. Current Claude Code presents commands and Skills together."]
  ]);

  revise("rel",[
    ["the model's short-term memory. It only holds so much text at once. Extra text falls out.","the model's limited working input space, not durable memory. It can use only the text kept inside that space."],
    ["forces the shape of the JSON, so it is always valid JSON.","constrains a normally completed response to the JSON shape. Refusals and truncated outputs still need separate handling."],
    ["The scratchpad is the safety net. Chat is temporary; the file is the memory.","A file helps only when the application writes progress and deliberately reads it again; saving and resuming are not automatic."],
    ["files that hold progress and facts so an agent can resume","files that can hold progress and facts when the application writes and reloads them"]
  ]);

  revise("p1",[
    ["tool_use = continue, end_turn = done","tool_use = run the requested tool, end_turn = natural completion; handle every other value explicitly"],
    ["tool_use = keep going, end_turn = done","tool_use = run the requested tool, end_turn = natural completion; handle every other value explicitly"]
  ]);

  revise("p2",[
    ["Structured Outputs (constrained decoding) is the reliable way to guarantee the JSON is valid — but you STILL validate it and retry with the specific error","Structured Outputs (constrained decoding) reliably enforces the JSON shape on normal completion — but you STILL handle refusals or truncation, validate meaning, and retry with the specific error"]
  ]);

  if(notes.p1){
    notes.p1.title="Production scenarios";
    notes.p1.html=replaceEvery(
      notes.p1.html,
      "The exam gives you <b>scenarios</b>",
      "Reported exam descriptions use <b>production scenarios</b>"
    );
  }
})();
