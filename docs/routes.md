# 路由与页面地图

当前项目使用 Next.js App Router，业务页面集中在 `app/(dashboard)` 下。
侧边栏导航配置集中在 `config/navigation.ts`。

## 当前主导航

主导航面向每日操作，保留 6 个一级模块：

| 一级模块 | 当前入口 | 定位 |
| --- | --- | --- |
| 工作台 | `/workbench` | 今日待办、通知、异常处理 |
| 采购与补货 | `/procurement` | 采购单、到货、补货相关动作 |
| 集运与仓配 | `/logistics/consolidations` | 集运批次和跨仓流转 |
| 库存与商品 | `/inventory/sellable` | 库存看板、商品主档、单件、批次、盘点 |
| 上架与订单 | `/listing`, `/sales` | 平台上架、销售订单、履约 |
| 经营分析 | `/reports` | 经营、平台、团队分析 |

## 主入口路由

| 路由 | 页面定位 | 侧边栏分组 |
| --- | --- | --- |
| `/workbench` | 运营工作台、快速录入、流程队列 | 工作台 |
| `/procurement` | 采购单据、到货、入库分流 | 采购与补货 |
| `/logistics/consolidations` | 集运批次列表与详情 | 集运与仓配 |
| `/inventory/sellable` | 库存看板、上架覆盖、跨平台上架入口 | 库存与商品 |
| `/inventory/skus` | 商品主档 | 库存与商品 |
| `/inventory/items` | 单件库存工作台 | 库存与商品 |
| `/inventory/lots` | 库存批次/成本批次 | 库存与商品 |
| `/inventory/stocktake` | 库存盘点与差异提交 | 库存与商品 |
| `/listing` | 已有 Listing 运营、状态、风险和快速售出 | 上架与订单 |
| `/sales` | 销售订单 | 上架与订单 |
| `/reports` | 报表 | 经营分析 |
| `/reports/team` | 团队工作量 | 经营分析 |

## 基础资料与设置

| 路由 | 页面定位 | 侧边栏分组 |
| --- | --- | --- |
| `/dashboard` | 仪表盘 | 设置 |
| `/inventory` | 库存与基础资料入口页 | 设置 / 库存管理 |
| `/inventory/locations` | 仓库位置 | 设置 / 基础资料 |
| `/listing/platforms` | 销售平台配置 | 设置 / 基础资料 |

## 详情与新建页

| 路由模式 | 页面定位 |
| --- | --- |
| `/inventory/skus/new` / `/inventory/skus/[id]` | SKU 新建与详情 |
| `/inventory/items/new` / `/inventory/items/[id]` | 单件库存新建与详情 |
| `/inventory/lots/new` / `/inventory/lots/[id]` | 入库批次新建与详情 |
| `/inventory/locations/new` / `/inventory/locations/[id]` | 仓库位置新建与详情 |
| `/listing/new` / `/listing/[id]` | Listing 新建与详情 |
| `/listing/platforms/new` / `/listing/platforms/[id]` | 销售平台新建与编辑 |
| `/sales/new` / `/sales/[id]` | 销售订单新建与详情 |
| `/procurement/new` / `/procurement/[id]` | 采购单据新建与详情 |
| `/logistics/consolidations` / `/logistics/consolidations/[id]` | 集运批次列表与详情 |

## 兼容路由

这些路由目前只做重定向，保留给旧链接使用，不建议继续放到主导航：

| 旧路由 | 重定向到 |
| --- | --- |
| `/inventory/coverage` | `/inventory/sellable` |
| `/inventory/coverage/pending` | `/inventory/sellable?unlisted=1` |
| `/listing/pending` | `/inventory/sellable?unlisted=1` |

## 当前整理原则

1. 日常操作放在 6 个主导航模块：工作台、采购与补货、集运与仓配、库存与商品、上架与订单、经营分析。
2. 低频配置放在「设置」：仓位、销售平台、团队成员、店铺管理。
3. 暂不迁移现有 URL，先通过导航配置和文档统一认知，避免破坏历史链接。
