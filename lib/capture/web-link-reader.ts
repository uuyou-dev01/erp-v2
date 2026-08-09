import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Browser, BrowserContext, Route } from "playwright";
import {
  buildWebLinkPreview,
  type WebLinkDocument,
  type WebLinkPreview,
} from "@/lib/capture/web-link-parser";

const DEFAULT_FETCH_TIMEOUT_MS = 6_000;
const DEFAULT_BROWSER_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIp(address: string) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) !== 6) return true;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8")
  );
}

const dnsSafetyCache = new Map<string, Promise<void>>();

export async function assertPublicWebUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("请输入完整的商品链接");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol))
    throw new Error("只支持 HTTP 或 HTTPS 商品链接");
  if (url.username || url.password) throw new Error("来源链接不能包含账号或密码");
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("不能读取本机或内网地址");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("不能读取本机或内网地址");
    return url;
  }
  let safety = dnsSafetyCache.get(hostname);
  if (!safety) {
    safety = lookup(hostname, { all: true, verbatim: true })
      .then((records) => {
        if (!records.length || records.some((record) => isPrivateIp(record.address))) {
          throw new Error("不能读取解析到内网的地址");
        }
      })
      .catch((error) => {
        dnsSafetyCache.delete(hostname);
        if (error instanceof Error && /内网/.test(error.message)) throw error;
        throw new Error("无法解析该网站地址");
      });
    dnsSafetyCache.set(hostname, safety);
  }
  await safety;
  return url;
}

export function extractFirstWebUrl(input: string) {
  const text = input.trim();
  try {
    return new URL(text).toString();
  } catch {
    const match = text.match(/https?:\/\/[^\s<>"'」】]+/i)?.[0];
    if (!match) throw new Error("请粘贴商品链接或包含链接的分享文案");
    return match.replace(/[，。；、！!？?]+$/, "");
  }
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? _match;
  });
}

function tagAttributes(tag: string) {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function extractHtmlDocument(
  requestedUrl: string,
  finalUrl: string,
  html: string
): WebLinkDocument {
  const meta: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const key = attrs.property || attrs.name;
    if (key && attrs.content) meta[key.toLowerCase()] = attrs.content;
  }
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const headingMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const jsonLd: unknown[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      jsonLd.push(JSON.parse(decodeHtml(match[1])));
    } catch {
      /* malformed source metadata */
    }
  }
  const images: string[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = tagAttributes(match[0]);
    const source = attrs.src || attrs["data-src"] || attrs["data-lazy-src"];
    if (source) {
      try {
        images.push(new URL(source, finalUrl).toString());
      } catch {
        /* ignore invalid image */
      }
    }
    if (images.length >= 40) break;
  }
  const links: Array<{ text: string; href: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const attrs = tagAttributes(match[0].match(/<a\b[^>]*>/i)?.[0] || "");
    if (!attrs.href) continue;
    try {
      links.push({
        text: decodeHtml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim(),
        href: new URL(attrs.href, finalUrl).toString(),
      });
    } catch {
      /* ignore invalid link */
    }
    if (links.length >= 200) break;
  }
  const bodyText = decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).slice(0, 100_000);
  return {
    requestedUrl,
    finalUrl,
    extractionMethod: "HTTP",
    documentTitle: decodeHtml(titleMatch?.[1]?.replace(/<[^>]+>/g, " ") || ""),
    heading: decodeHtml(headingMatch?.[1]?.replace(/<[^>]+>/g, " ") || ""),
    bodyText,
    meta,
    jsonLd,
    images,
    links,
  };
}

async function readLimitedText(response: Response) {
  const maximum = envNumber("WEB_CAPTURE_MAX_HTML_BYTES", DEFAULT_MAX_HTML_BYTES);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum)
    throw new Error("网页内容过大，无法自动解析");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) {
      await reader.cancel();
      throw new Error("网页内容过大，无法自动解析");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchHtml(requestedUrl: string) {
  let current = requestedUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicWebUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(
        envNumber("WEB_CAPTURE_FETCH_TIMEOUT_MS", DEFAULT_FETCH_TIMEOUT_MS)
      ),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.6",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36 ERP-Link-Preview/1.0",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("网站返回了无效跳转");
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`网站返回 ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType))
      throw new Error("该链接不是网页商品页面");
    return { finalUrl: current, html: await readLimitedText(response) };
  }
  throw new Error("网站跳转次数过多");
}

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  const configuredChannel = process.env.WEB_CAPTURE_BROWSER_CHANNEL?.trim();
  try {
    return await chromium.launch({
      headless: true,
      ...(configuredChannel ? { channel: configuredChannel } : {}),
    });
  } catch (error) {
    if (
      !configuredChannel &&
      process.platform === "darwin" &&
      error instanceof Error &&
      /Executable doesn't exist/.test(error.message)
    ) {
      return chromium.launch({ headless: true, channel: "chrome" });
    }
    throw error;
  }
}

async function protectBrowserContext(context: BrowserContext) {
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = request.url();
    if (!/^https?:/i.test(url)) return route.continue();
    if (["font", "media"].includes(request.resourceType())) return route.abort("blockedbyclient");
    try {
      await assertPublicWebUrl(url);
      return route.continue();
    } catch {
      return route.abort("blockedbyclient");
    }
  });
}

async function renderDocument(requestedUrl: string): Promise<WebLinkDocument> {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    locale: "ja-JP",
    serviceWorkers: "block",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  });
  try {
    await protectBrowserContext(context);
    const page = await context.newPage();
    const timeout = envNumber("WEB_CAPTURE_BROWSER_TIMEOUT_MS", DEFAULT_BROWSER_TIMEOUT_MS);
    await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout });
    await assertPublicWebUrl(page.url());
    await page.locator("body").waitFor({ state: "visible", timeout: Math.min(timeout, 10_000) });
    await page
      .locator("h1")
      .first()
      .waitFor({ state: "visible", timeout: Math.min(timeout, 12_000) })
      .catch(() => undefined);
    await page.waitForTimeout(500);
    const raw = await page.evaluate(() => {
      const meta: Record<string, string> = {};
      for (const element of Array.from(document.querySelectorAll("meta[property], meta[name]"))) {
        const key = element.getAttribute("property") || element.getAttribute("name");
        const content = element.getAttribute("content");
        if (key && content) meta[key.toLowerCase()] = content;
      }
      const root =
        document.querySelector("article") || document.querySelector("main") || document.body;
      const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"))
        .slice(0, 80)
        .map((image) => image.currentSrc || image.src || image.getAttribute("data-src") || "")
        .filter(Boolean);
      const jsonLdTexts = Array.from(
        document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
      )
        .slice(0, 20)
        .map((script) => script.textContent || "");
      return {
        finalUrl: location.href,
        documentTitle: document.title,
        heading:
          root.querySelector("h1")?.textContent || document.querySelector("h1")?.textContent || "",
        articleText: ((root as HTMLElement).innerText || root.textContent || "").slice(0, 80_000),
        bodyText: (document.body.innerText || document.body.textContent || "").slice(0, 120_000),
        meta,
        jsonLdTexts,
        images,
        links: Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))
          .slice(0, 200)
          .map((link) => ({
            text: (link.innerText || link.textContent || "").trim(),
            href: link.href,
          })),
      };
    });
    const jsonLd = raw.jsonLdTexts.flatMap((text) => {
      try {
        return [JSON.parse(text)];
      } catch {
        return [];
      }
    });
    return { requestedUrl, extractionMethod: "BROWSER", ...raw, jsonLd };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function hasUsefulPreview(preview: WebLinkPreview) {
  return Boolean(
    preview.title && (preview.amount || preview.description || preview.imageUrls.length)
  );
}

export async function readWebProductLink(rawInput: string): Promise<WebLinkPreview> {
  const inputText = rawInput.trim();
  const requestedUrl = (await assertPublicWebUrl(extractFirstWebUrl(inputText))).toString();
  const sharedText =
    inputText === requestedUrl || inputText === requestedUrl.replace(/\/$/, "") ? "" : inputText;
  let directPreview: WebLinkPreview | null = null;
  let browserFailure = "";
  try {
    const direct = await fetchHtml(requestedUrl);
    directPreview = buildWebLinkPreview({
      ...extractHtmlDocument(requestedUrl, direct.finalUrl, direct.html),
      sharedText,
    });
    if (directPreview.title && directPreview.amount && directPreview.imageUrls.length)
      return directPreview;
  } catch {
    // Dynamic and anti-bot protected pages fall through to anonymous browser rendering.
  }
  try {
    const rendered = buildWebLinkPreview({ ...(await renderDocument(requestedUrl)), sharedText });
    if (hasUsefulPreview(rendered)) return rendered;
  } catch (error) {
    if (directPreview && hasUsefulPreview(directPreview)) return directPreview;
    browserFailure = error instanceof Error ? error.message : "未知浏览器错误";
    if (error instanceof Error && /登录|验证码|内网|HTTP|HTTPS/.test(error.message)) throw error;
  }
  throw new Error(
    process.env.NODE_ENV === "production" || !browserFailure
      ? "暂时无法读取该商品页，请检查链接，或稍后改用截图采集"
      : `暂时无法读取该商品页：${browserFailure}`
  );
}
