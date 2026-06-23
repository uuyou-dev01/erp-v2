import { platformVisualOverrides } from "@/config/platform-visuals";

export type PlatformVisualDefinition = {
  key: string;
  label: string;
  country?: "CN" | "JP" | "US" | "GLOBAL";
  iconSrc?: string;
  fallbackLabel: string;
  fallbackClassName: string;
  fallbackStyle?: {
    backgroundColor?: string;
    color?: string;
    fontSize?: string;
  };
  sourceUrl?: string;
  aliases: string[];
};

export type PlatformVisualConfig = {
  key: string;
  label?: string;
  country?: PlatformVisualDefinition["country"];
  iconSrc?: string;
  fallbackLabel?: string;
  fallbackClassName?: string;
  fallbackStyle?: PlatformVisualDefinition["fallbackStyle"];
  sourceUrl?: string;
  aliases?: string[];
};

const DEFAULT_FALLBACK_CLASS = "bg-muted text-muted-foreground";

export const DEFAULT_PLATFORM_VISUAL_DEFINITIONS: PlatformVisualConfig[] = [
  {
    key: "mercari",
    label: "Mercari",
    country: "JP",
    fallbackLabel: "M",
    fallbackClassName: "bg-[#ff0211] text-white",
    fallbackStyle: { backgroundColor: "#ff0211", color: "#ffffff" },
    sourceUrl:
      "https://storage.googleapis.com/prd-about-asset-2020/2025/05/a0aa5472-en_mercari-group-corporate-logo-guidelines-202505-presskit.pdf",
    aliases: ["MERCARI", "MERCARI_JP", "MERCARI（メルカリ）", "メルカリ", "煤炉"],
  },
  {
    key: "xianyu",
    label: "闲鱼",
    country: "CN",
    fallbackLabel: "闲",
    fallbackClassName: "bg-[#ffe500] text-slate-950",
    fallbackStyle: { backgroundColor: "#ffe500", color: "#020617" },
    aliases: ["XIAN_YU", "XIANYU", "闲鱼"],
  },
  {
    key: "snkrdunk",
    label: "SNKRDUNK",
    country: "JP",
    fallbackLabel: "S",
    fallbackClassName: "bg-slate-950 text-white",
    fallbackStyle: { backgroundColor: "#020617", color: "#ffffff" },
    aliases: ["SNKRDUNK", "SNRKDUNK", "SNRKDUNK", "SNrkdunk"],
  },
  {
    key: "yahoo-jp",
    label: "Yahoo Japan",
    country: "JP",
    fallbackLabel: "Y",
    fallbackClassName: "bg-[#6f42c1] text-white",
    fallbackStyle: { backgroundColor: "#6f42c1", color: "#ffffff" },
    aliases: [
      "YAHOO",
      "YAHOO_AUCTION",
      "YAHOO_AUCTIONS",
      "YAHOO_SHOPPING",
      "YAHOO_JP",
      "YAHOO拍卖",
      "Yahoo拍卖",
      "ヤフオク",
      "雅虎",
    ],
  },
  {
    key: "ebay",
    label: "eBay",
    country: "GLOBAL",
    fallbackLabel: "eB",
    fallbackClassName: "bg-white text-slate-500",
    aliases: ["EBAY", "eBay"],
  },
  {
    key: "rakuten",
    label: "Rakuten",
    country: "JP",
    fallbackLabel: "乐",
    fallbackClassName: "bg-[#bf0000] text-white",
    aliases: ["RAKUTEN", "RAKUTEN_JP", "楽天", "乐天"],
  },
  {
    key: "amazon-jp",
    label: "Amazon Japan",
    country: "JP",
    fallbackLabel: "A",
    fallbackClassName: "bg-[#111111] text-[#ff9900]",
    aliases: ["AMAZON", "AMAZON_JP", "AMAZON_JAPAN", "AMAZON.CO.JP", "亚马逊日本"],
  },
  {
    key: "zozotown",
    label: "ZOZOTOWN",
    country: "JP",
    fallbackLabel: "Z",
    fallbackClassName: "bg-[#111111] text-white",
    aliases: ["ZOZO", "ZOZOTOWN", "ZOZO_TOWN"],
  },
  {
    key: "taobao",
    label: "淘宝",
    country: "CN",
    fallbackLabel: "淘",
    fallbackClassName: "bg-[#ff5000] text-white",
    aliases: ["TAOBAO", "TB", "淘宝"],
  },
  {
    key: "tmall",
    label: "天猫",
    country: "CN",
    fallbackLabel: "猫",
    fallbackClassName: "bg-[#dd001b] text-white",
    aliases: ["TMALL", "TM", "天猫"],
  },
  {
    key: "jd",
    label: "京东",
    country: "CN",
    fallbackLabel: "京",
    fallbackClassName: "bg-[#e1251b] text-white",
    aliases: ["JD", "JD_COM", "JINGDONG", "京东"],
  },
  {
    key: "pinduoduo",
    label: "拼多多",
    country: "CN",
    fallbackLabel: "拼",
    fallbackClassName: "bg-[#e02e24] text-white",
    aliases: ["PINDUODUO", "PDD", "拼多多"],
  },
  {
    key: "douyin",
    label: "抖音",
    country: "CN",
    fallbackLabel: "抖",
    fallbackClassName: "bg-[#050505] text-white",
    aliases: ["DOUYIN", "TIKTOK_CN", "抖音"],
  },
  {
    key: "xiaohongshu",
    label: "小红书",
    country: "CN",
    fallbackLabel: "红",
    fallbackClassName: "bg-[#ff2442] text-white",
    aliases: ["XIAOHONGSHU", "RED", "RED_BOOK", "小红书"],
  },
  {
    key: "1688",
    label: "1688",
    country: "CN",
    fallbackLabel: "1688",
    fallbackClassName: "bg-[#ff7300] text-white text-[9px]",
    aliases: ["1688", "ALIBABA_1688", "ALI_1688"],
  },
];

function deriveFallbackLabel(code: string, name: string) {
  const source = name.trim() || code.trim();
  if (!source) return "P";
  const chinese = source.match(/[\u4e00-\u9fff]/u)?.[0];
  if (chinese) return chinese;
  return code
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeDefinition(input: PlatformVisualConfig): PlatformVisualDefinition {
  const label = input.label ?? input.key;
  return {
    ...input,
    label,
    fallbackLabel: input.fallbackLabel ?? deriveFallbackLabel(input.key, label),
    fallbackClassName: input.fallbackClassName ?? DEFAULT_FALLBACK_CLASS,
    aliases: input.aliases ?? [],
  };
}

function mergePlatformDefinitions(
  defaults: PlatformVisualConfig[],
  overrides: PlatformVisualConfig[]
) {
  const merged = new Map<string, PlatformVisualConfig>();
  for (const definition of defaults) {
    merged.set(definition.key, definition);
  }
  for (const override of overrides) {
    const current = merged.get(override.key);
    merged.set(override.key, current ? { ...current, ...override } : override);
  }
  return [...merged.values()].map(normalizeDefinition);
}

export const PLATFORM_VISUAL_DEFINITIONS = mergePlatformDefinitions(
  DEFAULT_PLATFORM_VISUAL_DEFINITIONS,
  platformVisualOverrides
);

const VISUAL_BY_ALIAS = new Map<string, PlatformVisualDefinition>();

function normalizePlatformKey(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/（.*?）|\(.*?\)/g, "")
    .replace(/[\s.!-]+/g, "_");
}

for (const definition of PLATFORM_VISUAL_DEFINITIONS) {
  VISUAL_BY_ALIAS.set(normalizePlatformKey(definition.key), definition);
  VISUAL_BY_ALIAS.set(normalizePlatformKey(definition.label), definition);
  for (const alias of definition.aliases) {
    VISUAL_BY_ALIAS.set(normalizePlatformKey(alias), definition);
  }
}

export function getPlatformVisual(code?: string | null, name?: string | null) {
  const candidates = [code, name].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const visual = VISUAL_BY_ALIAS.get(normalizePlatformKey(candidate));
    if (visual) return visual;
  }
  return null;
}

export function getPlatformFallbackLabel(code: string, name: string) {
  return deriveFallbackLabel(code, name);
}
