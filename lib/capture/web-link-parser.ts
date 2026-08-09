import { resolveCapturePlatform } from "@/lib/capture/platform-adapters";
import { extractWebPlatformFields } from "@/lib/capture/web-platform-adapters/registry";
import type {
  WebLinkDocument,
  WebLinkPreview,
  WebLinkProductFields,
} from "@/lib/capture/web-link-types";

export type {
  WebLinkDocument,
  WebLinkExtractionMethod,
  WebLinkFieldClaim,
  WebLinkFieldName,
  WebLinkPageStatus,
  WebLinkPreview,
  WebLinkProductFields,
} from "@/lib/capture/web-link-types";

function normalizeUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|spm$|from$|source$|share_|share$|timestamp$|ut_sk$|scm$|abbucket$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString().replace(/\/$/, "");
}

export function suggestInternalCategory(path: string[], title = "") {
  const haystack = `${path.join(" ")} ${title}`.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/ブレスレット|bracelet|手链|手鐲|手镯/, "首饰配件 / 手链手镯"],
    [/ネックレス|necklace|项链|頸鏈/, "首饰配件 / 项链"],
    [/リング|ring|戒指/, "首饰配件 / 戒指"],
    [/ピアス|イヤリング|earring|耳环|耳飾/, "首饰配件 / 耳饰"],
    [/スニーカー|シューズ|靴|sneaker|shoe|鞋/, "鞋服 / 鞋类"],
    [/ジャケット|トップス|パンツ|shirt|jacket|服装|衣服/, "鞋服 / 服装"],
    [/ぬいぐるみ|plush|毛绒|毛絨/, "玩具 / 毛绒玩具"],
    [/フィギュア|figure|手办/, "玩具 / 模型手办"],
    [/おもちゃ|toy|玩具/, "玩具 / 其他玩具"],
    [/バッグ|bag|包袋|手提包/, "箱包 / 包袋"],
    [/キーチェーン|キーホルダー|key\s*chain|keychain|钥匙扣/, "首饰配件 / 钥匙扣"],
    [/時計|watch|腕表|手表/, "钟表 / 腕表"],
    [/キッチン|収納|日用品|生活用品|家居/, "生活用品 / 日用杂货"],
  ];
  return rules.find(([pattern]) => pattern.test(haystack))?.[1] || "待确认";
}

const EMPTY_FIELDS: WebLinkProductFields = {
  title: "",
  description: "",
  amount: "",
  currency: "CNY",
  conditionText: "",
  pageStatus: "UNKNOWN",
  sellerName: "",
  brand: "",
  sourceCategoryPath: [],
  imageUrls: [],
};

export function buildWebLinkPreview(document: WebLinkDocument): WebLinkPreview {
  const normalizedUrl = normalizeUrl(document.finalUrl || document.requestedUrl);
  const platform = resolveCapturePlatform({ normalizedUrl });
  const context = {
    document,
    normalizedUrl,
    platformName: platform.platformName,
    externalListingId: platform.externalListingId,
  };
  const { adapter, extraction } = extractWebPlatformFields(context);
  const fields: WebLinkProductFields = { ...EMPTY_FIELDS, ...extraction.fields };
  const warnings: string[] = [];
  if (!fields.amount) warnings.push("未自动识别价格，请在保存前补充");
  if (!fields.description) warnings.push("页面没有提供可识别的商品描述");
  if (!fields.imageUrls.length) warnings.push("页面没有提供可保存的商品图片");
  if (!platform.externalListingId) warnings.push("未识别平台商品 ID，将使用规范化链接去重");
  if (document.extractionMethod === "BROWSER") warnings.push("该页面通过匿名浏览器渲染读取");
  if (adapter.tier === "GENERIC") warnings.push("该网站尚无专属适配器，请重点核对解析字段");
  warnings.push(...(extraction.warnings ?? []));

  return {
    requestedUrl: document.requestedUrl,
    sourceUrl: document.finalUrl || document.requestedUrl,
    normalizedUrl,
    platformName: platform.platformName,
    externalListingId: platform.externalListingId,
    ...fields,
    suggestedInternalCategory: suggestInternalCategory(fields.sourceCategoryPath, fields.title),
    extractionMethod: document.extractionMethod,
    adapterCode: adapter.code,
    adapterVersion: adapter.version,
    extractionClaims: extraction.claims,
    warnings,
  };
}
