import { listWebPlatformContentAdapters } from "@/lib/capture/web-platform-adapters/registry";

export interface AdapterClaim {
  fieldName: string;
  value: string;
  confidence: number;
  evidenceText?: string;
}

export interface CapturePlatformResolution {
  platformName: string;
  externalListingId: string | null;
  adapter: string;
  adapterVersion: string;
  claims: AdapterClaim[];
}

interface PlatformAdapter {
  code: string;
  version: string;
  label: string;
  matches(url: URL | null, hint?: string | null): boolean;
  externalId(url: URL | null): string | null;
}

function hostnameIs(url: URL | null, domain: string) {
  const hostname = url?.hostname.toLowerCase();
  return Boolean(hostname && (hostname === domain || hostname.endsWith(`.${domain}`)));
}

function hintMatches(hint: string | null | undefined, values: string[]) {
  const normalized = hint?.trim().toLocaleLowerCase("zh-CN") || "";
  return values.some((value) => normalized === value.toLocaleLowerCase("zh-CN"));
}

const ADAPTERS: PlatformAdapter[] = [
  {
    code: "GOOFISH",
    version: "1",
    label: "闲鱼",
    matches: (url, hint) =>
      Boolean(
        hostnameIs(url, "goofish.com") ||
        hostnameIs(url, "2.taobao.com") ||
        hintMatches(hint, ["闲鱼", "xianyu", "goofish"])
      ),
    externalId: (url) =>
      url?.searchParams.get("id") ||
      url?.searchParams.get("itemId") ||
      url?.pathname.match(/item\/(\d+)/)?.[1] ||
      null,
  },
  {
    code: "QIANDAO",
    version: "1",
    label: "千岛",
    matches: (url, hint) =>
      Boolean(
        hostnameIs(url, "qiandaoapp.com") ||
        hostnameIs(url, "qiandao.com") ||
        hintMatches(hint, ["千岛", "qiandao"])
      ),
    externalId: (url) =>
      url?.searchParams.get("id") ||
      url?.searchParams.get("itemId") ||
      url?.pathname.match(/(?:goods|item)\/([^/?#]+)/)?.[1] ||
      null,
  },
  {
    code: "MERCARI",
    version: "2",
    label: "Mercari",
    matches: (url, hint) =>
      Boolean(hostnameIs(url, "mercari.com") || hintMatches(hint, ["mercari", "煤炉"])),
    externalId: (url) =>
      url?.pathname.match(/\/shops\/product\/([^/?#]+)/i)?.[1] ||
      url?.pathname.match(/\/item\/(m\w+)/i)?.[1] ||
      null,
  },
  {
    code: "YAHOO_AUCTION",
    version: "1",
    label: "Yahoo拍卖",
    matches: (url, hint) =>
      Boolean(
        hostnameIs(url, "auctions.yahoo.co.jp") ||
        hintMatches(hint, ["Yahoo拍卖", "Yahoo Auction", "ヤフオク"])
      ),
    externalId: (url) => url?.pathname.match(/\/auction\/([^/?#]+)/i)?.[1] || null,
  },
  {
    code: "AMAZON",
    version: "1",
    label: "Amazon",
    matches: (url, hint) =>
      Boolean(
        /(^|\.)amazon\.(?:co\.jp|com|cn|co\.uk|de|fr|it|es|ca|com\.au)$/.test(
          url?.hostname.toLowerCase() || ""
        ) || hintMatches(hint, ["Amazon", "亚马逊"])
      ),
    externalId: (url) =>
      url?.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1]?.toUpperCase() ||
      null,
  },
  {
    code: "ATMOS",
    version: "1",
    label: "Atmos",
    matches: (url, hint) =>
      Boolean(hostnameIs(url, "atmos-tokyo.com") || hintMatches(hint, ["Atmos"])),
    externalId: (url) =>
      url?.pathname.match(/\/item\/(?:[^/?#]+\/)?([^/?#]+)(?:[/?#]|$)/i)?.[1] ||
      url?.pathname.match(/\/products?\/([^/?#]+)(?:[/?#]|$)/i)?.[1] ||
      null,
  },
  {
    code: "WECHAT",
    version: "1",
    label: "微信",
    matches: (url, hint) =>
      Boolean(
        url?.hostname.includes("weixin") ||
        url?.hostname.includes("wechat") ||
        hintMatches(hint, ["微信", "wechat", "weixin"])
      ),
    externalId: () => null,
  },
];

function safeUrl(value?: string | null) {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

function textClaims(text?: string | null): AdapterClaim[] {
  const value = text?.trim() || "";
  if (!value) return [];
  const claims: AdapterClaim[] = [];
  const pricePattern = /(?:JP¥|JPY|¥|￥|CNY|RMB|USD|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
  for (const match of value.matchAll(pricePattern)) {
    claims.push({
      fieldName: "amount",
      value: match[1].replaceAll(",", ""),
      confidence: 0.78,
      evidenceText: match[0],
    });
  }
  const order = value.match(/(?:订单号|order(?:\s*no)?)[：:\s]*([A-Z0-9-]{6,40})/i);
  if (order)
    claims.push({
      fieldName: "externalOrderNo",
      value: order[1],
      confidence: 0.9,
      evidenceText: order[0],
    });
  const tracking = value.match(/(?:运单号|物流单号|tracking(?:\s*no)?)[：:\s]*([A-Z0-9-]{8,40})/i);
  if (tracking)
    claims.push({
      fieldName: "trackingNo",
      value: tracking[1],
      confidence: 0.9,
      evidenceText: tracking[0],
    });
  return claims;
}

export function resolveCapturePlatform(input: {
  normalizedUrl?: string | null;
  platformHint?: string | null;
  externalListingId?: string | null;
  sourceText?: string | null;
}): CapturePlatformResolution {
  const url = safeUrl(input.normalizedUrl);
  const adapter = ADAPTERS.find((candidate) => candidate.matches(url, input.platformHint));
  const platformName = adapter?.label || input.platformHint?.trim() || "其他";
  const externalListingId = input.externalListingId?.trim() || adapter?.externalId(url) || null;
  const claims = textClaims(input.sourceText);
  if (externalListingId)
    claims.unshift({
      fieldName: "externalListingId",
      value: externalListingId,
      confidence: 1,
      evidenceText: input.normalizedUrl || undefined,
    });
  return {
    platformName,
    externalListingId,
    adapter: adapter?.code || "GENERIC",
    adapterVersion: adapter?.version || "1",
    claims,
  };
}

export function listCapturePlatformAdapters() {
  const contentAdapters = listWebPlatformContentAdapters();
  const contentByCode = new Map(contentAdapters.map((adapter) => [adapter.code, adapter]));
  const platformAdapters = ADAPTERS.map((adapter) => {
    const content = contentByCode.get(adapter.code);
    return {
      code: adapter.code,
      label: adapter.label,
      version: content?.version || adapter.version,
      identityVersion: adapter.version,
      contentVersion: content?.version || null,
      parsingTier: content?.tier || ("IDENTITY_ONLY" as const),
      variants: content?.variants || [],
      capabilities: content?.capabilities || ["externalListingId"],
      status: "HEALTHY" as const,
    };
  });
  const generic = contentByCode.get("GENERIC");
  return [
    ...(generic
      ? [
          {
            code: generic.code,
            label: generic.label,
            version: generic.version,
            identityVersion: null,
            contentVersion: generic.version,
            parsingTier: generic.tier,
            variants: generic.variants,
            capabilities: generic.capabilities,
            status: "HEALTHY" as const,
          },
        ]
      : []),
    ...platformAdapters,
  ];
}
