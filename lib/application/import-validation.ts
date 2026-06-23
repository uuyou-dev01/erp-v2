export type ImportEntityType =
  | "SKU"
  | "INVENTORY_LOT"
  | "PURCHASE_LINE"
  | "CUSTOMER_ORDER";

export interface ImportRowError {
  row: number;
  message: string;
}

const REQUIRED_FIELD_MESSAGES: Record<ImportEntityType, string> = {
  SKU: "SKU代码和名称为必填项",
  INVENTORY_LOT: "SKU代码、仓库代码、数量和单价为必填项",
  PURCHASE_LINE: "采购单ID、SKU代码、数量和单价为必填项",
  CUSTOMER_ORDER: "平台代码和客户名称为必填项",
};

const REQUIRED_FIELDS: Record<ImportEntityType, string[]> = {
  SKU: ["code", "name"],
  INVENTORY_LOT: ["sku_code", "location_code", "quantity", "unit_cost"],
  PURCHASE_LINE: ["purchase_order_id", "sku_code", "quantity", "unit_price"],
  CUSTOMER_ORDER: ["platform_code", "customer_name"],
};

const POSITIVE_NUMBER_FIELDS: Partial<
  Record<ImportEntityType, Array<{ key: string; label: string }>>
> = {
  INVENTORY_LOT: [
    { key: "quantity", label: "数量" },
    { key: "unit_cost", label: "单位成本" },
  ],
  PURCHASE_LINE: [
    { key: "quantity", label: "数量" },
    { key: "unit_price", label: "单价" },
  ],
};

const DATE_FIELDS: Partial<
  Record<ImportEntityType, Array<{ key: string; label: string }>>
> = {
  INVENTORY_LOT: [{ key: "received_at", label: "到货日期" }],
  CUSTOMER_ORDER: [{ key: "order_date", label: "订单日期" }],
};

export function validateImportRows(
  entityType: ImportEntityType,
  rows: Record<string, string>[],
): ImportRowError[] {
  if (rows.length === 0) {
    return [{ row: 0, message: "导入文件没有可导入的数据" }];
  }

  const rowErrors = rows.flatMap((row, index) =>
    validateImportRow(entityType, row, index + 1),
  );

  return [...rowErrors, ...validateDuplicateRows(entityType, rows)];
}

export function validateImportRow(
  entityType: ImportEntityType,
  row: Record<string, string>,
  rowNumber: number,
): ImportRowError[] {
  const errors: ImportRowError[] = [];
  const missingRequiredFields = REQUIRED_FIELDS[entityType].filter(
    (field) => !trimmedValue(row, field),
  );

  if (missingRequiredFields.length > 0) {
    errors.push({
      row: rowNumber,
      message:
        entityType === "PURCHASE_LINE" &&
        missingRequiredFields.length === 1 &&
        missingRequiredFields[0] === "purchase_order_id"
          ? "采购单ID为必填项"
          : REQUIRED_FIELD_MESSAGES[entityType],
    });
    return errors;
  }

  for (const field of POSITIVE_NUMBER_FIELDS[entityType] ?? []) {
    const value = trimmedValue(row, field.key);
    if (!isPositiveNumber(value)) {
      errors.push({
        row: rowNumber,
        message: `${field.label}必须是大于 0 的数字`,
      });
    }
  }

  for (const field of DATE_FIELDS[entityType] ?? []) {
    const value = trimmedValue(row, field.key);
    if (value && Number.isNaN(Date.parse(value))) {
      errors.push({
        row: rowNumber,
        message: `${field.label}不是有效日期`,
      });
    }
  }

  return errors;
}

function trimmedValue(row: Record<string, string>, key: string) {
  return row[key]?.trim() ?? "";
}

function isPositiveNumber(value: string) {
  if (!value) return false;
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function validateDuplicateRows(
  entityType: ImportEntityType,
  rows: Record<string, string>[],
): ImportRowError[] {
  if (entityType === "SKU") {
    return duplicateValueErrors(rows, "code", "SKU代码");
  }
  if (entityType === "CUSTOMER_ORDER") {
    return duplicateValueErrors(rows, "external_order_no", "平台订单号");
  }
  return [];
}

function duplicateValueErrors(
  rows: Record<string, string>[],
  key: string,
  label: string,
): ImportRowError[] {
  const seen = new Map<string, string>();
  const errors: ImportRowError[] = [];

  rows.forEach((row, index) => {
    const value = trimmedValue(row, key);
    if (!value) return;

    const normalized = value.toUpperCase();
    const firstValue = seen.get(normalized);
    if (firstValue) {
      errors.push({
        row: index + 1,
        message: `${label} ${firstValue} 在导入文件中重复`,
      });
      return;
    }

    seen.set(normalized, value);
  });

  return errors;
}
