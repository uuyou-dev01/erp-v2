import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createWorker, OEM } from "tesseract.js";

const fixtureRoot = process.env.ERP_RUNTIME_FIXTURE_DIR;
if (!fixtureRoot) throw new Error("ERP_RUNTIME_FIXTURE_DIR is required");

const languages = ["chi_sim", "jpn", "eng"];
for (const language of languages) {
  const fixture = path.join(fixtureRoot, `${language}.png`);
  await fs.access(fixture);
  const worker = await createWorker(language, OEM.LSTM_ONLY, {
    langPath: path.join(process.cwd(), "node_modules", "@tesseract.js-data", language, "4.0.0"),
    gzip: true,
    workerPath: path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"),
  });
  try {
    const result = await worker.recognize(fixture);
    const text = result.data.text.trim();
    if (!text) throw new Error(`${language} OCR returned empty text`);
    process.stdout.write(`${language}: confidence=${result.data.confidence.toFixed(2)} text=${JSON.stringify(text.slice(0, 80))}\n`);
  } finally {
    await worker.terminate();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent("<h1>ERP runtime ready</h1>");
  const text = await page.locator("h1").textContent();
  if (text !== "ERP runtime ready") throw new Error("Chromium content verification failed");
  process.stdout.write("chromium: ok\n");
} finally {
  await browser.close();
}
