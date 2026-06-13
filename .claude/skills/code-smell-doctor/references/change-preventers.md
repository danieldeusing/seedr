# Change Preventers

Code structures that make changes difficult and risky.

## 10. Divergent Change

**Detection:**
- One class modified for multiple unrelated reasons
- "When I add a new X, I change methods A, B, C in this class"
- Class has methods groupable by different concerns
- God class / blob antipattern

**Fixes:**
- **Extract Class** - Split by responsibility
- **Extract Superclass/Subclass** - When behaviors share common base

**Example Pattern:**
```
// Smell: Class changes for unrelated reasons
class Order {
  // Changes when: pricing rules change
  calculateTotal() { }
  applyDiscount() { }

  // Changes when: export formats change
  toJSON() { }
  toXML() { }
  toCSV() { }

  // Changes when: validation rules change
  validate() { }
}

// Fix: Extract classes
class Order { items, calculateTotal() }
class OrderExporter { toJSON(order), toXML(order), toCSV(order) }
class OrderValidator { validate(order) }
```

---

## 11. Parallel Inheritance Hierarchies

**Detection:**
- Creating subclass in hierarchy A requires subclass in hierarchy B
- Class prefixes mirror each other: `Car/CarEngine`, `Truck/TruckEngine`
- Two hierarchies grow in lockstep
- Violation of DRY across inheritance trees

**Fixes:**
- Have one hierarchy reference the other via composition
- **Move Method/Field** to consolidate
- Collapse one hierarchy into the other

**Example Pattern:**
```
// Smell: Parallel hierarchies
class Employee { }
class Manager extends Employee { }
class Engineer extends Employee { }

class EmployeeBenefits { }
class ManagerBenefits extends EmployeeBenefits { }  // always paired
class EngineerBenefits extends EmployeeBenefits { } // always paired

// Fix: Composition
class Employee {
  benefits: Benefits;  // inject appropriate benefits
}
class Benefits { /* configurable for role */ }
```

---

## 12. Shotgun Surgery

**Detection:**
- Small change requires edits in many classes
- One responsibility scattered across codebase
- "To add feature X, I need to modify files A, B, C, D, E, F"
- Easy to miss one location, causing bugs

Opposite of Divergent Change: Divergent = one class, many reasons; Shotgun = one reason, many classes

**Fixes:**
- **Move Method/Field** - Consolidate into single class
- **Inline Class** - Merge fragments back together

**Example Pattern:**
```
// Smell: Logging scattered everywhere
class UserService {
  createUser() { logger.info('Creating user'); /* ... */ }
}
class OrderService {
  createOrder() { logger.info('Creating order'); /* ... */ }
}
class PaymentService {
  processPayment() { logger.info('Processing payment'); /* ... */ }
}
// Adding audit fields requires changing all services

// Fix: Consolidate with aspect/decorator
@Audited
class UserService { createUser() { } }
@Audited
class OrderService { createOrder() { } }
// Or use AOP/middleware for cross-cutting concerns
```
