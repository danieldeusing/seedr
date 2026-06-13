# Organizing Data

16 techniques for handling data, encapsulation, and type codes.

## 1. Change Value to Reference

**Problem:** Many identical instances that should be single shared object.

**Solution:** Convert to single reference object; all parts access same instance.

**When to use:**
- Value object evolved to require mutable, changeable data
- Changes must be synchronized across program
- Multiple copies of what should be same entity

```python
# Before - multiple Customer instances for same customer
class Order:
    def __init__(self, customer_name):
        self.customer = Customer(customer_name)

# After - shared reference
class Order:
    def __init__(self, customer_name):
        self.customer = Customer.get_named(customer_name)

class Customer:
    _instances = {}

    @classmethod
    def get_named(cls, name):
        if name not in cls._instances:
            cls._instances[name] = Customer(name)
        return cls._instances[name]
```

---

## 2. Change Reference to Value

**Problem:** Reference object too small/infrequently changed to justify lifecycle management.

**Solution:** Convert to immutable value object.

**When to use:**
- Objects small and rarely modified
- Reference lifecycle management burdensome
- Need unchangeable objects
- Distributed/parallel systems

```python
# Before - Currency as reference
currency1 = Currency.get("USD")
currency2 = Currency.get("USD")
assert currency1 is currency2

# After - Currency as value
class Currency:
    def __init__(self, code):
        self._code = code

    def __eq__(self, other):
        return self._code == other._code

    def __hash__(self):
        return hash(self._code)
```

---

## 3. Duplicate Observed Data

**Problem:** Domain data stored in GUI classes; can't support multiple views.

**Solution:** Separate domain data into independent classes; use Observer pattern for sync.

**When to use:**
- Business logic coupled with presentation
- Need multiple interface views for same data
- Same data duplicated across GUI and domain

---

## 4. Self Encapsulate Field

**Problem:** Direct access to private fields inside class; inflexible.

**Solution:** Create getter/setter; use only them for field access.

**When to use:**
- Need lazy initialization
- Add validation logic on access
- Subclasses should override access behavior
- Make fields immutable (getter only)

```python
# Before
class Range:
    def includes(self, arg):
        return arg >= self.low and arg <= self.high

# After
class Range:
    @property
    def low(self):
        return self._low

    @property
    def high(self):
        return self._high

    def includes(self, arg):
        return arg >= self.low and arg <= self.high
```

---

## 5. Replace Data Value with Object

**Problem:** Data field has its own behavior and associated data.

**Solution:** Create class encapsulating field and its behaviors.

**When to use:**
- Simple field evolved to include behaviors
- Multiple classes contain similar field patterns
- Field warrants own getter/setter logic

```python
# Before
class Order:
    def __init__(self):
        self.customer_name = ""

# After
class Customer:
    def __init__(self, name):
        self.name = name

    def is_preferred(self):
        # behavior related to customer

class Order:
    def __init__(self):
        self.customer = Customer("")
```

---

## 6. Replace Array with Object

**Problem:** Array contains various types of heterogeneous data.

**Solution:** Create class with named fields for each element.

**When to use:**
- Arrays store heterogeneous data without semantic meaning
- Code relies on magic index numbers
- Primitive Obsession code smell

```python
# Before
row = ["Liverpool", "15"]  # team name, wins
row[0]  # what is this?
row[1]  # what is this?

# After
class Performance:
    def __init__(self):
        self.team_name = ""
        self.wins = 0
```

---

## 7. Change Unidirectional Association to Bidirectional

**Problem:** Two classes need to use each other's features; only one-way link exists.

**Solution:** Add reverse association; designate one class as "dominant" for updates.

**When to use:**
- Client code needs access to both sides
- Complex reverse calculations would benefit from storage
- Note: Bidirectional increases complexity

```python
# Before - Order knows Customer, but not reverse
class Order:
    def __init__(self, customer):
        self.customer = customer

# After - bidirectional
class Customer:
    def __init__(self):
        self.orders = set()

    def add_order(self, order):
        self.orders.add(order)

class Order:
    def set_customer(self, customer):
        if self.customer:
            self.customer.orders.discard(self)
        self.customer = customer
        if customer:
            customer.orders.add(self)
```

---

## 8. Change Bidirectional Association to Unidirectional

**Problem:** Bidirectional association but one class doesn't use the other's features.

**Solution:** Remove unused direction; replace with method parameters or queries.

**When to use:**
- One class doesn't use the relationship
- Excessive interdependency and tight coupling
- Memory concerns from circular references
- Associated object obtainable through other means

---

## 9. Encapsulate Field

**Problem:** Public field violates encapsulation.

**Solution:** Make private; create getter/setter.

**When to use:**
- Classes expose public data members
- Need to enforce business rules on access
- Following OO encapsulation best practices

```python
# Before
class Person:
    name = ""  # public

# After
class Person:
    def __init__(self):
        self._name = ""

    @property
    def name(self):
        return self._name

    @name.setter
    def name(self, value):
        self._name = value
```

---

## 10. Encapsulate Collection

**Problem:** Collection with simple getter/setter allows uncontrolled modification.

**Solution:** Return read-only view; create add/remove methods.

**When to use:**
- Collections exposed allowing external modification
- Need to restrict unwanted collection operations
- Data Class code smell

```python
# Before
class Person:
    def get_courses(self):
        return self.courses  # exposes internal list

    def set_courses(self, courses):
        self.courses = courses

# After
class Person:
    def get_courses(self):
        return tuple(self._courses)  # read-only copy

    def add_course(self, course):
        self._courses.append(course)

    def remove_course(self, course):
        self._courses.remove(course)
```

---

## 11. Replace Magic Number with Symbolic Constant

**Problem:** Numeric values with unclear meaning.

**Solution:** Create named constant with descriptive name.

**When to use:**
- Numeric literals with non-obvious purposes
- Same number used for different meanings
- Complex values like 3.14159

```python
# Before
def potential_energy(mass, height):
    return mass * 9.81 * height

# After
GRAVITATIONAL_CONSTANT = 9.81

def potential_energy(mass, height):
    return mass * GRAVITATIONAL_CONSTANT * height
```

---

## 12. Replace Type Code with Class

**Problem:** Type code field doesn't affect behavior but lacks type safety.

**Solution:** Create class to encapsulate type code values.

**When to use:**
- Type codes don't control behavior via conditionals
- Need type safety and IDE validation
- Want to move type-related logic to dedicated class

**Not for:** Type codes that control flow logic—use Subclasses or State/Strategy instead.

```python
# Before
class Person:
    O = 0
    A = 1
    B = 2
    AB = 3

    def __init__(self, blood_group):
        self.blood_group = blood_group

# After
class BloodGroup:
    O = None
    A = None
    B = None
    AB = None

    def __init__(self, code):
        self._code = code

BloodGroup.O = BloodGroup(0)
BloodGroup.A = BloodGroup(1)
BloodGroup.B = BloodGroup(2)
BloodGroup.AB = BloodGroup(3)
```

---

## 13. Replace Type Code with Subclasses

**Problem:** Type code directly affects program behavior through conditionals.

**Solution:** Create subclasses for each type; replace conditionals with polymorphism.

**When to use:**
- Bulky switch/conditionals based on type code
- Need to add new types frequently
- Type determines which code paths execute

**Not for:** Existing class hierarchy or type code that changes after creation.

```python
# Before
class Employee:
    ENGINEER = 0
    SALESMAN = 1

    def __init__(self, type):
        self.type = type

    def get_bonus(self):
        if self.type == self.ENGINEER:
            return self.salary * 0.1
        elif self.type == self.SALESMAN:
            return self.sales * 0.15

# After
class Employee:
    def get_bonus(self):
        raise NotImplementedError

class Engineer(Employee):
    def get_bonus(self):
        return self.salary * 0.1

class Salesman(Employee):
    def get_bonus(self):
        return self.sales * 0.15
```

---

## 14. Replace Type Code with State/Strategy

**Problem:** Type code affects behavior but can't use subclasses (existing hierarchy or code changes).

**Solution:** Create state/strategy object that can be swapped; delegate behavior to it.

**When to use:**
- Type code affects behavior but subclasses impossible
- Type values change during object lifetime
- Strategy for algorithm selection
- State when type affects condition and multiple actions

```python
# Before - type can change
class Employee:
    def set_type(self, type):
        self.type = type

# After - State pattern
class EmployeeType:
    def get_bonus(self, employee):
        raise NotImplementedError

class Engineer(EmployeeType):
    def get_bonus(self, employee):
        return employee.salary * 0.1

class Employee:
    def __init__(self):
        self.type = Engineer()

    def set_type(self, type):
        self.type = type

    def get_bonus(self):
        return self.type.get_bonus(self)
```

---

## 15. Replace Subclass with Fields

**Problem:** Subclasses differ only in constant-returning methods.

**Solution:** Replace methods with fields in parent; eliminate subclasses.

**When to use:**
- Subclasses only return different constant values
- Creating subclasses is overkill
- Subclasses left as "dead weight" after refactoring

```python
# Before
class Male(Person):
    def get_code(self):
        return 'M'

class Female(Person):
    def get_code(self):
        return 'F'

# After
class Person:
    def __init__(self, is_male):
        self._code = 'M' if is_male else 'F'

    @staticmethod
    def create_male():
        return Person(True)

    @staticmethod
    def create_female():
        return Person(False)
```

## Type Code Decision Tree

1. **Does type code affect behavior?**
   - No → Replace Type Code with Class
   - Yes → Continue

2. **Can you use subclasses?**
   - Class has no existing hierarchy AND type doesn't change → Replace Type Code with Subclasses
   - Otherwise → Replace Type Code with State/Strategy
