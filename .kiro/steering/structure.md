# Project Structure & Organization

## Directory Layout

```
/
├── docs/                    # Business domain documentation
│   ├── overview.md         # Project overview and business characteristics
│   ├── domain.md           # Core domain abstractions and design philosophy
│   ├── constraints.md      # System hard constraints
│   ├── tech-stack.md       # Technical stack details
│   ├── procurement.md      # Procurement module specification
│   ├── inventory.md        # Inventory & warehouse module specification
│   ├── sales.md            # Sales module specification
│   ├── intelligence.md     # Intelligence/recommendation module specification
│   ├── listing.md          # Multi-platform listing module specification
│   └── ui.md               # UI conventions and patterns
├── .kiro/                  # Kiro configuration
│   ├── settings/           # Kiro settings
│   └── steering/           # AI assistant steering rules
└── .vscode/                # VS Code configuration
```

## Module Organization Principles

### Core Domain Objects

- **SKU**: Product abstract definition (category/attributes)
- **InventoryLot**: New goods batch (quantity-based)
- **ItemUnit**: Used/defective individual items (unit-based)
- **StockLedger**: Single source of truth for inventory changes
- **Order / OrderLine**: Sales orders and line items
- **Allocation**: Binding between orders and inventory
- **InventorySplit**: Inventory split events (generic)
- **RefPrice**: Reference price records (observation values)

### Module Boundaries

**Procurement Module**:
- Forms inventory cost and supply source
- Records purchase orders (PurchaseOrder / PurchaseLine)
- Manages purchase cost structure (item price, packaging, fees, discounts)
- Generates inventory at RECEIVED status

**Inventory Module**:
- Single source of truth for "what inventory exists, where, and is it sellable?"
- Manages inventory forms: Lot (new) / ItemUnit (used)
- Manages Locations (warehouses, freight forwarders, friend consignment)
- All inventory changes via StockLedger
- Supports inventory splits (InventorySplit)

**Sales Module**:
- Transaction facts + inventory consumption
- Manages orders (Order / OrderLine)
- Binds inventory via Allocation
- Handles order-level discounts and fee distribution
- Must complete Allocation before CONFIRMED status

**Intelligence Module**:
- Decision support, not factual data
- RefPrice reference price records
- Pricing recommendations (by SKU / platform)
- Restock recommendations (ROP / safety stock)
- Promotion recommendations (turnover days / price reduction tiers)

**Listing Module**:
- Records "where items are listed" not "how many sold"
- Tracks SKU / ItemUnit listing status across platforms
- Generates alerts on inventory changes
- Does not lock inventory (alert-based approach in v1)

## Design Constraints

1. All inventory changes MUST write to StockLedger
2. Orders MUST complete Allocation before CONFIRMED status
3. InventorySplit MUST fully consume source inventory
4. Lot / ItemUnit unitCost is immutable once set
5. Order-level fees and discounts MUST be distributed to line items
6. Recommendation results MUST include algorithm version and input snapshot
7. All business data MUST include storeId (SaaS preparation)
8. Split operations default to one-time completion (no partial splits)
9. Listing only alerts, does not auto-delist (v1)

## UI Structure Conventions

### Page Types

1. **List Page**: Table-based with filtering, sorting, quick actions
2. **Detail Page**: Sectioned display (info / actions / history)
3. **Action Modal**: Clear scope of impact, must show key consequences

### Component Hierarchy

- **Page Component**: Layout and data assembly only
- **Feature Component**: Specific business action (e.g., AllocateInventory)
- **UI Component**: Pure presentation, no business logic

### State-Driven UI

- Before CONFIRMED: Allow modifications
- After CONFIRMED: Read-only + audit trail
- Dangerous operations: Highlighted warnings

## Naming Conventions

- Use descriptive names that reflect business domain
- Follow TypeScript/React conventions for code
- Database tables use PascalCase (Prisma convention)
- API routes follow Next.js conventions
