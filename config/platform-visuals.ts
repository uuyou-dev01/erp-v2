import type { PlatformVisualConfig } from "@/lib/platform-icons";

/**
 * Project-level platform visual overrides.
 *
 * Open-source users can add their own platforms here without editing the core
 * defaults. `iconSrc` accepts either a local public asset path
 * (`/platform-icons/shopify.svg`) or a remote URL.
 */
export const platformVisualOverrides: PlatformVisualConfig[] = [
  // Example:
  // {
  //   key: "shopify",
  //   label: "Shopify",
  //   iconSrc: "https://cdn.example.com/shopify.svg",
  //   fallbackLabel: "S",
  //   fallbackClassName: "bg-green-600 text-white",
  //   aliases: ["SHOPIFY", "Shopify"],
  // },
];
