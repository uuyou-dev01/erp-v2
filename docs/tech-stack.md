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

### 不采用
- NoSQL 作为主账库（不适合记账/审计）

---