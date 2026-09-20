"use client";

import { useEffect, useState } from "react";
import { getSkuLatestSale } from "@/app/actions/sku-latest-sale";
import type { LatestSkuSale } from "@/lib/application/sku-latest-sale";
import { formatCurrency } from "@/lib/decimal";

export function SkuLatestSale({ storeId, skuId }: { storeId: string; skuId: string }) {
  const [result, setResult] = useState<
    { success: true; sale: LatestSkuSale | null } | { success: false } | null
  >(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setResult(null);
    getSkuLatestSale({ storeId, skuId })
      .then((next) => {
        if (active) setResult(next);
      })
      .catch(() => {
        if (active) setResult({ success: false });
      });
    return () => {
      active = false;
    };
  }, [storeId, skuId, attempt]);

  const sale = result?.success ? result.sale : null;
  const soldDate = sale
    ? new Date(sale.soldAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
    : null;
  const detail = [soldDate, sale?.platformName].filter(Boolean).join(" · ");

  return (
    <div className="ml-auto min-w-0 border-l pl-4" aria-live="polite">
      <p
        className="text-[10px] text-muted-foreground"
        title="当前规格全部市场的最近有效新品成交；按商品成交金额除以件数，不扣平台费用和售后退款。"
      >
        最近成交价 <span className="ml-1">全部市场</span>
      </p>
      {sale ? (
        <>
          <p className="mt-0.5 text-base font-semibold tabular-nums">
            {formatCurrency(sale.price, sale.currency)}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">/ 件</span>
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={detail}>
            {detail}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {!result ? (
            "加载中…"
          ) : result.success ? (
            "暂无成交"
          ) : (
            <>
              加载失败{" "}
              <button
                type="button"
                className="ml-1 text-primary hover:underline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                重试
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
