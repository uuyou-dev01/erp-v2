# Platform Icon Library

本项目的平台标识由 `lib/platform-icons.ts` 提供内置默认值，由 `config/platform-visuals.ts` 提供项目级覆盖。每个平台可以配置两层视觉：

- `iconSrc`：有准确、可验证的 icon 时使用，可以是 `/platform-icons/example.svg`，也可以是远程 URL。
- `fallbackLabel` + `fallbackClassName`：没有准确 icon 时使用颜色字标，例如闲鱼显示黄底「闲」、Mercari fallback 显示红底「煤」。

## 当前覆盖的 fallback

中国主要平台：

- `TAOBAO` / 淘宝
- `TMALL` / 天猫
- `JD` / 京东
- `PINDUODUO` / 拼多多
- `XIAN_YU` / 闲鱼
- `DOUYIN` / 抖音电商
- `XIAOHONGSHU` / 小红书
- `ALIBABA_1688` / 1688

日本主要平台：

- `MERCARI` / メルカリ
- `YAHOO_AUCTION` / ヤフオク
- `YAHOO_SHOPPING` / Yahoo!ショッピング
- `RAKUTEN` / 楽天
- `AMAZON_JP` / Amazon.co.jp
- `ZOZOTOWN`

## 使用方式

UI 里优先使用 `ListingPlatformMark`：

```tsx
<ListingPlatformMark code={platform.code} name={platform.name} />
```

如果平台没有匹配到本地图标，组件会回退到原来的文字缩写。
如果平台匹配到了配置但没有 `iconSrc`，组件会使用配置里的颜色字标。

## 来源与后续替换

当前只有 Mercari 配置了 `iconSrc`，并按官方 corporate logo guidelines 中的 symbol 结构重绘。其它平台先使用颜色字标，不再使用不准确的自制 SVG。

如果后续能稳定下载到 theSVG、Simple Icons 或品牌方发布的官方 SVG，可以直接放在 `public/platform-icons`，或者把 SVG/CDN 链接写进 `config/platform-visuals.ts`，组件调用无需变化。

新增平台时：

1. 在 `config/platform-visuals.ts` 新增配置，不需要改核心代码。
2. 如果有准确 icon，配置 `iconSrc`：

```ts
{
  key: "shopify",
  label: "Shopify",
  iconSrc: "https://cdn.example.com/shopify.svg",
  aliases: ["SHOPIFY", "Shopify"],
}
```

3. 如果没有准确 icon，配置 `fallbackLabel` 和 `fallbackClassName`。
4. 把常见平台代码、中文名、日文名加入 `aliases`。

本地配置会覆盖内置默认值，优先级为：`config/platform-visuals.ts` > 内置平台配置 > 自动文字 fallback。
