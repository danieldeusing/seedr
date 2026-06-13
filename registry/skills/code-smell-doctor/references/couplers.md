# Couplers

Excessive coupling between classes or misguided delegation.

## 19. Feature Envy

**Detection:**
- Method uses another object's data more than its own
- Many calls to other object's getters
- Method would make more sense in the other class
- Method takes an object and extracts multiple fields

**Fixes:**
- **Move Method** - Relocate to the envied class
- **Extract Method** - Move only the envious part

**Exception:** Strategy pattern intentionally separates algorithm from data

**Example Pattern:**
```
// Smell: Method envies Order's data
class InvoiceGenerator {
  generate(order: Order) {
    const items = order.getItems();
    const customer = order.getCustomer();
    const discount = order.getDiscount();
    const tax = order.getTaxRate();
    // All logic uses Order's data
  }
}

// Fix: Move method to Order
class Order {
  generateInvoice(): Invoice {
    // Uses this.items, this.customer, this.discount, this.taxRate
  }
}
```

---

## 20. Inappropriate Intimacy

**Detection:**
- Classes access each other's private/internal fields
- Bidirectional dependencies
- Subclass accesses too many parent internals
- Friend classes that know too much about each other

**Fixes:**
- **Move Method/Field** - Relocate to proper owner
- **Extract Class** - Create intermediary
- **Hide Delegate** - Reduce exposure
- **Change Bidirectional to Unidirectional** - Break cycles
- **Replace Inheritance with Delegation** - When subclass is too intimate

**Example Pattern:**
```
// Smell: Classes know too much about each other
class Order {
  customer: Customer;
  getCustomerCreditLimit() {
    return this.customer._internalCreditData.limit; // accessing internal
  }
}
class Customer {
  _internalCreditData;
  getOrderHistory() {
    return this.orders.map(o => o._internalPricing); // accessing internal
  }
}

// Fix: Proper encapsulation
class Customer {
  getCreditLimit() { return this.creditData.limit; }
}
class Order {
  getCustomerCreditLimit() { return this.customer.getCreditLimit(); }
}
```

---

## 21. Incomplete Library Class

**Detection:**
- Library missing functionality you need
- Workarounds scattered through codebase
- Same library extension repeated multiple times

**Fixes:**
- **Introduce Foreign Method** - Add method to your code that takes library object
- **Introduce Local Extension** - Create wrapper/subclass extending library class

**Example Pattern:**
```
// Smell: Library Date lacks business day logic, workarounds everywhere
const nextDay = new Date(date.getTime() + 86400000);
if (nextDay.getDay() === 0) nextDay.setDate(nextDay.getDate() + 1);
if (nextDay.getDay() === 6) nextDay.setDate(nextDay.getDate() + 2);

// Fix: Local extension
class BusinessDate extends Date {
  nextBusinessDay(): BusinessDate {
    const next = new BusinessDate(this.getTime() + 86400000);
    while (next.isWeekend()) next.setDate(next.getDate() + 1);
    return next;
  }
  private isWeekend() { return this.getDay() === 0 || this.getDay() === 6; }
}
```

---

## 22. Message Chains

**Detection:**
- Chains like `a.getB().getC().getD().doSomething()`
- Client depends on navigation structure
- Changing one relationship breaks many callers
- Law of Demeter violations

**Fixes:**
- **Hide Delegate** - Add method to intermediate class
- **Extract Method + Move Method** - Move logic to chain start

**Balance:** Over-hiding creates Middle Man smell

**Example Pattern:**
```
// Smell: Long chain
const managerName = employee.getDepartment().getManager().getName();

// Fix: Hide delegate
class Employee {
  getManagerName() {
    return this.department.getManagerName();
  }
}
class Department {
  getManagerName() {
    return this.manager.getName();
  }
}
// Usage:
const managerName = employee.getManagerName();
```

---

## 23. Middle Man

**Detection:**
- Class mostly delegates to another class
- Methods just forward calls without adding value
- Layer exists "just in case" but adds nothing
- Removing the class would simplify callers

**Fixes:**
- **Remove Middle Man** - Let clients call delegate directly
- **Inline Method** - When only a few methods delegate

**Exception:** Intentional patterns: Proxy, Decorator, Facade (when they add value)

**Example Pattern:**
```
// Smell: Manager just delegates everything
class ProjectManager {
  getProject(id) { return this.project.getProject(id); }
  saveProject(p) { return this.project.save(p); }
  deleteProject(id) { return this.project.delete(id); }
  // Every method just delegates
}

// Fix: Remove middle man, use Project directly
// Instead of projectManager.getProject(id)
// Use project.getProject(id)
```

## Coupler Balance

Feature Envy / Inappropriate Intimacy / Message Chains → too much coupling

Middle Man → too much decoupling (over-abstraction)

Goal: Classes cohesive with their own data, loosely coupled to others, without meaningless pass-through layers.
