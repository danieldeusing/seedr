# Dealing with Generalization

12 techniques for managing inheritance hierarchies.

## 1. Pull Up Field

**Problem:** Two subclasses have the same field.

**Solution:** Move field to superclass; remove from subclasses.

**When to use:**
- Subclasses developed independently with identical fields
- Eliminate field duplication
- Preparing to relocate duplicate methods

```python
# Before
class Salesman(Employee):
    def __init__(self):
        self.name = ""

class Engineer(Employee):
    def __init__(self):
        self.name = ""

# After
class Employee:
    def __init__(self):
        self.name = ""
```

---

## 2. Pull Up Method

**Problem:** Subclasses have methods performing similar work.

**Solution:** Make methods identical; move to superclass.

**When to use:**
- Duplicate code across subclasses
- Subclasses implement essentially same logic
- Need single source of truth for shared behavior

```python
# Before
class Salesman(Employee):
    def get_name(self):
        return self.name

class Engineer(Employee):
    def get_name(self):
        return self.name

# After
class Employee:
    def get_name(self):
        return self.name
```

---

## 3. Pull Up Constructor Body

**Problem:** Subclasses have constructors with mostly identical code.

**Solution:** Create superclass constructor with shared logic; call from subclasses.

**When to use:**
- Multiple subclasses duplicate constructor initialization
- Common setup at beginning of constructors

```python
# Before
class Manager(Employee):
    def __init__(self, name, id, grade):
        self.name = name
        self.id = id
        self.grade = grade

class Engineer(Employee):
    def __init__(self, name, id, specialty):
        self.name = name
        self.id = id
        self.specialty = specialty

# After
class Employee:
    def __init__(self, name, id):
        self.name = name
        self.id = id

class Manager(Employee):
    def __init__(self, name, id, grade):
        super().__init__(name, id)
        self.grade = grade
```

---

## 4. Push Down Field

**Problem:** Field used only in some subclasses.

**Solution:** Move field from superclass to subclasses that use it.

**When to use:**
- Field exists in superclass but only accessed by certain subclasses
- After extracting/removing hierarchy functionality
- Improve coherency by locating fields where needed

```python
# Before
class Employee:
    def __init__(self):
        self.quota = 0  # only used by Salesman

# After
class Salesman(Employee):
    def __init__(self):
        super().__init__()
        self.quota = 0
```

---

## 5. Push Down Method

**Problem:** Method in superclass used by only one/few subclasses.

**Solution:** Move method to subclasses that use it.

**When to use:**
- Method designed to be universal but only used by some subclasses
- After partial feature removal
- Remedy for "Refused Bequest" smell

```python
# Before
class Employee:
    def get_quota(self):
        # only salesmen have quotas
        return self.quota

# After
class Salesman(Employee):
    def get_quota(self):
        return self.quota
```

---

## 6. Extract Subclass

**Problem:** Class has features used only in certain cases.

**Solution:** Create subclass for specialized functionality.

**When to use:**
- Class implements rare/conditional behavior
- Multiple distinct use cases
- Specialized functionality belongs with parent but used infrequently

**Caveat:** Can't handle multiple inheritance dimensions—use Strategy pattern instead.

```python
# Before
class Job:
    def get_total_price(self):
        return self.get_unit_price() * self.quantity

    def get_unit_price(self):
        return self.unit_price * (1 + self.labor_surcharge if self.requires_labor else 0)

# After
class Job:
    def get_total_price(self):
        return self.get_unit_price() * self.quantity

    def get_unit_price(self):
        return self.unit_price

class LaborJob(Job):
    def get_unit_price(self):
        return self.unit_price * (1 + self.labor_surcharge)
```

---

## 7. Extract Superclass

**Problem:** Two classes have common fields and methods.

**Solution:** Create shared parent; move common functionality up.

**When to use:**
- Duplicate code across classes performing similar tasks
- Eliminate duplication by centralizing common functionality
- Simplify inheritance structure

**Limitation:** Can't apply if classes already have superclass.

```python
# Before
class Department:
    def get_total_annual_cost(self): ...
    def get_name(self): ...
    def get_head_count(self): ...

class Employee:
    def get_annual_cost(self): ...
    def get_name(self): ...
    def get_id(self): ...

# After
class Party:
    def get_name(self): ...
    def get_annual_cost(self): ...

class Department(Party): ...
class Employee(Party): ...
```

---

## 8. Extract Interface

**Problem:** Multiple clients use same part of class interface; or two classes share interface.

**Solution:** Extract common interface portion.

**When to use:**
- Role-based scenarios where classes play special roles
- Need to describe operations and support multiple server types

**Note:** Unlike Extract Superclass, this isolates only interfaces, not shared code.

```python
# Before
class Employee:
    def get_rate(self): ...
    def has_special_skill(self): ...
    def get_name(self): ...
    def get_department(self): ...

# After
class Billable(ABC):
    @abstractmethod
    def get_rate(self): ...

    @abstractmethod
    def has_special_skill(self): ...

class Employee(Billable):
    def get_rate(self): ...
    def has_special_skill(self): ...
    def get_name(self): ...
    def get_department(self): ...
```

---

## 9. Collapse Hierarchy

**Problem:** Subclass is practically same as superclass.

**Solution:** Merge into single class.

**When to use:**
- Simple two-class hierarchy where subclass adds minimal value
- Features removed leaving classes functionally equivalent

**Caveat:** Avoid if multiple subclasses exist (could violate Liskov substitution).

```python
# Before
class Employee:
    def __init__(self, name, id):
        self.name = name
        self.id = id

class Salesman(Employee):
    pass  # no additional behavior

# After - just Employee
```

---

## 10. Form Template Method

**Problem:** Subclasses implement algorithms with similar steps in same order.

**Solution:** Move algorithm structure to superclass; keep different steps in subclasses.

**When to use:**
- Parallel subclasses with duplicate algorithmic steps
- Eliminate higher-level duplication
- Follow Open/Closed Principle

```python
# Before
class Site:
    def get_billing_plan(self): ...

class ResidentialSite(Site):
    def get_billing_plan(self):
        base = self.units * self.rate
        tax = base * Site.TAX_RATE
        return base + tax

class LifelineSite(Site):
    def get_billing_plan(self):
        base = self.units * self.rate * 0.5
        tax = base * Site.TAX_RATE * 0.2
        return base + tax

# After - Template Method pattern
class Site:
    def get_billing_plan(self):  # template method
        return self.get_base_amount() + self.get_tax_amount()

    def get_base_amount(self): ...  # abstract
    def get_tax_amount(self): ...   # abstract

class ResidentialSite(Site):
    def get_base_amount(self):
        return self.units * self.rate

    def get_tax_amount(self):
        return self.get_base_amount() * Site.TAX_RATE
```

---

## 11. Replace Inheritance with Delegation

**Problem:** Subclass uses only portion of superclass; inheritance not true "is-a".

**Solution:** Create field for superclass object; delegate methods; remove inheritance.

**When to use:**
- Subclass doesn't truly extend parent conceptually
- Clients call inherited methods subclass wasn't designed to use
- Want to support multiple implementations (Strategy pattern)
- Reduce interface clutter from inherited methods

```python
# Before
class MyStack(list):
    def push(self, item):
        self.append(item)

    def pop(self):
        return super().pop()
    # Inherits unwanted methods: insert, remove, sort, etc.

# After
class MyStack:
    def __init__(self):
        self._storage = []

    def push(self, item):
        self._storage.append(item)

    def pop(self):
        return self._storage.pop()
    # Clean interface - only push/pop exposed
```

---

## 12. Replace Delegation with Inheritance

**Problem:** Class contains many simple delegating methods.

**Solution:** Make delegating class a subclass of delegate.

**When to use:**
- Class delegates to only one class and needs all its public methods
- Only if class has no existing parent

**Not for:**
- Delegating to only a subset of methods (violates Liskov)
- Class already has a parent

```python
# Before
class Employee:
    def __init__(self, person):
        self.person = person

    def get_name(self):
        return self.person.get_name()

    def get_last_name(self):
        return self.person.get_last_name()
    # Many more delegation methods...

# After
class Employee(Person):
    pass  # inherits all Person methods
```

## Decision Tree

```
Need to share code between classes?
├── Classes unrelated → Extract Superclass/Interface
├── One class is specialization → Extract Subclass
└── Already in hierarchy
    ├── Feature used by all → Pull Up Method/Field
    └── Feature used by some → Push Down Method/Field

Inheritance problems?
├── Too much delegation → Replace Delegation with Inheritance
├── Using only part of parent → Replace Inheritance with Delegation
├── Subclass = superclass → Collapse Hierarchy
└── Similar algorithms → Form Template Method
```

## Related Pairs

- **Pull Up** ↔ **Push Down**: Move up for sharing, down for specialization
- **Extract Superclass** ↔ **Collapse Hierarchy**: Create vs remove hierarchy levels
- **Inheritance** ↔ **Delegation**: Prefer delegation unless true "is-a" relationship
