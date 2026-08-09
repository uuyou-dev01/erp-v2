const WEB_URL_PATTERN = /https?:\/\/[^\s<>"'」】]+/gi;

function cleanCapturedUrl(value: string) {
  return value.replace(/[，。；、！!？?]+$/, "");
}

export interface WebLinkBatchInput {
  inputs: string[];
  detectedCount: number;
  duplicateCount: number;
}

/**
 * Turns a paste containing one share message or many links into independent jobs.
 * A single share message is intentionally preserved so platform adapters can use
 * its surrounding title. Multi-link pastes are split into URLs and de-duplicated.
 */
export function extractWebLinkBatchInputs(rawInput: string, maximum = 12): WebLinkBatchInput {
  const text = rawInput.trim();
  const urls = [...text.matchAll(WEB_URL_PATTERN)].map((match) => cleanCapturedUrl(match[0]));
  if (!urls.length) throw new Error("请至少粘贴一个商品链接");
  if (urls.length > maximum) throw new Error(`一次最多解析 ${maximum} 个商品链接`);

  if (urls.length === 1) {
    return { inputs: [text], detectedCount: 1, duplicateCount: 0 };
  }

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of urls) {
    let key = value;
    try {
      const url = new URL(value);
      url.hash = "";
      key = url.toString();
    } catch {
      // The normal reader returns the useful validation message later.
    }
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return {
    inputs: unique,
    detectedCount: urls.length,
    duplicateCount: urls.length - unique.length,
  };
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>
) {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(values[index], index);
      }
    }
  );
  await Promise.all(runners);
  return output;
}
