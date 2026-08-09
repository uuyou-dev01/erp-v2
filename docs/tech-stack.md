## tech-stack.md

### 前端

- Next.js（App Router）
- React + TypeScript
- shadcn/ui 作为基础组件库

### React 组件规划原则

- Page Component：页面级，仅负责布局与数据装配
- Feature Component：一个明确业务动作（如 AllocateInventory）
- UI Component：纯展示，无业务逻辑
- 禁止在组件中直接计算成本/推荐

### 后端

- Next.js Server Actions / API Routes
- Prisma ORM
- PostgreSQL（主库）

### 任务与计算

- Redis + BullMQ（队列/定时任务）
- 离线批处理为主（每日 + 事件触发）
- Decimal.js 用于金额计算

### 智能策略

- 规则/统计优先（MVP）
- 推荐结果落表（Snapshot / Recommendation）
- 后期可扩展抓价 Worker、ML 服务

### 商品情报采集客户端（规划）

- Chrome / Edge：Manifest V3 + TypeScript + activeTab + Side Panel
- iPhone / iPad：SwiftUI 容器 App + Share Extension + Keychain + Apple Vision OCR
- Safari：Safari Web Extension，复用浏览器网页解析核心
- 共享协议：版本化 OpenAPI / JSON Schema
- 外部采集统一进入 ERP Capture API 和采集审核箱
- Android 不在当前范围

详见 [商品情报采集技术架构](product-intelligence-capture/TECHNICAL_ARCHITECTURE.md)。

### 不采用

- NoSQL 作为主账库（不适合记账/审计）

---
