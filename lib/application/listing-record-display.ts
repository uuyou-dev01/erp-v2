import type { ListingCoveragePlatformState } from "@/lib/application/listing-coverage";

export function recordStatusLabel(state: ListingCoveragePlatformState) {
  if (state === "active") return "已上架";
  if (state === "sold_out") return "已售出";
  return "已下架";
}

export function formatListedAge(listedAt: string) {
  const days = Math.floor(
    (Date.now() - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 0) {
    const hours = Math.floor(
      (Date.now() - new Date(listedAt).getTime()) / (1000 * 60 * 60)
    );
    if (hours <= 0) return "刚刚上架";
    return `上架 ${hours} 小时`;
  }
  return `上架 ${days} 天`;
}

/** 卡片内简短展示：如「3天」「今天」 */
export function formatListedDaysShort(listedAt: string) {
  const days = Math.floor(
    (Date.now() - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days <= 0) return "今天";
  return `${days}天`;
}
