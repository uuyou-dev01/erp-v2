import path from "node:path";
import { mkdir } from "node:fs/promises";
import { createWorker, OEM, PSM } from "tesseract.js";
import { withRuntimeSlot } from "@/lib/runtime/semaphore";

function languageData(language: "chi_sim" | "jpn" | "eng") {
  return {
    code: language,
    gzip: true,
    langPath: path.join(process.cwd(), "node_modules", "@tesseract.js-data", language, "4.0.0"),
  };
}

export interface OcrCandidate {
  value: string;
  confidence: number;
  evidence: string;
}

export async function recognizeCaptureImage(
  image: Buffer,
  language: "chi_sim" | "jpn" | "eng" = "chi_sim"
) {
  return withRuntimeSlot({
    name: "ocr",
    concurrencyEnv: "OCR_CONCURRENCY",
    timeoutEnv: "OCR_QUEUE_TIMEOUT_MS",
    defaultTimeoutMs: 60_000,
    run: async () => {
      const data = languageData(language);
      const cachePath =
        process.env.OCR_CACHE_DIR?.trim() || path.join(process.cwd(), ".data", "tesseract-cache");
      await mkdir(cachePath, { recursive: true });
      const worker = await createWorker(language, OEM.LSTM_ONLY, {
        langPath: data.langPath,
        gzip: data.gzip,
        cachePath,
        workerPath: path.join(
          process.cwd(),
          "node_modules",
          "tesseract.js",
          "src",
          "worker-script",
          "node",
          "index.js"
        ),
      });
      try {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
        const result = await worker.recognize(image);
        const text = result.data.text.trim();
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const priceCandidates: OcrCandidate[] = [];
        const seenPrices = new Set<string>();
        const pricePattern = /(?:¥|￥|JP¥|CNY|RMB|JPY|USD|\$)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
        for (const line of lines) {
          for (const match of line.matchAll(pricePattern)) {
            const value = match[1].replaceAll(",", "");
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0 || seenPrices.has(value)) continue;
            seenPrices.add(value);
            priceCandidates.push({
              value,
              confidence: Math.max(0, Math.min(1, result.data.confidence / 100)),
              evidence: line,
            });
          }
        }
        const trackingCandidates = [
          ...new Set(lines.flatMap((line) => line.match(/\b[A-Z0-9-]{10,30}\b/gi) ?? [])),
        ].slice(0, 8);
        return {
          text,
          confidence: result.data.confidence / 100,
          priceCandidates: priceCandidates.slice(0, 12),
          trackingCandidates,
        };
      } finally {
        await worker.terminate();
      }
    },
  });
}
