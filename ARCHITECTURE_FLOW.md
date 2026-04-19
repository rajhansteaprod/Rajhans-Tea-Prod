# 📐 Complete Data Flow: MongoDB → API Response

## **Visual Flow Diagram**

```
┌─────────────────────────────────────────────────────────────────┐
│  API REQUEST: GET /api/v1/admin/products?page=1&search=tea     │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ ROUTES (catalog.routes.ts)                                      │
│ ─────────────────────────────────────                           │
│ router.get('/products',                                         │
│   validate(listProductsSchema),     ◄─ Input Validation        │
│   catalog.listProducts              ◄─ Call Controller         │
│ )                                                               │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ CONTROLLER (catalog.controller.ts)                              │
│ ──────────────────────────────────                              │
│ export const listProducts = async (req, res) => {              │
│   const { products, meta } = await productService.list(...)    │
│   sendPaginated(res, products, meta)                           │
│ }                                                               │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVICE (product.service.ts)                                    │
│ ─────────────────────────────                                   │
│ async list(query) {                                             │
│   const { products, total } =                                   │
│     await productRepo.findList({...})  ◄─ Call Repository      │
│                                                                 │
│   return {                                                      │
│     products: products.map(p => ProductDTO.toAdmin(p)),        │
│     meta: buildPaginationMeta(...)                             │
│   }                                                             │
│ }                                                               │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ REPOSITORY (product.repository.ts)                              │
│ ────────────────────────────────────                            │
│ async findList(options) {                                       │
│   const filter = { /* build MongoDB filter */ }                │
│   const products = await this.model                            │
│     .find(filter)          ◄─ Query MongoDB                    │
│     .populate('category')  ◄─ Join Data                        │
│     .skip(skip)            ◄─ Pagination                       │
│     .limit(limit)                                               │
│     .sort({ createdAt: -1 })                                   │
│     .exec()                                                     │
│   const total = await this.model.countDocuments(filter)        │
│   return { products, total }                                    │
│ }                                                               │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ MONGODB (product.model.ts)                                      │
│ ──────────────────────────────                                  │
│ Schema: {                                                       │
│   name: String                                                  │
│   basePrice: Number                                             │
│   discountedPrice: Number                    ◄─ Your Data      │
│   category: ObjectId (ref: 'Category')                          │
│   stock: Number                                                 │
│   ...                                                           │
│ }                                                               │
│                                                                 │
│ Actual Data in Database:                                        │
│ {                                                               │
│   _id: ObjectId("..."),                                         │
│   name: "Green Tea Premium",                                    │
│   basePrice: 500,                                               │
│   discountedPrice: 399,                                         │
│   category: ObjectId("..."),                                    │
│   stock: 100,                                                   │
│   ...                                                           │
│ }                                                               │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
        ┌─────────────────────────────┴──────────────────────────┐
        │                                                         │
        ▼ (Data flows back UP)                                   │
┌────────────────────────────────────┐                           │
│ Populate category details          │                           │
│ {                                  │                           │
│   _id: "...",                      │                           │
│   name: "Green Tea Premium",       │                           │
│   basePrice: 500,                  │                           │
│   category: {                      │                           │
│     _id: "...",                    │                           │
│     name: "Tea",                   │                           │
│     slug: "tea"                    │                           │
│   },                               │                           │
│   ...                              │                           │
│ }                                  │                           │
└────────────────────────────────────┴──────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ DTO TRANSFORMATION (product.dto.ts)                             │
│ ──────────────────────────────────────                          │
│ ProductDTO.toAdmin(product) → {                                │
│   _id, name, basePrice, discountedPrice,                       │
│   category: { _id, name, slug },                               │
│   ...                                                           │
│ }                                                               │
└─────────────────────────────────────┬───────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ API RESPONSE (JSON)                                             │
│ ─────────────────────                                           │
│ {                                                               │
│   "success": true,                                              │
│   "data": [                                                     │
│     {                                                           │
│       "_id": "...",                                             │
│       "name": "Green Tea Premium",                              │
│       "basePrice": 500,                                         │
│       "discountedPrice": 399,                                   │
│       "category": {                                             │
│         "_id": "...",                                           │
│         "name": "Tea",                                          │
│         "slug": "tea"                                           │
│       }                                                         │
│     }                                                           │
│   ],                                                            │
│   "meta": {                                                     │
│     "page": 1,                                                  │
│     "limit": 10,                                                │
│     "total": 50,                                                │
│     "totalPages": 5                                             │
│   }                                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## **Step-by-Step Tracing Example**

### **Example: Trace a GET /products request**

#### **Step 1️⃣: Find the Model**
```bash
# Location: backend/src/modules/catalog/models/product.model.ts
# What it defines: Database schema structure
```

**Key Questions:**
- ❓ What fields exist? → name, basePrice, discountedPrice, category, etc.
- ❓ What type are they? → String, Number, ObjectId
- ❓ Are there indexes? → For fast queries
- ❓ Relationships? → category (ref: 'Category')

---

#### **Step 2️⃣: Find the Repository**
```bash
# Location: backend/src/modules/catalog/repositories/product.repository.ts
# What it does: Direct database queries
```

**Key Methods:**
```typescript
findList(options)        → Queries MongoDB with filters
findBySlug(slug)         → Find by slug + populate
findByIdPopulated(id)    → Find by ID + populate
slugExists(slug)         → Check if slug exists
```

**What to look for:**
- ✅ How data is queried
- ✅ What filters are applied
- ✅ What gets populated (joins)
- ✅ How sorting/pagination works

---

#### **Step 3️⃣: Find the Service**
```bash
# Location: backend/src/modules/catalog/services/product.service.ts
# What it does: Business logic + repository coordination
```

**Key Methods:**
```typescript
list(query)           → Calls repository.findList()
listPublic(query)     → Only active products
getById(id)          → Get single product
create(data)         → Validate + insert
update(id, data)     → Update product
delete(id)           → Remove product
```

**Business Logic Here:**
- ✅ Validation (category exists, slug unique)
- ✅ Data transformation (ProductDTO)
- ✅ Permission checks
- ✅ Complex queries

---

#### **Step 4️⃣: Find the Controller**
```bash
# Location: backend/src/modules/catalog/catalog.controller.ts
# What it does: Handle HTTP requests
```

**Key Function:**
```typescript
export const listProducts = async (req, res) => {
  const { products, meta } = await productService.list(req.query);
  sendPaginated(res, products, meta);
}
```

**What it does:**
- ✅ Extract query parameters from URL
- ✅ Call service layer
- ✅ Format and send response

---

#### **Step 5️⃣: Find the Routes**
```bash
# Location: backend/src/modules/catalog/catalog.routes.ts
# What it does: Map URLs to controller functions
```

**Route Definition:**
```typescript
router.get(
  '/products',                      // ← URL path
  validate(listProductsSchema),     // ← Input validation
  catalog.listProducts              // ← Controller function
);
```

**What happens:**
- ✅ GET request to `/api/v1/products` hits this route
- ✅ Schema validates query params
- ✅ `listProducts` controller is called

---

## **Quick Reference: What Each Layer Does**

| Layer | File | Purpose | Example |
|-------|------|---------|---------|
| **Model** | `*.model.ts` | Define schema shape | `name: String, price: Number` |
| **Repository** | `*.repository.ts` | Database queries | `find(), findOne(), updateById()` |
| **Service** | `*.service.ts` | Business logic | Validation, DTO transformation, permissions |
| **Controller** | `*.controller.ts` | HTTP handling | Extract params, call service, send response |
| **Routes** | `*.routes.ts` | URL mapping | Connect URL to controller + validation |
| **DTO** | `*.dto.ts` | Transform data | Remove sensitive fields, format response |

---

## **Real-World: Where to Add a New Feature**

**New requirement: Add "inStock" filter to products list**

1. **Model** (already has `stock` field) ✅
2. **Repository** → Add filter in `findList()`:
   ```typescript
   if (options.inStock !== undefined) {
     filter.stock = { $gt: 0 };  // MongoDB query
   }
   ```
3. **Service** → Accept parameter in `list()`:
   ```typescript
   async list(query) {
     // Pass inStock to repository
     const { products } = await this.productRepo.findList({
       inStock: query.inStock
     });
   }
   ```
4. **Controller** → Extract from request:
   ```typescript
   const { products } = await productService.list({
     inStock: req.query.inStock
   });
   ```
5. **Routes** → Validator allows it:
   ```typescript
   query: {
     inStock: z.boolean().optional()
   }
   ```

---

## **MongoDB Express Inspection Checklist**

When viewing data in MongoDB Compass or mongo-express:

- 📦 **View Collection** → See actual documents
- 🔍 **Find Field** → Right-click document field → See its values
- 📊 **Check Relationships** → Look for `ObjectId` fields
- 🏷️ **Identify Indexes** → Check performance queries
- 💾 **Trace Back** → Document fields → Find service using it → Controller → Route

---

## **Debugging Workflow**

**Problem: "Product not showing correct price"**

1. Check **MongoDB** → Verify `basePrice` and `discountedPrice` values
2. Check **Repository** → Does `findList()` return correct data?
3. Check **Service** → Does `list()` process data correctly?
4. Check **DTO** → Is `toAdmin()` hiding the price?
5. Check **Controller** → Is response being sent correctly?
6. Check **Routes** → Is endpoint being called?

---
