import { describe, expect, it } from "vitest";
import {
  validateImportRow,
  validateImportRows,
} from "@/lib/application/import-validation";

describe("import validation", () => {
  it("rejects empty import files before creating business records", () => {
    expect(validateImportRows("SKU", [])).toEqual([
      { row: 0, message: "导入文件没有可导入的数据" },
    ]);
  });

  it("requires SKU code and name", () => {
    expect(validateImportRow("SKU", { code: "SKU-001" }, 3)).toEqual([
      { row: 3, message: "SKU代码和名称为必填项" },
    ]);
  });

  it("rejects non-positive inventory lot quantities and costs", () => {
    expect(
      validateImportRow(
        "INVENTORY_LOT",
        {
          sku_code: "SKU-001",
          location_code: "WH-CN-01",
          quantity: "0",
          unit_cost: "abc",
        },
        2,
      ),
    ).toEqual([
      { row: 2, message: "数量必须是大于 0 的数字" },
      { row: 2, message: "单位成本必须是大于 0 的数字" },
    ]);
  });

  it("rejects invalid import dates with business field names", () => {
    expect(
      validateImportRow(
        "CUSTOMER_ORDER",
        {
          platform_code: "MERCARI",
          customer_name: "田中",
          order_date: "not-a-date",
        },
        5,
      ),
    ).toEqual([{ row: 5, message: "订单日期不是有效日期" }]);
  });

  it("requires platform code for sales order imports", () => {
    expect(
      validateImportRow(
        "CUSTOMER_ORDER",
        {
          customer_name: "田中",
        },
        1,
      ),
    ).toEqual([{ row: 1, message: "平台代码和客户名称为必填项" }]);
  });

  it("rejects duplicate SKU codes within the same import file", () => {
    expect(
      validateImportRows("SKU", [
        { code: "SKU-001", name: "商品 A" },
        { code: "sku-001", name: "商品 B" },
      ]),
    ).toEqual([{ row: 2, message: "SKU代码 SKU-001 在导入文件中重复" }]);
  });

  it("rejects duplicate external order numbers within the same sales import file", () => {
    expect(
      validateImportRows("CUSTOMER_ORDER", [
        {
          platform_code: "MERCARI",
          customer_name: "田中",
          external_order_no: "M-1001",
        },
        {
          platform_code: "MERCARI",
          customer_name: "佐藤",
          external_order_no: "m-1001",
        },
      ]),
    ).toEqual([{ row: 2, message: "平台订单号 M-1001 在导入文件中重复" }]);
  });
});
