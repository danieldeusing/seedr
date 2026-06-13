# Simplifying Method Calls

14 techniques for improving method signatures and reducing complexity.

## 1. Add Parameter

**Problem:** Method lacks data needed for certain actions.

**Solution:** Add new parameter to pass necessary data.

**When to use:**
- Changes require additional information
- Data needed occasionally, not permanently

**Caution:** Adding parameters is easy; removing is hard. Consider if data belongs in class or existing object.

---

## 2. Remove Parameter

**Problem:** Parameter isn't used in method body.

**Solution:** Delete unused parameter; update all call sites.

**When to use:**
- Parameter genuinely unused
- Added speculatively for anticipated changes

**Not for:** If used in superclass/subclass implementations, or if method is public API (deprecate instead).

---

## 3. Rename Method

**Problem:** Name doesn't explain what method does.

**Solution:** Create method with improved name, transfer code, update references.

**When to use:**
- Improve readability with descriptive names
- Functionality evolved but naming stayed stagnant
- Eliminate compensating comments

```python
# Before
def get_tn():
    return f"({self.area_code}) {self.number}"

# After
def get_telephone_number():
    return f"({self.area_code}) {self.number}"
```

---

## 4. Separate Query from Modifier

**Problem:** Method returns value AND changes object state—side effects.

**Solution:** Split into two methods: query (returns value) and modifier (changes state).

**When to use:**
- State changes occur when retrieving data
- Calling code unaware of side effects
- Queries in conditionals or loops
- Implements CQRS principle

```python
# Before
def get_total_and_send_bill(self):
    self.send_bill()  # side effect
    return self.total

# After
def get_total(self):
    return self.total

def send_bill(self):
    # send the bill
```

---

## 5. Parameterize Method

**Problem:** Multiple methods differ only in internal values.

**Solution:** Combine into single method with parameter for the differing value.

**When to use:**
- Multiple similar methods differing only in values
- Anticipate needing additional variations
- Shared logic is substantial

```python
# Before
def five_percent_raise(self):
    self.salary *= 1.05

def ten_percent_raise(self):
    self.salary *= 1.10

# After
def raise_salary(self, percentage):
    self.salary *= (1 + percentage / 100)
```

---

## 6. Introduce Parameter Object

**Problem:** Repeating group of parameters; unwieldy signatures.

**Solution:** Create class to hold parameter group; pass single object.

**When to use:**
- Identical parameter groups across methods
- Method signatures hard to read
- Long Parameter List or Data Clumps smells

```python
# Before
def amount_invoiced(start_date, end_date): ...
def amount_received(start_date, end_date): ...
def amount_overdue(start_date, end_date): ...

# After
class DateRange:
    def __init__(self, start, end):
        self.start = start
        self.end = end

def amount_invoiced(date_range): ...
def amount_received(date_range): ...
def amount_overdue(date_range): ...
```

---

## 7. Preserve Whole Object

**Problem:** Extract values from object, pass as separate parameters.

**Solution:** Pass entire object; method extracts what it needs.

**When to use:**
- Methods need multiple values from same object
- Anticipate changes to data requirements
- Long Parameter List or Data Clumps smells

**Drawback:** May limit flexibility by binding to specific interface.

```python
# Before
low = days_temp_range.get_low()
high = days_temp_range.get_high()
plan.within_range(low, high)

# After
plan.within_range(days_temp_range)
```

---

## 8. Remove Setting Method

**Problem:** Field should be set only at creation, never changed.

**Solution:** Remove setter; assign value only in constructor.

**When to use:**
- Prevent changes to field value
- Field should be immutable
- Create more predictable, thread-safe objects

```python
# Before
class Account:
    def set_id(self, id):
        self.id = id

# After
class Account:
    def __init__(self, id):
        self._id = id  # set once, never changed

    @property
    def id(self):
        return self._id
```

---

## 9. Replace Parameter with Explicit Methods

**Problem:** Method splits into parts based on parameter value.

**Solution:** Extract each variant into its own method.

**When to use:**
- Parameter-dependent variants with substantial logic
- Variants rarely added
- `set_height(10)` more intuitive than `set_value("height", 10)`

```python
# Before
def set_value(name, value):
    if name == "height":
        self.height = value
    elif name == "width":
        self.width = value

# After
def set_height(value):
    self.height = value

def set_width(value):
    self.width = value
```

---

## 10. Replace Parameter with Method Call

**Problem:** Calling query method and passing result as parameter; method could query directly.

**Solution:** Move query inside method; remove parameter.

**When to use:**
- Parameter values obtainable through method calls
- Query doesn't depend on current method parameters
- Simplify lengthy parameter lists

```python
# Before
base_price = quantity * item_price
discount_level = get_discount_level()
final_price = discounted_price(base_price, discount_level)

# After
def discounted_price(self, base_price):
    discount_level = self.get_discount_level()
    return base_price * discount_level
```

---

## 11. Hide Method

**Problem:** Method unused by other classes or only used in own hierarchy.

**Solution:** Make private or protected.

**When to use:**
- Refactoring classes beyond simple data containers
- Make each method "as private as possible"
- Use static analysis to audit visibility

---

## 12. Replace Constructor with Factory Method

**Problem:** Complex constructor beyond simple assignment; need to return subclass.

**Solution:** Create static factory method encapsulating construction; make constructor private.

**When to use:**
- Return subclass based on arguments (impossible with constructors)
- Meaningful naming like `Troops.get_crew(tank)`
- Reuse previously created objects
- Implementing Replace Type Code with Subclasses

```python
# Before
class Employee:
    def __init__(self, type):
        self.type = type

# After
class Employee:
    @staticmethod
    def create(type):
        if type == Employee.ENGINEER:
            return Engineer()
        elif type == Employee.SALESMAN:
            return Salesman()
```

---

## 13. Replace Error Code with Exception

**Problem:** Method returns special value indicating error.

**Solution:** Throw exception instead; wrap calls in try/catch.

**When to use:**
- Modernizing procedural error-handling
- Error handling clutters normal execution
- Constructors (can't return error codes)

**Caution:** Don't use exceptions for control flow; reserve for actual errors.

```python
# Before
def withdraw(amount):
    if amount > self.balance:
        return -1  # error code
    self.balance -= amount
    return 0

# After
def withdraw(amount):
    if amount > self.balance:
        raise InsufficientFundsError()
    self.balance -= amount
```

---

## 14. Replace Exception with Test

**Problem:** Throwing exceptions for predictable conditions.

**Solution:** Replace try-catch with conditional that tests upfront.

**When to use:**
- Can anticipate and prevent error through validation
- Improve clarity with direct conditional logic
- Better performance by avoiding exception overhead
- Reserve exceptions for truly exceptional cases

```python
# Before
def get_value_for_period(period_number):
    try:
        return self.values[period_number]
    except IndexError:
        return 0

# After
def get_value_for_period(period_number):
    if 0 <= period_number < len(self.values):
        return self.values[period_number]
    return 0
```

## Quick Reference

| Problem | Technique |
|---------|-----------|
| Need more data | Add Parameter |
| Unused parameter | Remove Parameter |
| Unclear name | Rename Method |
| Returns value + changes state | Separate Query from Modifier |
| Similar methods, different values | Parameterize Method |
| Repeating parameter groups | Introduce Parameter Object |
| Multiple values from same object | Preserve Whole Object |
| Field shouldn't change | Remove Setting Method |
| Parameter controls behavior | Replace Parameter with Explicit Methods |
| Parameter is query result | Replace Parameter with Method Call |
| Method only used internally | Hide Method |
| Complex construction | Replace Constructor with Factory Method |
| Error codes | Replace Error Code with Exception |
| Exception for predictable case | Replace Exception with Test |
