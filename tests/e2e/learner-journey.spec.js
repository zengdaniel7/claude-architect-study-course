const base = require("@playwright/test");
const { expect } = base;

const test = base.test.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    await page.route(/\/my-progress\.json(?:\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ts":0,"data":{}}' }));
    await page.route(/\/__save(?:\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
    await use(page);
    expect(errors, "serious browser errors").toEqual([]);
  }
});

async function seed(page, values) {
  await page.addInitScript((items) => {
    for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
  }, values);
}

test("fresh learner starts at the first foundation lesson", async ({ page }) => {
  await page.goto("/dashboard.html");
  await expect(page.locator("#navBack")).toHaveCount(0);
  await expect(page.locator("#where-count")).toHaveText("0 / 23 units done");
  await expect(page.locator("#where-next")).toHaveText("Files, folders, and plain text");
  const pipeline = await page.evaluate(() => JSON.parse(localStorage.getItem("ccaf-pipeline")));
  expect(pipeline.unit).toBe("w1");

  const lessonLink = page.locator('#site-nav a[href="today.html"]');
  await expect(lessonLink).toHaveCount(1);
  await Promise.all([page.waitForURL(/\/today\.html$/), lessonLink.click()]);
  await expect(page.locator("#nexttitle")).toHaveText("Files, folders, and plain text");
});

test("established progress resumes at the correct lesson", async ({ page }) => {
  await seed(page, {
    "ccaf-curriculum": JSON.stringify({ done: { w1: true }, opened: {} }),
    "ccaf-everdone": JSON.stringify({ w1: true })
  });
  await page.goto("/today.html");
  await expect(page.locator("#nexttitle")).toHaveText("JSON by hand");
  await expect(page.locator("#unitsdone")).toContainText("1 / 23");
});

test("curriculum summaries match the shared course manifest", async ({ page }) => {
  await page.goto("/curriculum.html");
  const values = await page.evaluate(() => {
    const unit = CCAF_COURSE.map.o1;
    const row = document.querySelector("#u-o1");
    return {
      expectedTitle: unit.title,
      expectedGoal: unit.one,
      title: row.querySelector(".ttl").textContent,
      goal: row.querySelector(".one").textContent,
      tutorPrompt: row.querySelector("[data-q]").getAttribute("data-q"),
      expectedPrompt: unit.ask,
      quiz: row.querySelector(".qlink").getAttribute("href"),
      expectedQuiz: unit.quiz
    };
  });
  expect(values.title).toBe(values.expectedTitle);
  expect(values.goal).toBe(values.expectedGoal);
  expect(values.tutorPrompt).toBe(values.expectedPrompt);
  expect(values.quiz).toContain(values.expectedQuiz);
});

test("shared navigation and timeline completion work from the keyboard", async ({ page }) => {
  await page.goto("/timeline.html");
  await expect(page.locator("#navBack")).toHaveAttribute("href", "dashboard.html");
  await page.evaluate(() => {
    localStorage.setItem("ccaf-curriculum", JSON.stringify({ done: { w1: true }, opened: {} }));
  });
  await page.reload();

  const more = page.locator("#navMoreBtn");
  await more.focus();
  await more.press("ArrowDown");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.activeElement.closest("#navMenu") !== null)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toBeFocused();

  const unmark = page.getByRole("button", { name: /Un-mark Files, folders, and plain text as done/ });
  await unmark.focus();
  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), unmark.press("Enter")]);
  const done = await page.evaluate(() => JSON.parse(localStorage.getItem("ccaf-curriculum")).done);
  expect(done.w1).toBeUndefined();
});

test("notes boundaries and flashcard flip are accessible", async ({ page }) => {
  await page.goto("/notes.html?unit=w1");
  await expect(page.locator("#nprev")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#nprev")).not.toHaveAttribute("href", /.+/);
  await page.goto("/notes.html?unit=p2");
  await expect(page.locator("#nnext")).toHaveAttribute("aria-disabled", "true");

  await page.goto("/flashcards.html");
  await page.locator('a[href*="mode=browse"]').first().click();
  const card = page.locator("#bcard");
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await card.focus();
  await card.press("Enter");
  await expect(card).toHaveAttribute("aria-pressed", "true");
});

test("quiz scoring persists guesses without navigating away", async ({ page }) => {
  await page.goto("/quiz.html?unit=w1");
  const questions = page.locator("#quiz .card");
  const count = await questions.count();
  expect(count).toBeGreaterThanOrEqual(5);
  for (let index = 0; index < count; index += 1) {
    await questions.nth(index).locator('input[type="radio"]').first().check();
  }
  await questions.first().locator(".gg").check();
  await page.locator("#scoreBtn").click();
  await expect(page.locator("#results")).toBeVisible();
  await expect(page.locator("#results")).toBeFocused();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem("ccaf-quizdone")).w1);
  expect(result.total).toBe(count);
  expect(result.guessed).toBe(1);
});

test("a later practice retake does not revoke an earned zero-guess pass", async ({ page }) => {
  await seed(page, {
    "ccaf-quizdone": JSON.stringify({ w1: { score: 5, total: 5, guessed: 0, set: "earlier", ts: "earlier" } })
  });
  await page.goto("/quiz.html?unit=w1");
  const wrongAnswers = await page.evaluate(() => QLIST.map((question) => (question.ans + 1) % question.opts.length));
  for (let index = 0; index < wrongAnswers.length; index += 1) {
    await page.locator(`input[name="q${index}"][value="${wrongAnswers[index]}"]`).check();
  }
  await page.locator("#scoreBtn").click();
  const state = await page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem("ccaf-quizdone")).w1, quizOK: CCAF.mastery("w1").quizOK }));
  expect(state.saved.score).toBe(0);
  expect(state.saved.qualified).toMatchObject({ score: 5, total: 5, guessed: 0 });
  expect(state.quizOK).toBe(true);
});

test("build and teach-back save independent mastery evidence", async ({ page }) => {
  await page.goto("/exercise.html?id=file-map");
  const answers = page.locator("textarea.ans");
  for (let index = 0; index < await answers.count(); index += 1) {
    await answers.nth(index).fill(`My complete practice answer for field ${index + 1}.`);
  }
  await page.locator('input[name="mode"][value="independent"]').check();
  await page.locator("#btndone").click();
  await expect(page.locator("#finishmsg")).toContainText("Independent build evidence saved");
  let evidence = await page.evaluate(() => JSON.parse(localStorage.getItem("ccaf-evidence")));
  expect(evidence.w1.build.data.mode).toBe("independent");
  await page.locator("#btndone").click();
  evidence = await page.evaluate(() => JSON.parse(localStorage.getItem("ccaf-evidence")));
  expect(evidence.w1.build).toBeUndefined();
  expect(await page.evaluate(() => CCAF.getSteps("w1")[2])).toBe(false);
  await page.locator("#btndone").click();

  await page.goto("/teachback.html?unit=w1");
  await page.locator("#words").fill("A file holds information, a folder contains files, and a path tells the computer exactly where to find one.");
  const checks = page.locator("[data-r]");
  for (let index = 0; index < await checks.count(); index += 1) await checks.nth(index).check();
  await page.locator("#complete").click();
  await expect(page.locator("#status")).toContainText("Teach-back evidence saved");
  evidence = await page.evaluate(() => JSON.parse(localStorage.getItem("ccaf-evidence")));
  expect(evidence.w1.teachback.data.complete).toBe(true);
});

test("an optional legacy exercise cannot satisfy a lesson's required build", async ({ page }) => {
  await page.goto("/today.html");
  await page.evaluate(() => {
    localStorage.setItem("ccaf-evidence", JSON.stringify({ o1: { build: { data: { exercise: "gate-chain", mode: "independent", complete: true }, ts: Date.now() } } }));
  });
  expect(await page.evaluate(() => CCAF.mastery("o1").buildOK)).toBe(false);
});

test("review queue schedules a mistake card and announces completion", async ({ page }) => {
  await seed(page, {
    "ccaf-mistake-cards": JSON.stringify({
      one: { id: "one", unit: "w1", front: "What is a file?", back: "A named container for information.", source: "missed" }
    }),
    "ccaf-review": JSON.stringify(Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`concept-w1-${index}`, { due: Date.now() + 86_400_000 }])))
  });
  await page.goto("/review.html?unit=w1");
  await page.locator("#show").click();
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.locator("#done")).toContainText("Review complete");
  await expect(page.locator("#done")).toBeFocused();
  const schedule = await page.evaluate(() => JSON.parse(localStorage.getItem("ccaf-review")));
  expect(schedule.one.grade).toBe("good");
});

test("backup export works and malformed import changes nothing", async ({ page }) => {
  await page.goto("/dashboard.html");
  await page.evaluate(() => localStorage.setItem("ccaf-current", "keep"));
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#expBtn").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ccaf-progress-\d{4}-\d{2}-\d{2}\.json$/);

  await page.locator("#impFile").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"data":{"other":"bad"}}') });
  await expect(page.locator("#impStatus")).toContainText("not a valid CCA-F progress backup");
  expect(await page.evaluate(() => localStorage.getItem("ccaf-current"))).toBe("keep");
});

test("valid import is confirmed and unsafe resume links are ignored", async ({ page }) => {
  await page.goto("/dashboard.html");
  page.once("dialog", (dialog) => dialog.accept());
  const backup = {
    ts: Date.now(),
    data: {
      "ccaf-imported": "yes",
      "ccaf-last": JSON.stringify({ href: "javascript:alert(1)", label: "Unsafe", ts: Date.now() })
    }
  };
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.locator("#impFile").setInputFiles({ name: "progress.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) })
  ]);
  await page.waitForFunction(() => localStorage.getItem("ccaf-imported") === "yes");
  await expect(page.locator("#where-last")).toBeHidden();
});

test("@responsive key pages fit phone and desktop viewports", async ({ page }, testInfo) => {
  for (const path of ["/dashboard.html", "/today.html", "/timeline.html", "/curriculum.html", "/notes.html?unit=w1", "/quiz.html?unit=w1", "/exercise.html?id=file-map", "/teachback.html?unit=w1", "/review.html?unit=w1"]) {
    await page.goto(path);
    const layout = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const offenders = Array.from(document.querySelectorAll("body *")).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(), id: element.id, className: String(element.className || ""),
          left: Math.round(rect.left), right: Math.round(rect.right),
          clientWidth: element.clientWidth, scrollWidth: element.scrollWidth
        };
      }).filter((item) => item.left < -1 || item.right > width + 1 || item.scrollWidth > item.clientWidth + 1).slice(0, 8);
      return { overflow: document.documentElement.scrollWidth - width, offenders };
    });
    expect(layout.overflow, `${path} horizontal overflow in ${testInfo.project.name}: ${JSON.stringify(layout.offenders)}`).toBeLessThanOrEqual(1);
  }
});

test("200 percent zoom, long navigation text, and reduced motion stay usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("phone"), "200% zoom is covered at desktop width");
  await page.goto("/dashboard.html");
  await page.locator("#navMoreBtn").click();
  await page.locator("#navMenu a").first().evaluate((link) => { link.textContent = "A very long study destination name that must wrap without leaving the screen"; });
  await page.setViewportSize({ width: 640, height: 720 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/foundation-lab.html?unit=w1");
  await expect(page.locator("[data-read-text] .read-word").first()).not.toHaveAttribute("aria-hidden", "true");
});
