# 货盘分销市场模块设计

## 业务场景

货盘分销市场是一个B2B分销平台，允许用户将自己采购的货物发布到公共市场，供其他用户浏览和联系购买。

### 核心特征

1. **多租户架构**：每个Store是独立的租户，有自己的私有库存ERP
2. **公共市场**：MarketplaceListing是跨Store的公共数据
3. **货盘发布**：用户可以选择自己的库存（Lot或ItemUnit）发布到市场
4. **信息展示**：
   - 商品信息（SKU、数量、成色、照片）
   - 价格信息（批发价、建议零售价）
   - 卖家信息（联系方式、公司名称）
   - 上架人信息（发布者）
5. **互动功能**：
   - 浏览货盘
   - 下载商品照片
   - 查看联系方式
   - 标记感兴趣
   - 留言咨询

## 数据模型设计

### MarketplaceListing（货盘）

```prisma
model MarketplaceListing {
  id              String   @id @default(cuid())
  
  // 卖家信息
  sellerStoreId   String
  sellerStoreName String   // 冗余字段，方便显示
  sellerContact   String   // 联系方式（电话/微信/邮箱）
  sellerCompany   String?  // 公司名称
  publishedBy     String   // 发布人姓名
  publishedByUserId String // 发布人ID
  
  // 货盘基本信息
  title           String   // 货盘标题
  description     String?  @db.Text // 货盘描述
  category        String?  // 分类
  tags            Json?    // 标签数组
  
  // 库存关联
  sourceType      String   // LOT, ITEM_UNIT, MIXED（混合）
  inventoryItems  Json     // 关联的库存项数组 [{type, id, quantity}]
  
  // 价格信息
  wholesalePrice  Decimal  @db.Decimal(19, 4) // 批发价
  suggestedRetailPrice Decimal? @db.Decimal(19, 4) // 建议零售价
  currency        String
  minOrderQty     Decimal? @db.Decimal(19, 4) // 最小起订量
  totalQtyAvailable Decimal @db.Decimal(19, 4) // 可售总量
  
  // 商品信息
  photos          Json?    // 照片URL数组
  location        String?  // 货物所在地
  shippingInfo    String?  @db.Text // 物流信息
  
  // 状态管理
  status          String   @default("ACTIVE") // ACTIVE, SOLD_OUT, DELISTED
  viewCount       Int      @default(0) // 浏览次数
  interestedCount Int      @default(0) // 感兴趣人数
  
  // 时间戳
  publishedAt     DateTime @default(now())
  expiresAt       DateTime? // 过期时间
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // 关系
  sellerStore     Store    @relation("SellerListings", fields: [sellerStoreId], references: [id], onDelete: Cascade)
  interests       MarketplaceInterest[]
  inquiries       MarketplaceInquiry[]
  
  @@index([sellerStoreId])
  @@index([status])
  @@index([category])
  @@index([publishedAt])
  @@map("marketplace_listings")
}
```

### MarketplaceInterest（感兴趣标记）

```prisma
model MarketplaceInterest {
  id          String   @id @default(cuid())
  listingId   String
  storeId     String   // 感兴趣的买家Store
  userId      String   // 感兴趣的用户
  notes       String?  @db.Text // 备注
  createdAt   DateTime @default(now())
  
  listing     MarketplaceListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  store       Store    @relation("BuyerInterests", fields: [storeId], references: [id], onDelete: Cascade)
  
  @@unique([listingId, storeId])
  @@index([listingId])
  @@index([storeId])
  @@map("marketplace_interests")
}
```

### MarketplaceInquiry（咨询留言）

```prisma
model MarketplaceInquiry {
  id          String   @id @default(cuid())
  listingId   String
  fromStoreId String   // 询问方Store
  fromUserId  String   // 询问方用户
  fromUserName String  // 询问方姓名
  fromContact String   // 询问方联系方式
  message     String   @db.Text // 留言内容
  isPublic    Boolean  @default(false) // 是否公开显示
  createdAt   DateTime @default(now())
  
  listing     MarketplaceListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  fromStore   Store    @relation("BuyerInquiries", fields: [fromStoreId], references: [id], onDelete: Cascade)
  
  @@index([listingId])
  @@index([fromStoreId])
  @@map("marketplace_inquiries")
}
```

## 功能模块

### 1. 发布货盘

**入口**：库存管理页面 → 选择库存 → "发布到市场"

**流程**：
1. 选择要发布的库存（可多选Lot或ItemUnit）
2. 填写货盘信息：
   - 标题、描述、分类、标签
   - 批发价、建议零售价、最小起订量
   - 上传/选择照片
   - 填写联系方式、公司名称
   - 物流信息
3. 预览并发布
4. 发布后库存状态不变（仍在自己的ERP中）

### 2. 浏览市场

**入口**：导航栏 → "货盘市场"

**功能**：
- 列表展示所有货盘（卡片式布局）
- 筛选：分类、价格区间、地区
- 搜索：关键词搜索
- 排序：最新、价格、浏览量

### 3. 货盘详情

**展示内容**：
- 商品信息：标题、描述、照片、SKU信息
- 价格信息：批发价、建议零售价、最小起订量
- 卖家信息：公司名称、联系方式、上架人
- 货物信息：所在地、可售数量、物流信息

**操作**：
- 下载照片（批量下载）
- 标记感兴趣
- 留言咨询
- 复制联系方式

### 4. 我的货盘

**入口**：导航栏 → "我的货盘"

**功能**：
- 查看自己发布的货盘
- 编辑货盘信息
- 下架货盘
- 查看浏览量、感兴趣人数
- 查看咨询留言

### 5. 我的关注

**入口**：导航栏 → "我的关注"

**功能**：
- 查看标记感兴趣的货盘
- 添加备注
- 取消关注

## 权限设计

### 数据隔离

1. **私有数据（Store级别）**：
   - SKU、Location、InventoryLot、ItemUnit
   - PurchaseOrder、CustomerOrder
   - 只有本Store用户可见

2. **公共数据（跨Store）**：
   - MarketplaceListing
   - 所有Store用户都可见

3. **关联数据（Store级别）**：
   - MarketplaceInterest、MarketplaceInquiry
   - 只有相关Store可见

### 操作权限

- **发布货盘**：需要有库存管理权限
- **浏览市场**：所有登录用户
- **标记感兴趣**：所有登录用户
- **留言咨询**：所有登录用户
- **编辑/下架**：只能操作自己发布的货盘

## 技术实现要点

### 1. 库存关联

货盘发布时不锁定库存，只记录关联关系：

```typescript
inventoryItems: [
  { type: "LOT", id: "lot_123", quantity: 100 },
  { type: "ITEM_UNIT", id: "item_456", quantity: 1 }
]
```

### 2. 照片管理

- 可以使用ItemUnit的photos字段
- 也可以单独上传货盘照片
- 支持批量下载（生成ZIP）

### 3. 联系方式

- 存储在MarketplaceListing.sellerContact
- 可以是电话、微信、邮箱等
- 前端显示时可以选择性隐藏部分（如：138****1234）
- 点击"查看联系方式"后完整显示

### 4. 实时更新

- 浏览量：每次访问详情页+1
- 感兴趣人数：根据MarketplaceInterest表统计
- 可售数量：可以定期同步库存实际数量（可选）

## UI设计建议

### 市场列表页

```
┌─────────────────────────────────────────┐
│  货盘市场                    [发布货盘]  │
├─────────────────────────────────────────┤
│  [搜索框]  [分类▼] [价格▼] [地区▼]     │
├─────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐          │
│  │ 图片 │  │ 图片 │  │ 图片 │          │
│  │标题  │  │标题  │  │标题  │          │
│  │¥价格 │  │¥价格 │  │¥价格 │          │
│  │卖家  │  │卖家  │  │卖家  │          │
│  └──────┘  └──────┘  └──────┘          │
└─────────────────────────────────────────┘
```

### 货盘详情页

```
┌─────────────────────────────────────────┐
│  [返回]  货盘详情                        │
├─────────────────────────────────────────┤
│  ┌────────────┐  标题：XXX              │
│  │            │  批发价：¥XXX            │
│  │  商品图片  │  建议零售价：¥XXX        │
│  │  轮播图    │  最小起订：XX件          │
│  │            │  可售数量：XXX           │
│  └────────────┘                          │
│                                          │
│  商品描述：XXXXXXX                       │
│                                          │
│  卖家信息：                              │
│  公司：XXX                               │
│  联系方式：[点击查看]                    │
│  上架人：XXX                             │
│  货物所在地：XXX                         │
│                                          │
│  [下载照片] [标记感兴趣] [留言咨询]     │
└─────────────────────────────────────────┘
```

## 实施步骤

1. **Phase 1：数据模型**
   - 添加MarketplaceListing、MarketplaceInterest、MarketplaceInquiry表
   - 更新Store关系
   - 运行数据库迁移

2. **Phase 2：后端API**
   - 货盘CRUD操作
   - 市场浏览和搜索
   - 感兴趣和咨询功能

3. **Phase 3：前端页面**
   - 市场列表页
   - 货盘详情页
   - 发布货盘表单
   - 我的货盘管理
   - 我的关注列表

4. **Phase 4：增强功能**
   - 照片批量下载
   - 实时通知
   - 数据统计
   - 推荐算法

## 注意事项

1. **库存同步**：货盘发布后，如果库存被销售，需要考虑是否自动下架
2. **隐私保护**：联系方式的显示需要权限控制
3. **防刷机制**：浏览量、感兴趣等需要防止恶意刷数据
4. **图片存储**：需要考虑图片存储方案（本地/云存储）
5. **搜索优化**：大量货盘时需要考虑搜索性能
