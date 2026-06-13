# Object-Orientation Abusers

Misuse of OOP principles.

## 6. Alternative Classes with Different Interfaces

**Detection:**
- Two classes with same behavior, different method names
- `PDFRenderer.render()` vs `PDFGenerator.generate()` doing same thing
- Duplicate logic hidden by different naming

**Fixes:**
- **Rename Method** - Standardize method names
- **Move Method** - Align signatures
- **Extract Superclass** - When only partial overlap exists
- Delete the redundant class

**Example Pattern:**
```
// Smell: Same behavior, different names
class EmailSender { send(to, subject, body) }
class MailDispatcher { dispatch(recipient, title, content) }

// Fix: Standardize interface
interface Mailer { send(to, subject, body) }
class EmailSender implements Mailer { }
// Delete MailDispatcher, use EmailSender
```

---

## 7. Refused Bequest

**Detection:**
- Subclass overrides methods to throw `NotImplemented`
- Subclass doesn't use most inherited methods/fields
- Inheritance used for code reuse, not "is-a" relationship
- Protected members left unused in subclass

**Fixes:**
- **Replace Inheritance with Delegation** - Use composition
- **Extract Superclass** - Create proper hierarchy with shared behavior

**Example Pattern:**
```
// Smell: Stack extends Vector but doesn't need most Vector methods
class Stack extends Vector {
  // Only uses addElement and removeElement
  // Inherits indexOf, get, etc. that break stack semantics
}

// Fix: Composition
class Stack {
  private items: Array;
  push(item) { this.items.push(item); }
  pop() { return this.items.pop(); }
}
```

---

## 8. Switch Statements

**Detection:**
- `switch` on type code/enum that determines behavior
- Same switch repeated in multiple places
- Adding new type requires modifying multiple switches
- `if-else` chains checking `instanceof` or type fields

**Fixes:**
- **Replace Conditional with Polymorphism** - Override method in subclasses
- **Replace Type Code with Subclasses** - Create class per type
- **Replace Type Code with State/Strategy** - For runtime type changes
- **Introduce Null Object** - For null checks

**Acceptable uses:** Factory methods selecting class, simple value mapping

**Example Pattern:**
```
// Smell: Switch on type
function calculatePay(employee) {
  switch (employee.type) {
    case 'hourly': return hours * rate;
    case 'salaried': return salary / 12;
    case 'commissioned': return base + sales * commission;
  }
}

// Fix: Polymorphism
abstract class Employee { abstract calculatePay(); }
class HourlyEmployee extends Employee { calculatePay() { return hours * rate; } }
class SalariedEmployee extends Employee { calculatePay() { return salary / 12; } }
```

---

## 9. Temporary Field

**Detection:**
- Fields only set in certain methods, empty otherwise
- Fields used only by specific algorithms
- Null checks before using fields
- Fields populated in `setup()` then used in `execute()`

**Fixes:**
- **Extract Class** - Create Method Object with the fields
- **Introduce Null Object** - Replace conditional null checks

**Example Pattern:**
```
// Smell: Fields only used by one algorithm
class ReportGenerator {
  private tempData;      // only set during generateComplexReport
  private tempSettings;  // only set during generateComplexReport

  generateComplexReport() {
    this.tempData = fetchData();
    this.tempSettings = loadSettings();
    // use tempData and tempSettings
  }
}

// Fix: Extract to Method Object
class ComplexReportGenerator {
  constructor(private data, private settings) { }
  generate() { /* use this.data, this.settings */ }
}

class ReportGenerator {
  generateComplexReport() {
    new ComplexReportGenerator(fetchData(), loadSettings()).generate();
  }
}
```
