/** 仓库位置所属地区（国家 + 城市），存库为稳定 code，界面显示中文标签 */
export const LOCATION_REGIONS = [
  { value: "CN_SHANGHAI", label: "中国 · 上海" },
  { value: "CN_BEIJING", label: "中国 · 北京" },
  { value: "CN_SHENZHEN", label: "中国 · 深圳" },
  { value: "CN_GUANGZHOU", label: "中国 · 广州" },
  { value: "CN_HANGZHOU", label: "中国 · 杭州" },
  { value: "JP_TOKYO", label: "日本 · 东京" },
  { value: "JP_OSAKA", label: "日本 · 大阪" },
  { value: "JP_KYOTO", label: "日本 · 京都" },
  { value: "JP_NAGOYA", label: "日本 · 名古屋" },
  { value: "US_LOS_ANGELES", label: "美国 · 洛杉矶" },
  { value: "US_NEW_YORK", label: "美国 · 纽约" },
  { value: "EU_GERMANY", label: "欧洲 · 德国" },
  { value: "EU_FRANCE", label: "欧洲 · 法国" },
  { value: "EU_OTHER", label: "欧洲 · 其他" },
  { value: "OTHER", label: "其他" },
] as const;

export type LocationRegionCode = (typeof LOCATION_REGIONS)[number]["value"];

const regionLabelMap = Object.fromEntries(
  LOCATION_REGIONS.map((region) => [region.value, region.label])
);

export function formatLocationRegion(region: string | null | undefined): string {
  if (!region) return "-";
  return regionLabelMap[region] ?? region;
}

export function isValidLocationRegion(region: string): boolean {
  return LOCATION_REGIONS.some((item) => item.value === region);
}
