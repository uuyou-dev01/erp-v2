import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { getListingCoverageProducts } from "@/lib/application/listing-coverage";
import { MobilePage } from "@/components/mobile/mobile-page";
import { MobileListings } from "@/components/mobile/mobile-listings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const context = await requireMobilePageContext("/m/listings");
  const products = await getListingCoverageProducts(context.activeStoreId);
  const rows = products.flatMap((product) =>
    product.records.map((record) => ({
      ...record,
      name: record.skuName || product.skuName,
      imageUrl: record.imageUrl || product.imageUrl,
    }))
  );
  return (
    <MobilePage title="在售商品" description="登记售出会生成订单与发货待办；仅下架不产生销售。">
      <MobileListings rows={rows} />
    </MobilePage>
  );
}
