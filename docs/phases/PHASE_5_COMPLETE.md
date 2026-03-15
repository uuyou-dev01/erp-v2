# Phase 5: Item Units (Individual Items) - COMPLETE ✅

## Overview
Implemented complete individual item management for used, defective, or unique items with condition tracking, photos, and owner/holder support.

## What Was Built

### Server Actions (`app/actions/item-units.ts`)
- `getItemUnits(storeId)` - List all item units with SKU and location
- `getItemUnitById(id)` - Get item details with allocations and ledger history
- `createItemUnit(data)` - Create new item unit and write to StockLedger
- `updateItemUnit(id, data)` - Update item details (condition, photos, owner, holder, notes)
- `deleteItemUnit(id)` - Soft delete by setting status to CONSUMED
- `isItemUnitAvailable(id)` - Check if item is available for allocation

### Pages
1. **List Page** (`app/(dashboard)/inventory/items/page.tsx`)
   - Table view of all item units
   - Shows ID, SKU, location, condition, cost, status, owner
   - Quick navigation to item details

2. **New Item Page** (`app/(dashboard)/inventory/items/new/page.tsx`)
   - Create new individual item
   - SKU and location selection
   - Unit cost and currency
   - Condition grade selection
   - Photo URLs management
   - Owner/Holder IDs
   - Notes field

3. **Item Detail Page** (`app/(dashboard)/inventory/items/[id]/page.tsx`)
   - Item information cards (SKU, location, cost, created date)
   - Condition grade badge
   - Photo gallery
   - Ownership information (owner/holder)
   - Notes display
   - Allocation history table
   - Inline edit form (when available and not allocated)
   - Stock ledger history

### Components

**ItemUnitForm** (`components/inventory/item-unit-form.tsx`)
- Dual mode: create and edit
- SKU and location dropdowns (create only)
- Unit cost and currency inputs (create only)
- Condition grade selector (NEW, LIKE_NEW, EXCELLENT, GOOD, FAIR, POOR, DEFECTIVE)
- Photo URL management (add/remove)
- Owner and Holder ID inputs
- Notes textarea
- Form validation

## Key Features

### Condition Tracking
- 7 condition grades: NEW, LIKE_NEW, EXCELLENT, GOOD, FAIR, POOR, DEFECTIVE
- Displayed as badges throughout the UI
- Editable when item is available

### Photo Management
- Multiple photo URLs per item
- Add/remove photos dynamically
- Stored as JSON array in database
- Grid display on detail page

### Owner/Holder System
- Owner: Who owns the item (货主)
- Holder: Who currently holds/sells the item (持有/代卖者)
- Supports consignment and multi-user collaboration
- Editable when item is available

### Status Workflow
```
AVAILABLE → ALLOCATED → CONSUMED
     ↓
RETURN_CHECK
```

- **AVAILABLE**: Can be allocated to orders
- **ALLOCATED**: Reserved for an order
- **CONSUMED**: Sold and shipped
- **RETURN_CHECK**: Under return inspection

### StockLedger Integration
- Writes INBOUND_PURCHASE on creation (deltaQty = +1)
- Entity type: ITEM_UNIT
- Full ledger history displayed on detail page
- Supports future operations: OUTBOUND_SALE, ADJUST, TRANSFER, SPLIT

### Allocation Support
- Can be allocated to order lines
- Shows allocation history with order details
- Prevents editing when allocated
- Prevents deletion when allocated

## Database Schema Updates

### ItemUnit Model
```prisma
model ItemUnit {
  id             String   @id @default(cuid())
  storeId        String
  skuId          String
  locationId     String
  unitCost       Decimal  @db.Decimal(19, 4)
  costCurrency   String
  fxRateId       String?
  conditionGrade String?
  photos         Json?
  ownerId        String?
  holderId       String?
  notes          String?  @db.Text
  sourceType     String   // PURCHASE, SPLIT, MANUAL
  sourceId       String
  status         String   @default("AVAILABLE")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  store       Store             @relation(...)
  sku         SKU               @relation(...)
  location    Location          @relation(...)
  allocations OrderAllocation[]
  listings    Listing[]
}
```

### CustomerOrder Model (Updated)
Added missing fields to match UI requirements:
- `orderNumber` (unique)
- `customerName` (required)
- `customerEmail`
- `customerPhone`
- `shippingAddress`
- `orderDate` (required)

### OrderAllocation Model (Updated)
Added missing fields:
- `status` (PENDING, ALLOCATED, SHIPPED, DELIVERED)
- `createdAt`
- `updatedAt`

## Design Constraints Satisfied

✅ **Constraint #1**: All inventory changes write to StockLedger (createItemUnit writes INBOUND_PURCHASE)
✅ **Constraint #4**: unitCost is immutable once set (not editable after creation)
✅ **Constraint #7**: All data includes storeId for multi-tenancy

## Files Created/Modified

### New Files
- `app/actions/item-units.ts`
- `app/(dashboard)/inventory/items/page.tsx`
- `app/(dashboard)/inventory/items/new/page.tsx`
- `app/(dashboard)/inventory/items/[id]/page.tsx`
- `components/inventory/item-unit-form.tsx`

### Modified Files
- `prisma/schema.prisma` (added notes field to ItemUnit, updated CustomerOrder and OrderAllocation)
- `components/sales/customer-order-form.tsx` (updated to include all required fields)
- `app/actions/customer-orders.ts` (updated CreateCustomerOrderInput interface)

## Testing Status

✅ Build successful (`npm run build`)
✅ TypeScript compilation passed
✅ Prisma client regenerated
✅ All imports resolved

## Use Cases

### 1. Used Goods (中古商品)
- Track individual used items with condition grades
- Add photos for each item
- Record owner and holder for consignment

### 2. Defective Items (瑕疵品)
- Mark condition as DEFECTIVE or POOR
- Add photos showing defects
- Track separately from new inventory

### 3. Collectibles/Unique Items
- Each item has unique photos and notes
- Individual cost tracking
- Separate allocation per item

### 4. Consignment (代卖)
- Owner: Original owner of the item
- Holder: Person currently selling the item
- Track ownership changes

## Next Steps (Future Enhancements)

1. **Item Unit Allocation in Sales**
   - Update allocateInventory to support ItemUnit
   - Add item unit selection in allocation form
   - Show item photos during allocation

2. **Inventory Splits**
   - Split端盒 (box) into 单盒 (individual items)
   - Create InventorySplit records
   - Generate ItemUnits from splits

3. **Transfer Operations**
   - Move items between locations
   - Write TRANSFER_OUT/TRANSFER_IN to ledger
   - Track transfer history

4. **Return Processing**
   - RETURN_CHECK status workflow
   - Inspection and re-grading
   - Return to AVAILABLE or mark as CONSUMED

5. **Photo Upload**
   - Direct file upload instead of URLs
   - Image storage integration
   - Thumbnail generation

6. **Batch Operations**
   - Bulk create items
   - Batch update conditions
   - Mass transfer

## Notes

- ItemUnit complements InventoryLot (Lot = quantity-based new goods, ItemUnit = individual items)
- Photos stored as JSON array of URLs (future: integrate with file storage)
- Owner/Holder system prepared for multi-user collaboration
- sourceType supports PURCHASE, SPLIT, and MANUAL
- Status workflow prepared for returns and inspections
- All monetary calculations use Decimal.js for precision
- Immutable cost principle maintained (constraint #4)
