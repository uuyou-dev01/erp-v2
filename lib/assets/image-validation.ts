export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_EDGE = 12_000;
const MAX_IMAGE_PIXELS = 40_000_000;

type ImageInfo = {
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  extension: "jpg" | "png" | "gif" | "webp";
  width: number;
  height: number;
};

function jpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}
function webpDimensions(bytes: Buffer) {
  const kind = bytes.subarray(12, 16).toString("ascii");
  if (kind === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (kind === "VP8 " && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (kind === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + b0 + ((b1 & 0x3f) << 8),
      height: 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10),
    };
  }
  return null;
}

export function inspectImage(bytes: Buffer): ImageInfo {
  if (!bytes.length || bytes.length > MAX_ASSET_BYTES) {
    throw new Error("图片大小必须在 8MB 以内");
  }

  let info: ImageInfo | null = null;
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    info = { mimeType: "image/png", extension: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (bytes.length >= 10 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) {
    info = { mimeType: "image/gif", extension: "gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  } else if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    const dimensions = webpDimensions(bytes);
    if (dimensions) info = { mimeType: "image/webp", extension: "webp", ...dimensions };
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const dimensions = jpegDimensions(bytes);
    if (dimensions) info = { mimeType: "image/jpeg", extension: "jpg", ...dimensions };
  }

  if (!info) throw new Error("图片内容不是受支持的 JPEG、PNG、GIF 或 WebP");
  if (!info.width || !info.height || info.width > MAX_IMAGE_EDGE || info.height > MAX_IMAGE_EDGE) {
    throw new Error("图片尺寸不合法或边长超过 12000 像素");
  }
  if (info.width * info.height > MAX_IMAGE_PIXELS) {
    throw new Error("图片像素总量不能超过 4000 万");
  }
  return info;
}
