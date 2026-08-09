import type { ListingOpsItem } from "@/components/listing/listing-ops-types";

function activityRank(status: string) {
  return status === "ACTIVE" ? 0 : 1;
}

export function sortListingOpsItems(listings: ListingOpsItem[], sort?: string) {
  return [...listings].sort((a, b) => {
    const activityDifference = activityRank(a.status) - activityRank(b.status);
    if (activityDifference !== 0) return activityDifference;

    if (sort === "updatedAt") {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (sort === "priceAsc") {
      return Number(a.listedPrice ?? 0) - Number(b.listedPrice ?? 0);
    }
    if (sort === "priceDesc") {
      return Number(b.listedPrice ?? 0) - Number(a.listedPrice ?? 0);
    }
    return new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime();
  });
}
