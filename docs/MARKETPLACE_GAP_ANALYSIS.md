# 货盘市场实现差距分析

## 现状评估

### ✅ 已有的基础设施

1. **多租户架构**
   - ✅ Store模型已存在
   - ✅ 所有业务数据都有storeId
   - ✅ 数据隔离机制完善

2. **库存管理**
   - ✅ InventoryLot（批次库存）
   - ✅ ItemUnit（单品库存）
   - ✅ SKU（商品定义）
   - ✅ Location（仓库位置）
   - ✅ 照片存储（ItemUnit.photos）

3. **用户系统**
   - ✅ User模型存在
   - ✅ 用户与Store关联
   - ✅ 基础角色权限（role字段）

4. **技术栈**
   - ✅ Next.js + TypeScript
   - ✅ Prisma ORM
   - ✅ PostgreSQL
   - ✅ shadcn/ui组件库
   - ✅ Server Actions

## ❌ 缺失的部分

### 1. 数据库表（必须新增）

#### MarketplaceListing（货盘表）
```prisma
model MarketplaceListing {
  id                   String   @id @default(cuid())
  sellerStoreId        String
  sellerStoreName      String
  sellerContact        String
  sellerCompany        String?
  publishedBy          String
  publishedByUserId    String
  title                String
  description          String?  @db.Text
  category             String?
  tags                 Json?
  sourceType           String
  inventoryItems       Json
  wholesalePrice       Decimal  @db.Decimal(19, 4)
  suggestedRetailPrice Decimal? @db.Decimal(19, 4)
  currency             String
  minOrderQty          Decimal? @db.Decimal(19, 4)
  totalQtyAvailable    Decimal  @db.Decimal(19, 4)
  photos               Json?
  location             String?
  shippingInfo         String?  @db.Text
  status               String   @default("ACTIVE")
  viewCount            Int      @default(0)
  interestedCount      Int      @default(0)
  publishedAt          DateTime @default(now())
  expiresAt            DateTime?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  
  sellerStore          Store    @relation("SellerListings", fields: [sellerStoreId], references: [id])
  interests            MarketplaceInterest[]
  inquiries            MarketplaceInquiry[]
}
```

#### MarketplaceInterest（感兴趣标记）
```prisma
model MarketplaceInterest {
  id          String   @id @default(cuid())
  listingId   String
  storeId     String
  userId      String
  notes       String?  @db.Text
  createdAt   DateTime @default(now())
  
  listing     MarketplaceListing @relation(fields: [listingId], references: [id])
  store       Store    @relation("BuyerInterests", fields: [storeId], references: [id])
}
```

#### MarketplaceInquiry（咨询留言）
```prisma
model MarketplaceInquiry {
  id           String   @id @default(cuid())
  listingId    String
  fromStoreId  String
  fromUserId   String
  fromUserName String
  fromContact  String
  message      String   @db.Text
  isPublic     Boolean  @default(false)
  createdAt    DateTime @default(now())
  
  listing      MarketplaceListing @relation(fields: [listingId], references: [id])
  fromStore    Store    @relation("BuyerInquiries", fields: [fromStoreId], references: [id])
}
```

### 2. Store模型需要扩展

**当前Store缺少的字段：**
```prisma
model Store {
  // ... 现有字段 ...
  
  // 需要新增：
  contactPerson  String?  // 联系人姓名
  contactPhone   String?  // 联系电话
  contactEmail   String?  // 联系邮箱
  contactWechat  String?  // 微信号
  companyName    String?  // 公司名称
  address        String?  // 公司地址
  
  // 需要新增的关系：
  marketplaceListings MarketplaceListing[] @relation("SellerListings")
  marketplaceInterests MarketplaceInterest[] @relation("BuyerInterests")
  marketplaceInquiries MarketplaceInquiry[] @relation("BuyerInquiries")
}
```

### 3. User模型需要扩展

**当前User缺少的字段：**
```prisma
model User {
  // ... 现有字段 ...
  
  // 需要新增：
  phone      String?  // 手机号
  wechat     String?  // 微信号
  avatar     String?  // 头像URL
  department String?  // 部门
  position   String?  // 职位
}
```

### 4. 后端功能（需要开发）

#### Server Actions
- ❌ `app/actions/marketplace-listings.ts`
  - createMarketplaceListing()
  - updateMarketplaceListing()
  - deleteMarketplaceListing()
  - getMarketplaceListings()
  - getMarketplaceListingById()
  - searchMarketplaceListings()
  - incrementViewCount()

- ❌ `app/actions/marketplace-interests.ts`
  - addInterest()
  - removeInterest()
  - getMyInterests()
  - getListingInterests()

- ❌ `app/actions/marketplace-inquiries.ts`
  - createInquiry()
  - getListingInquiries()
  - getMyInquiries()

#### 辅助功能
- ❌ 照片批量下载功能
- ❌ 库存可用性检查（发布时）
- ❌ 自动下架逻辑（库存售罄时）

### 5. 前端页面（需要开发）

#### 页面结构
```
app/(dashboard)/marketplace/
├── page.tsx                    # 市场列表页
├── [id]/
│   └── page.tsx               # 货盘详情页
├── my-listings/
│   └── page.tsx               # 我的货盘
├── my-interests/
│   └── page.tsx               # 我的关注
└── new/
    └── page.tsx               # 发布货盘
```

#### 组件
```
components/marketplace/
├── marketplace-listing-card.tsx      # 货盘卡片
├── marketplace-listing-form.tsx      # 发布表单
├── marketplace-filter.tsx            # 筛选器
├── marketplace-search.tsx            # 搜索框
├── interest-button.tsx               # 感兴趣按钮
├── inquiry-form.tsx                  # 咨询表单
├── contact-info-display.tsx          # 联系方式显示
└── photo-gallery.tsx                 # 照片画廊
```

### 6. 导航菜单（需要更新）

**Sidebar需要新增：**
```typescript
{
  title: "货盘市场",
  icon: Store,
  items: [
    { title: "浏览市场", href: "/marketplace" },
    { title: "我的货盘", href: "/marketplace/my-listings" },
    { title: "我的关注", href: "/marketplace/my-interests" },
    { title: "发布货盘", href: "/marketplace/new" },
  ],
}
```

### 7. 权限和安全（需要实现）

- ❌ 权限中间件（确保只能编辑自己的货盘）
- ❌ 联系方式脱敏显示
- ❌ 防刷机制（浏览量、感兴趣）
- ❌ 图片上传限制（大小、格式）
- ❌ 敏感词过滤（标题、描述）

### 8. 业务逻辑（需要实现）

- ❌ 库存同步逻辑
  - 发布时检查库存是否足够
  - 库存变化时更新货盘状态
  - 库存售罄时自动下架或标记

- ❌ 通知机制
  - 有人感兴趣时通知卖家
  - 有人留言时通知卖家
  - 货盘状态变化时通知关注者

- ❌ 数据统计
  - 浏览量统计
  - 感兴趣人数统计
  - 转化率分析

## 实施优先级

### Phase 1: 核心数据模型（必须）
1. ✅ 设计文档已完成（docs/marketplace.md）
2. ❌ 更新Prisma Schema
3. ❌ 运行数据库迁移
4. ❌ 生成Prisma Client

### Phase 2: 基础后端（必须）
1. ❌ marketplace-listings.ts（CRUD）
2. ❌ marketplace-interests.ts
3. ❌ marketplace-inquiries.ts

### Phase 3: 核心前端（必须）
1. ❌ 市场列表页
2. ❌ 货盘详情页
3. ❌ 发布货盘表单
4. ❌ 更新导航菜单

### Phase 4: 增强功能（可选）
1. ❌ 我的货盘管理
2. ❌ 我的关注列表
3. ❌ 照片批量下载
4. ❌ 高级搜索和筛选
5. ❌ 通知系统
6. ❌ 数据统计

## 技术挑战和解决方案

### 挑战1: 库存同步
**问题**：货盘发布后，库存可能被销售，如何保持一致性？

**方案**：
- 方案A：发布时不锁定库存，只记录关联（推荐）
- 方案B：发布时锁定库存，创建虚拟分配
- 方案C：实时同步，库存变化时自动更新货盘

**推荐**：方案A + 定期检查，简单可靠

### 挑战2: 照片存储
**问题**：照片存储在哪里？如何管理？

**方案**：
- 方案A：复用ItemUnit的photos字段
- 方案B：单独上传到MarketplaceListing.photos
- 方案C：使用云存储服务（S3/OSS）

**推荐**：方案B（短期）→ 方案C（长期）

### 挑战3: 跨Store查询性能
**问题**：市场列表页需要查询所有Store的货盘，可能很慢

**方案**：
- 添加数据库索引（status, category, publishedAt）
- 实现分页（每页20-50条）
- 考虑缓存热门货盘
- 后期可以用搜索引擎（Elasticsearch）

### 挑战4: 联系方式隐私
**问题**：如何保护卖家联系方式？

**方案**：
- 前端脱敏显示（138****1234）
- 点击"查看联系方式"后完整显示
- 记录查看日志（防止滥用）
- 可以设置"仅感兴趣用户可见"

## 估算工作量

### 开发时间（单人）
- Phase 1（数据模型）：2-3小时
- Phase 2（后端API）：4-6小时
- Phase 3（核心前端）：8-12小时
- Phase 4（增强功能）：8-16小时

**总计**：22-37小时（3-5个工作日）

### 测试时间
- 单元测试：4-6小时
- 集成测试：4-6小时
- 用户测试：2-4小时

**总计**：10-16小时（1-2个工作日）

## 总结

### 必须新增的内容
1. ✅ 3个新数据表（MarketplaceListing, Interest, Inquiry）
2. ✅ Store和User模型扩展（联系方式字段）
3. ✅ 3个Server Actions文件
4. ✅ 4-5个前端页面
5. ✅ 7-8个React组件
6. ✅ 导航菜单更新

### 可以复用的内容
1. ✅ 现有的Store多租户架构
2. ✅ 现有的库存管理系统
3. ✅ 现有的UI组件库（shadcn/ui）
4. ✅ 现有的照片存储机制
5. ✅ 现有的权限系统基础

### 风险评估
- 🟢 技术风险：低（都是成熟技术栈）
- 🟡 业务风险：中（需要明确库存同步策略）
- 🟢 性能风险：低（初期数据量不大）
- 🟡 安全风险：中（需要注意隐私保护）

## 下一步建议

**立即开始**：
1. 更新Prisma Schema（添加3个新表）
2. 扩展Store和User模型
3. 运行数据库迁移
4. 开发基础CRUD功能

**你准备好开始了吗？我可以立即开始实施Phase 1！**
