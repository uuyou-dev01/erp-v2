import Link from "next/link";
import { ProductImage } from "@/components/ui/product-image";
import { Badge } from "@/components/ui/badge";
import {
  catalogStatusLabel,
  productKindLabel,
  type CatalogStatus,
  type ProductKind,
} from "@/lib/application/sku-catalog";
import { formatCurrency } from "@/lib/decimal";

export interface SKUInfoCardData {
  skuId?: string;
  code: string;
  name: string;
  imageUrl?: string | null;
  brand?: string | null;
  category?: string | null;
  productKind?: ProductKind;
  referencePrice?: string | null;
  currency?: string | null;
  series?: string | null;
  catalogStatus?: CatalogStatus;
}

interface SKUInfoCardProps {
  data: SKUInfoCardData;
  /** 链到商品档案详情 */
  detailHref?: string;
  compact?: boolean;
  className?: string;
}

export function SKUInfoCard({
  data,
  detailHref,
  compact = false,
  className = "",
}: SKUInfoCardProps) {
  const href = detailHref ?? (data.skuId ? `/inventory/skus/${data.skuId}` : undefined);
  const kind = data.productKind ?? "NEW";
  const status = data.catalogStatus ?? "active";

  const body = (
    <div className={`flex gap-3 ${className}`}>
      <ProductImage
        src={data.imageUrl}
        alt={data.name}
        size={compact ? "md" : "lg"}
        className="shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start gap-2">
          <p className={`truncate font-semibold ${compact ? "text-sm" : "text-base"}`}>
            {data.name}
          </p>
          {status === "disabled" ? (
            <Badge variant="outline" className="text-xs">
              {catalogStatusLabel(status)}
            </Badge>
          ) : null}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{data.code}</p>
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {productKindLabel(kind)}
          </Badge>
          {data.brand ? <span>{data.brand}</span> : null}
          {data.category ? (
            <>
              {data.brand ? <span>·</span> : null}
              <span>{data.category}</span>
            </>
          ) : null}
          {data.series ? (
            <>
              <span>·</span>
              <span>{data.series}</span>
            </>
          ) : null}
        </div>
        {data.referencePrice ? (
          <p className="text-xs text-muted-foreground">
            参考价{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(data.referencePrice, data.currency ?? "CNY")}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-lg transition-colors hover:bg-muted/40">
        {body}
      </Link>
    );
  }

  return body;
}
