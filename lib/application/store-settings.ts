export function normalizeStoreCode(value: string) {
  const code = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (!code) {
    throw new Error("请填写店铺代码");
  }
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    throw new Error("店铺代码只能包含 2-32 位字母、数字、下划线或短横线");
  }
  return code;
}

export function normalizeStoreCurrency(value: string) {
  const currency = value.trim().toUpperCase() || "CNY";
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("币种需使用 3 位 ISO 代码，例如 CNY、JPY、USD");
  }
  return currency;
}
