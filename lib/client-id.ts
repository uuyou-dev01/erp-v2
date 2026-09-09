type BrowserCrypto = Partial<Pick<Crypto, "getRandomValues" | "randomUUID">>;

/**
 * Generates a UUID-shaped client id in both secure and non-secure browser contexts.
 * `crypto.randomUUID` is unavailable when the app is opened over plain HTTP on a LAN IP.
 */
export function createClientId(
  prefix?: string,
  cryptoApi: BrowserCrypto | null | undefined = globalThis.crypto
) {
  let id: string;

  if (typeof cryptoApi?.randomUUID === "function") {
    id = cryptoApi.randomUUID();
  } else {
    const bytes = new Uint8Array(16);
    if (typeof cryptoApi?.getRandomValues === "function") {
      cryptoApi.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    id = `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return prefix ? `${prefix}:${id}` : id;
}
