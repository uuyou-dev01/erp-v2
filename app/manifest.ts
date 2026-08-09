import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP 随身助手",
    short_name: "ERP 助手",
    description: "商品采集、待办与现场节点确认",
    start_url: "/m",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f8fafc",
    lang: "zh-CN",
    orientation: "portrait",
    icons: [
      { src: "/mobile-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/mobile-icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "登记已购买", short_name: "已购买", url: "/m/capture/purchase", icons: [{ src: "/mobile-icon.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "记录市场价格", short_name: "记录价格", url: "/m/capture/price", icons: [{ src: "/mobile-icon.svg", sizes: "any", type: "image/svg+xml" }] },
    ],
    share_target: {
      action: "/m/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "files", accept: ["image/*"] }] },
    },
  } as MetadataRoute.Manifest;
}
