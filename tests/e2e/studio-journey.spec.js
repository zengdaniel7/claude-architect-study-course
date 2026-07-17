const { test, expect } = require("@playwright/test");

const STUDIO = `${process.env.CCA_STUDIO_E2E_URL || "http://127.0.0.1:8765"}/`;
const answers = [2, 1, 0, 0, 0];

test("Studio completes W1 without copy and paste", async ({ page }) => {
  await page.goto(STUDIO);
  await page.getByRole("link", { name: "Continue lesson" }).click();

  await page.getByRole("button", { name: "I can point to each part" }).click();
  await page.locator("#draw-description").fill("Home folder to Documents, then study, then tiny-order.json.");
  await page.getByRole("button", { name: "Save my path" }).click();

  await page.getByRole("button", { name: "Open the practice workbench" }).click();
  await page.getByRole("button", { name: "Create the real file" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "tiny-order.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"item":"tea","quantity":2}')
  });
  await page.getByLabel("Full path").fill("/Users/me/Documents/study/tiny-order.json");
  await page.getByLabel("I used TextEdit’s plain-text mode.").check();
  await page.getByLabel("I created the final file myself on my Mac.").check();
  await page.getByRole("button", { name: "Save independent build" }).click();

  await page.locator("#teach-words").fill(
    "A file is one saved item. A folder holds files. A path shows each folder leading to the file. The .json extension and plain-text format tell software how to read it."
  );
  await page.getByRole("button", { name: "Save my teach-back" }).click();

  for (let index = 0; index < answers.length; index += 1) {
    await page.locator(".answer-list label").nth(answers[index]).click();
    await page.getByLabel("I know").check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await page.getByRole("button", { name: index === answers.length - 1 ? "Finish quiz" : "Next question" }).click();
  }

  await page.getByRole("button", { name: "Show answer" }).click();
  await page.getByLabel("Got it").check();
  await page.getByRole("button", { name: "Finish review" }).click();
  await expect(page.getByRole("heading", { name: "Files, folders, and plain text complete" })).toBeVisible();
  await expect(page.getByText("100% complete", { exact: true })).toBeVisible();
});

test("Studio reflows at Mac split-view widths", async ({ page }) => {
  for (const width of [800, 1024, 1262, 1440, 1728]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(STUDIO);
    const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(homeOverflow, `home overflow at ${width}px`).toBe(false);
    await expect(page.getByRole("main")).toBeVisible();

    await page.goto(`${STUDIO}#/session`);
    const lessonOverflow = await page.evaluate(() => {
      const frame = document.querySelector(".path-visual");
      return {
        document: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        pathFrame: frame ? frame.scrollWidth > frame.clientWidth + 1 : true
      };
    });
    expect(lessonOverflow.document, `lesson overflow at ${width}px`).toBe(false);
    expect(lessonOverflow.pathFrame, `path frame overflow at ${width}px`).toBe(false);
  }
});

test("Studio honors keyboard focus and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(STUDIO);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to lesson" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});
