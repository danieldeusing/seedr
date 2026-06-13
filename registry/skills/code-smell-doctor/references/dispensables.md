# Dispensables

Code that serves no purpose and should be removed.

## 13. Comments (as smell)

**Detection:**
- Comments explaining what code does (not why)
- Commented-out code
- Comments apologizing for bad code
- TODO comments that are years old
- Comments that contradict the code

Good comments explain: why (not what), gotchas, non-obvious constraints

**Fixes:**
- **Extract Method** - Turn commented section into named method
- **Rename Method/Variable** - Self-documenting names
- **Extract Variable** - Name complex expressions
- **Introduce Assertion** - Document invariants in code

**Example Pattern:**
```
// Smell: Comments explaining what
// Calculate the total price with tax
let total = 0;
for (let i = 0; i < items.length; i++) {
  // Add item price to total
  total += items[i].price;
}
// Apply 8.5% tax rate
total = total * 1.085;

// Fix: Self-documenting code
const subtotal = items.reduce((sum, item) => sum + item.price, 0);
const TAX_RATE = 0.085;
const total = subtotal * (1 + TAX_RATE);
```

---

## 14. Duplicate Code

**Detection:**
- Identical code blocks (copy-paste)
- Similar code with minor variations
- Same algorithm in multiple places
- Same conditional structure repeated

**Fixes:**
- **Extract Method** - Same class duplication
- **Pull Up Method/Field** - Sibling class duplication
- **Extract Superclass/Class** - Unrelated class duplication
- **Consolidate Conditional** - Duplicate condition logic
- **Form Template Method** - Same algorithm, different steps

**Example Pattern:**
```
// Smell: Same validation in multiple places
class UserService {
  createUser(email) {
    if (!email.includes('@')) throw new Error('Invalid email');
  }
}
class NewsletterService {
  subscribe(email) {
    if (!email.includes('@')) throw new Error('Invalid email');
  }
}

// Fix: Extract to shared utility
function validateEmail(email) {
  if (!email.includes('@')) throw new Error('Invalid email');
}
```

---

## 15. Data Class

**Detection:**
- Class with only fields + getters/setters
- No behavior, just data container
- Other classes manipulate its data
- Anemic domain model

**Fixes:**
- **Encapsulate Field** - Add getters/setters first
- **Encapsulate Collection** - Return copies, not originals
- **Move Method** - Bring behavior to the data
- **Remove Setting Method** - Make immutable where possible
- **Hide Method** - Reduce public surface

**Example Pattern:**
```
// Smell: Anemic data class
class Order {
  items: Item[];
  get total() { return this.items.reduce((s, i) => s + i.price, 0); }
}
// Logic elsewhere:
function applyDiscount(order, code) {
  const discount = lookupDiscount(code);
  return order.total * (1 - discount);
}

// Fix: Rich domain model
class Order {
  private items: Item[];
  getTotal() { return this.items.reduce((s, i) => s + i.price, 0); }
  applyDiscount(code: DiscountCode) {
    return this.getTotal() * (1 - code.percentage);
  }
}
```

---

## 16. Dead Code

**Detection:**
- Unused variables, parameters, fields
- Unreachable code after return/throw
- Unused methods, classes, imports
- Commented-out code
- Conditions that are always true/false

**Fixes:**
- Delete it. Version control preserves history.
- **Inline Class** - For unused class hierarchies
- **Collapse Hierarchy** - Remove empty intermediate classes
- **Remove Parameter** - Delete unused parameters

Use IDE/linter to detect. In JS/TS: ESLint no-unused-vars. In compiled languages: compiler warnings.

---

## 17. Lazy Class

**Detection:**
- Class with only 1-2 trivial methods
- Class created for planned features never built
- Class reduced to nothing after refactoring
- Wrapper that adds no value

**Fixes:**
- **Inline Class** - Merge into caller
- **Collapse Hierarchy** - Merge with parent/child

**Exception:** Intentional extension points, marker interfaces

**Example Pattern:**
```
// Smell: Class does almost nothing
class StringUtils {
  static trim(s) { return s.trim(); }
}

// Fix: Just use the built-in
str.trim();
```

---

## 18. Speculative Generality

**Detection:**
- Abstract class with only one concrete subclass
- Parameters/methods "for future use"
- Hooks that are never overridden
- Unused delegation layers
- Over-engineered configurability no one uses

**Fixes:**
- **Collapse Hierarchy** - Remove unnecessary abstraction
- **Inline Class** - Remove pointless delegation
- **Inline Method** - Remove unused hooks
- **Remove Parameter** - Delete unused parameters
- Delete unused fields

**Exception:** Framework/library code designed for extension

**Example Pattern:**
```
// Smell: Premature abstraction
abstract class Repository<T> {
  abstract find(id): T;
  abstract save(entity: T): void;
  // 15 other abstract methods
}
class UserRepository extends Repository<User> { /* only implementation */ }

// Fix: Start simple, abstract when needed
class UserRepository {
  find(id): User { }
  save(user: User): void { }
}
// Extract interface later when second repository is needed
```
