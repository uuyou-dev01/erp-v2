# 项目文档目录

## 文档结构

```
docs/
├── README.md                          # 本文档
├── overview.md                        # 项目概述
├── domain.md                          # 领域模型
├── constraints.md                     # 系统约束
├── tech-stack.md                      # 技术栈
├── ui.md                              # UI规范
│
├── modules/                           # 模块文档
│   ├── procurement.md                 # 采购模块
│   ├── inventory.md                   # 库存模块
│   ├── sales.md                       # 销售模块
│   ├── listing.md                     # 上架模块
│   ├── intelligence.md                # 智能推荐模块
│   ├── marketplace-distribution.md    # 货盘分销系统（待实施）
│   ├── EMPTY_STATES_COMPLETE.md       # 空状态完成记录
│   ├── LIST_PAGES_ENHANCED.md         # 列表页增强记录
│   └── LISTING_MODULE_COMPLETE.md     # Listing模块完成记录
│
├── setup/                             # 安装配置文档
│   ├── QUICK_START.md                 # 快速开始
│   ├── SETUP_COMPLETE.md              # 安装完成指南
│   ├── DATABASE_SETUP.md              # 数据库设置
│   ├── DATABASE_SETUP_SUMMARY.md      # 数据库设置摘要
│   ├── DATABASE_URL_GUIDE.md          # 数据库URL指南
│   ├── FIND_POSTGRES_INFO.md          # 查找PostgreSQL信息
│   ├── FIX_POSTGRES_AUTH.md           # 修复PostgreSQL认证
│   └── PGADMIN_CONNECTION_GUIDE.md    # pgAdmin连接指南
│
├── phases/                            # 开发阶段记录
│   ├── PHASE_2_1_COMPLETE.md          # 阶段2.1完成
│   ├── PHASE_2_2_COMPLETE.md          # 阶段2.2完成
│   ├── PHASE_2_3_COMPLETE.md          # 阶段2.3完成
│   ├── PHASE_3_COMPLETE.md            # 阶段3完成
│   ├── PHASE_4_COMPLETE.md            # 阶段4完成
│   └── PHASE_5_COMPLETE.md            # 阶段5完成
│
└── MARKETPLACE_GAP_ANALYSIS.md        # 货盘市场差距分析

```

## 文档分类说明

### 核心设计文档
位于 `docs/` 根目录，包含系统的核心设计理念和架构：
- `overview.md` - 项目整体概述和业务特征
- `domain.md` - 领域模型和核心抽象
- `constraints.md` - 系统硬约束
- `tech-stack.md` - 技术栈选型
- `ui.md` - UI设计规范

### 模块文档
位于 `docs/modules/`，每个业务模块的详细设计：
- 模块职责和边界
- 数据模型
- 业务规则
- API设计
- 实现记录

### 安装配置文档
位于 `docs/setup/`，系统安装和配置相关：
- 快速开始指南
- 数据库配置
- 环境设置
- 常见问题解决

### 开发阶段记录
位于 `docs/phases/`，记录各开发阶段的完成情况：
- 功能清单
- 实现细节
- 测试结果
- 遗留问题

## 快速导航

### 新手入门
1. [项目概述](overview.md) - 了解项目背景
2. [快速开始](setup/QUICK_START.md) - 快速搭建开发环境
3. [技术栈](tech-stack.md) - 了解使用的技术

### 开发指南
1. [领域模型](domain.md) - 理解核心业务概念
2. [系统约束](constraints.md) - 了解设计约束
3. [UI规范](ui.md) - 遵循UI设计规范

### 模块开发
- [采购模块](modules/procurement.md)
- [库存模块](modules/inventory.md)
- [销售模块](modules/sales.md)
- [上架模块](modules/listing.md)
- [智能推荐](modules/intelligence.md)

### 待实施功能
- [货盘分销系统](modules/marketplace-distribution.md)
- [差距分析](MARKETPLACE_GAP_ANALYSIS.md)

## 文档维护规范

### 新增模块文档
1. 在 `docs/modules/` 创建模块文档
2. 包含：职责、数据模型、业务规则、API
3. 更新本README的导航链接

### 完成记录文档
1. 在 `docs/modules/` 创建完成记录
2. 命名格式：`{MODULE}_COMPLETE.md`
3. 包含：功能清单、实现细节、文件清单

### 阶段记录文档
1. 在 `docs/phases/` 创建阶段记录
2. 命名格式：`PHASE_{X}_COMPLETE.md`
3. 包含：阶段目标、完成功能、下一步计划

---

*最后更新：2026-02-26*
