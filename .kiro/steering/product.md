# Product Overview

This is a cross-border trading ERP system designed for resale/arbitrage businesses across multiple countries and product categories.

## Core Business Model

- Supports both new and used/defective goods
- Enables "sell-first-buy-later" (purchase-for-order) and inventory-based sales
- Multi-country flows: China ↔ Japan, Japan ↔ US/EU, Global ↔ China
- Multi-warehouse support: domestic warehouses, freight forwarders, friend consignment
- Multi-platform listing with inventory sync alerts

## Key Modules

- **Procurement**: Purchase orders and cost formation
- **Inventory & Warehouse**: Stock management, lot tracking, and warehouse operations
- **Sales**: Order processing, inventory allocation, and fee distribution
- **Intelligence**: Reference pricing, pricing recommendations, restock suggestions, promotion strategies
- **Listing**: Multi-platform listing management and delisting alerts
- **Finance**: Accounting and cash flow (later phase)
- **Account & Permission**: Multi-user collaboration and permissions

## Design Philosophy

- Inventory changes must be traceable through StockLedger
- Costs are fixed at inventory formation time (no retroactive changes)
- Recommendations must be explainable and auditable
- Split operations are explicit events, not state changes
- Allocation happens before confirmation
