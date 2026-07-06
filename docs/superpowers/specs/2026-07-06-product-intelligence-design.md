# Product Intelligence Design

## Goal

Build a standalone product intelligence library where members can share product knowledge, market prices, and category expertise without creating inventory, purchase orders, listings, or supply offers.

## Product Positioning

Product intelligence is a data-display module. It records what members know or observe about products: reference purchase prices, reference sale prices, expected margin, source, confidence, suitable platforms, and notes. A record may describe a product that nobody in the system has purchased yet.

This module does not move stock, reserve stock, create fulfillment, or settle money. Later versions can link an intelligence item to marketplace offers, SKU creation, or resale listing actions.

## Data Model

The module has three levels:

- Product group: the shared high-level product family, such as `Nike Air Jordan 1`.
- Product variant: a concrete color, year, version, model, or style under a group, such as `Chicago 2015`.
- Product intelligence observation: member-contributed purchase price, sale price, platform/source, observation date, and note under either a group or a variant.

Visibility for the first version is `PUBLIC`, `ORGANIZATION`, or `PRIVATE`. Public entries are visible to all signed-in users. Private entries are visible only to the contributor store. Organization entries are reserved for the contributor's organization but may fall back to contributor-only behavior until cross-organization discovery is expanded.

## User Flows

1. A member opens 商品情报 and sees public intelligence cards plus their own private cards.
2. A member creates a product group or a variant under an existing group.
3. A member records a simple purchase price and/or sale price with platform/source and observation date. The date defaults to today.
4. A member adds another observation to an existing product.
5. A contributor can edit, hide, or delete their own item while others can only view it.

## First-Version Screens

- `/product-intelligence`: searchable product-group list with filters for category, visibility, and keyword. Cards summarize child variants and visible observations.
- `/product-intelligence/new`: lightweight creation page. Required fields are product or variant name, category or parent group, and at least one purchase/sale price.
- `/product-intelligence/[id]`: detail page with overview, child variants when the item is a group, contributor, observation summary, and observation feed.
- `/product-intelligence/[id]/edit`: edit the item owner fields.

## Out of Scope

- Marketplace matching.
- SKU deduplication and public product master merging.
- Rating systems, likes, comments, and moderation queues.
- Automated scraping or external imports.
- Creating procurement, listing, or supply-offer records from this module.

## Verification

Tests should prove that public items are visible to other stores, private items are hidden, contributors can add observations, and non-owners cannot edit owner-controlled fields.
