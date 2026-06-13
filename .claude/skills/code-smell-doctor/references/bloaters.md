# Bloaters

Code that has grown too large to manage effectively.

## 1. Long Method

**Detection:**
- Method >15 lines (consider >10 suspicious)
- >3 levels of nesting
- Multiple unrelated operations in sequence
- Hard to name or summarize in one sentence

**Fixes:**
- **Extract Method** - Break into focused, named methods
- **Replace Temp with Query** - Convert temp variables to method calls
- **Introduce Parameter Object** - Group related parameters
- **Decompose Conditional** - Extract condition logic to named methods
- **Replace Method with Method Object** - When extraction is complex, create a class

**Example Pattern:**
```
// Smell: Long method doing multiple things
function processOrder(order) {
  // validate (10 lines)
  // calculate totals (15 lines)
  // apply discounts (12 lines)
  // save to database (8 lines)
}

// Fix: Extract methods
function processOrder(order) {
  validateOrder(order);
  const totals = calculateTotals(order);
  const finalPrice = applyDiscounts(totals);
  saveOrder(order, finalPrice);
}
```

---

## 2. Large Class

**Detection:**
- Class >300 lines
- >10 fields
- >15 methods
- Multiple unrelated responsibilities
- Fields used in subsets of methods (suggests multiple classes)

**Fixes:**
- **Extract Class** - Move cohesive field/method groups to new class
- **Extract Subclass** - For specialized behaviors
- **Extract Interface** - Define contracts for different concerns
- **Duplicate Observed Data** - Separate UI from domain logic

**Example Pattern:**
```
// Smell: Class with too many responsibilities
class User {
  // Authentication fields (5)
  // Profile fields (8)
  // Preferences fields (6)
  // Auth methods (10)
  // Profile methods (8)
  // Preference methods (5)
}

// Fix: Extract classes
class User { /* core identity */ }
class UserAuth { /* authentication */ }
class UserProfile { /* profile data */ }
class UserPreferences { /* settings */ }
```

---

## 3. Primitive Obsession

**Detection:**
- Currency/money as float/int
- Phone numbers, emails, URLs as strings
- Date ranges as two separate dates
- Coordinates as separate x, y values
- Type codes: `const ADMIN = 1, USER = 2`
- Array indices simulating fields: `data[0]` for name

**Fixes:**
- **Replace Data Value with Object** - Create Money, PhoneNumber, DateRange classes
- **Introduce Parameter Object** - Group related primitives
- **Replace Type Code with Class** - `UserType.ADMIN` instead of `1`
- **Replace Type Code with Subclasses** - When behavior differs by type
- **Replace Array with Object** - Named fields instead of indices

**Example Pattern:**
```
// Smell: Primitives for domain concepts
function createInvoice(amount: number, currency: string,
                       startDate: Date, endDate: Date) { }

// Fix: Value objects
function createInvoice(amount: Money, period: DateRange) { }
```

---

## 4. Long Parameter List

**Detection:**
- >4 parameters
- Boolean flags controlling behavior
- Multiple parameters from same object
- Parameters often passed together

**Fixes:**
- **Replace Parameter with Method Call** - Get value inside method
- **Preserve Whole Object** - Pass object instead of extracted values
- **Introduce Parameter Object** - Create class for parameter group

**Example Pattern:**
```
// Smell: Too many parameters
function createUser(name, email, street, city, zip, country, phone, fax) { }

// Fix: Parameter objects
function createUser(name: string, email: string,
                    address: Address, contact: ContactInfo) { }
```

---

## 5. Data Clumps

**Detection:**
- Same 3+ fields appear in multiple classes
- Same 3+ parameters appear in multiple method signatures
- Deleting one field would make others meaningless
- Fields with common prefix: `customerName, customerEmail, customerPhone`

**Fixes:**
- **Extract Class** - Create class for the clump
- **Introduce Parameter Object** - For parameter clumps
- **Preserve Whole Object** - Pass the new object

**Example Pattern:**
```
// Smell: Same fields everywhere
class Order { customerName, customerEmail, customerPhone }
class Invoice { customerName, customerEmail, customerPhone }
function sendNotification(customerName, customerEmail, customerPhone) { }

// Fix: Extract Customer class
class Customer { name, email, phone }
class Order { customer: Customer }
class Invoice { customer: Customer }
function sendNotification(customer: Customer) { }
```
