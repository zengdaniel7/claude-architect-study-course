import { CheckCircle2, FileCheck2, FolderOpen, MonitorUp, ShieldCheck } from "../icons";
import { lazy, Suspense, type ChangeEvent, useMemo, useState } from "react";
import { useStudio } from "../StudioContext";
import { Button } from "../components/atoms/Button";
import { useSceneFocus } from "../useSceneFocus";

const CodeEditor = lazy(() => import("../components/organisms/CodeEditor").then((module) => ({ default: module.CodeEditor })));

const STARTER = `{
  "item": "tea",
  "quantity": 2
}`;

type BuildPart = "bridge" | "practice" | "mac";

export function BuildStage() {
  const { saving, completeStage, demo } = useStudio();
  const [part, setPart] = useState<BuildPart>("bridge");
  useSceneFocus(`build-${part}`);
  const [code, setCode] = useState(STARTER);
  const [practiceMessage, setPracticeMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileError, setFileError] = useState("");
  const [path, setPath] = useState("");
  const [plainText, setPlainText] = useState(false);
  const [independent, setIndependent] = useState(false);

  const practiceValid = useMemo(() => {
    try { JSON.parse(code); return true; } catch { return false; }
  }, [code]);
  const fileValid = fileName === "tiny-order.json" && fileText.trim().length > 0;
  const pathValid = path.trim().endsWith("tiny-order.json") && path.includes("/");
  const ready = fileValid && pathValid && plainText && independent;

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError("");
    setFileName(file.name);
    // The local server rejects bodies over 1 MB; tiny-order.json is a few lines.
    if (file.size > 200_000) {
      setFileText("");
      setFileError("That file is too big to be tiny-order.json. Choose the small file you saved in TextEdit.");
      return;
    }
    try {
      setFileText(await file.text());
    } catch {
      setFileText("");
      setFileError("That file could not be read. Choose it again.");
    }
  }

  if (part === "bridge") {
    return (
      <section className="lesson-scene" aria-labelledby="build-bridge-title">
        <div className="scene-heading">
          <span className="eyebrow">Build 1 of 3</span>
          <h1 id="build-bridge-title">Today you are learning the file, not JSON punctuation</h1>
          <p>W2 teaches JSON. For this task, the contents are already written correctly so you can focus on saving a <b>plain-text file</b> with the right name and location.</p>
        </div>
        <div className="concept-strip" aria-label="What this build teaches">
          <span><FolderOpen size={22} aria-hidden="true" /><b>Folder</b><small>where it lives</small></span>
          <span><FileCheck2 size={22} aria-hidden="true" /><b>File name</b><small>tiny-order.json</small></span>
          <span><ShieldCheck size={22} aria-hidden="true" /><b>Plain text</b><small>no hidden formatting</small></span>
        </div>
        <section className="plain-callout">
          <h2>No blank fields</h2>
          <p>You do not need to replace <code>____</code> with anything. The complete practice content appears in the next step.</p>
        </section>
        <div className="scene-actionbar">
          <p>Next, inspect a working example before creating the real file.</p>
          <Button kind="primary" onClick={() => setPart("practice")}>Open the practice workbench</Button>
        </div>
      </section>
    );
  }

  if (part === "practice") {
    return (
      <section className="lesson-scene lesson-scene--workbench" aria-labelledby="practice-title">
        <div className="scene-heading">
          <span className="eyebrow">Build 2 of 3</span>
          <h1 id="practice-title">Inspect one complete text file</h1>
          <p>The editor is a safe practice area. The braces and quotes will be explained in W2.</p>
        </div>
        <Suspense fallback={<div className="editor-loading" role="status">Opening the practice editor…</div>}>
          <CodeEditor value={code} onChange={setCode} label="Practice JSON text" />
        </Suspense>
        <div className={`validation-line ${practiceValid ? "validation-line--ok" : "validation-line--repair"}`} role="status">
          {practiceValid ? <CheckCircle2 size={21} aria-hidden="true" /> : <ShieldCheck size={21} aria-hidden="true" />}
          <span>{practiceMessage || (practiceValid ? "This is valid plain-text JSON." : "The practice text needs repair. Use Reset to restore it.")}</span>
        </div>
        <div className="support-row">
          <Button kind="quiet" onClick={() => { setCode(STARTER); setPracticeMessage("The complete example is restored."); }}>Reset example</Button>
          <Button onClick={() => setPracticeMessage(practiceValid ? "Check passed. W1 only grades the file name, location, and plain-text format." : "Check failed. Reset the example before continuing.")}>Check practice text</Button>
        </div>
        <div className="scene-actionbar">
          <p>The real task happens in TextEdit on your Mac.</p>
          <Button kind="primary" disabled={!practiceValid} onClick={() => setPart("mac")}>Create the real file</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="lesson-scene lesson-scene--workbench" aria-labelledby="mac-build-title">
      <div className="scene-heading">
        <span className="eyebrow">Build 3 of 3</span>
        <h1 id="mac-build-title">Create and verify the file on your Mac</h1>
        <p>Use TextEdit in plain-text mode. Save the file as <b>tiny-order.json</b> inside your study folder.</p>
      </div>

      <ol className="mac-steps">
        <li><span>1</span><div><b>Open TextEdit</b><p>Choose Format → Make Plain Text.</p></div></li>
        <li><span>2</span><div><b>Use the complete practice text</b><p>Type it yourself or refer back to the workbench.</p></div></li>
        <li><span>3</span><div><b>Save the exact name</b><p>Use <code>tiny-order.json</code>, not <code>tiny-order.json.txt</code>.</p></div></li>
      </ol>

      <div className="verification-grid">
        <label className="file-picker">
          <MonitorUp size={24} aria-hidden="true" />
          <span><b>Choose the file you made</b><small>The browser checks its name and contents locally.</small></span>
          <input type="file" accept=".json,text/plain,application/json" onChange={chooseFile} />
        </label>
        <div className={`check-result ${fileValid ? "check-result--ok" : ""}`}>
          <span>File check</span><strong>{fileName || "No file chosen"}</strong><small>{fileError ? fileError : fileValid ? "Exact name and readable text found" : "Choose tiny-order.json"}</small>
        </div>
      </div>

      <label className="field-group" htmlFor="full-path">
        <span><b>Full path</b> — type the folders and file name.</span>
        <input id="full-path" value={path} onChange={(event) => setPath(event.target.value)} placeholder="/Users/your-name/Documents/study/tiny-order.json" />
        <small>{path && !pathValid ? "End the path with /tiny-order.json." : "Example: /Users/name/Documents/study/tiny-order.json"}</small>
      </label>

      <div className="evidence-checks">
        <label><input type="checkbox" checked={plainText} onChange={(event) => setPlainText(event.target.checked)} /> I used TextEdit’s plain-text mode.</label>
        <label><input type="checkbox" checked={independent} onChange={(event) => setIndependent(event.target.checked)} /> I created the final file myself on my Mac.</label>
      </div>

      <div className="scene-actionbar">
        <p>{ready ? "All four independent-build checks passed." : "Choose the file, enter its path, and confirm both checks."}</p>
        <Button kind="primary" disabled={!ready || saving} onClick={() => void completeStage("build", { fileName, fileText, path, plainText, independent, practiceValid })}>{saving ? demo ? "Checking…" : "Saving…" : demo ? "Check independent build" : "Save independent build"}</Button>
      </div>
    </section>
  );
}
