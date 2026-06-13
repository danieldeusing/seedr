# Moving Features between Objects

8 techniques for properly distributing functionality among classes.

## 1. Move Method

**Problem:** Method used more in another class than its own.

**Solution:** Create method in class that uses it most, move code, replace/remove original.

**When to use:**
- Method primarily operates on data from another class
- Improve class coherence
- Reduce dependencies between classes

```python
# Before
class Account:
    def overdraft_charge(self):
        if self.account_type.is_premium():
            result = 10
            if self.days_overdrawn > 7:
                result += (self.days_overdrawn - 7) * 0.85
            return result
        return self.days_overdrawn * 1.75

# After - method moved to AccountType
class AccountType:
    def overdraft_charge(self, days_overdrawn):
        if self.is_premium():
            result = 10
            if days_overdrawn > 7:
                result += (days_overdrawn - 7) * 0.85
            return result
        return days_overdrawn * 1.75
```

---

## 2. Move Field

**Problem:** Field used more in another class than its own.

**Solution:** Create field in appropriate class, update all references.

**When to use:**
- Field should be with methods that use it
- Eliminate Shotgun Surgery
- Decrease Inappropriate Intimacy between classes

```python
# Before
class Account:
    def __init__(self):
        self.interest_rate = 0.05

    def interest_for_amount_days(self, amount, days):
        return self.interest_rate * amount * days / 365

# After - interest_rate moved to AccountType
class AccountType:
    def __init__(self):
        self.interest_rate = 0.05

class Account:
    def interest_for_amount_days(self, amount, days):
        return self.account_type.interest_rate * amount * days / 365
```

---

## 3. Extract Class

**Problem:** Single class handles responsibilities belonging to two classes.

**Solution:** Create new class, move relevant fields and methods to it.

**When to use:**
- Class violates Single Responsibility Principle
- Class has grown beyond original scope
- Subsets of data/methods frequently change together

```python
# Before
class Person:
    def __init__(self):
        self.name = ""
        self.office_area_code = ""
        self.office_number = ""

    def get_telephone_number(self):
        return f"({self.office_area_code}) {self.office_number}"

# After
class TelephoneNumber:
    def __init__(self):
        self.area_code = ""
        self.number = ""

    def get_telephone_number(self):
        return f"({self.area_code}) {self.number}"

class Person:
    def __init__(self):
        self.name = ""
        self.office_telephone = TelephoneNumber()
```

---

## 4. Inline Class

**Problem:** Class does almost nothing; not responsible for anything.

**Solution:** Move all features to another class, delete the empty class.

**When to use:**
- Class features transplanted elsewhere, leaving minimal functionality
- Reduces cognitive overhead from needless classes

```python
# Before
class TelephoneNumber:
    def get_area_code(self):
        return self.area_code

    def get_number(self):
        return self.number

class Person:
    def get_telephone_number(self):
        return self.office_telephone.get_telephone_number()

# After - TelephoneNumber absorbed into Person
class Person:
    def __init__(self):
        self.office_area_code = ""
        self.office_number = ""

    def get_telephone_number(self):
        return f"({self.office_area_code}) {self.office_number}"
```

---

## 5. Hide Delegate

**Problem:** Client accesses object through another, then calls methods on it (call chains).

**Solution:** Create delegating methods in server class to forward calls.

**When to use:**
- Reduce coupling by hiding object relationships
- Insulate clients from structural changes

```python
# Before - client knows about internal structure
manager = person.get_department().get_manager()

# After - delegate hidden
class Person:
    def get_manager(self):
        return self.department.get_manager()

# Client code
manager = person.get_manager()
```

---

## 6. Remove Middle Man

**Problem:** Class has too many methods that simply delegate to other objects.

**Solution:** Force client to call end methods directly; add getter for delegate.

**When to use:**
- Server class primarily serves as pass-through
- Frequent additions to delegate require constant wrapper updates
- Opposite of Hide Delegate

```python
# Before - too many delegation methods
class Person:
    def get_manager(self):
        return self.department.get_manager()

    def get_budget(self):
        return self.department.get_budget()

    def get_headcount(self):
        return self.department.get_headcount()

# After - expose delegate directly
class Person:
    def get_department(self):
        return self.department

# Client code
manager = person.get_department().get_manager()
```

---

## 7. Introduce Foreign Method

**Problem:** Utility class lacks a method you need; cannot modify the class.

**Solution:** Add method to client class, passing utility object as parameter.

**When to use:**
- Third-party library can't be modified
- Same utility logic appears repeatedly
- Need only one or two additional methods

```python
# Before - repeating date logic
new_start = datetime(previous_end.year, previous_end.month, previous_end.day + 1)

# After - foreign method in client class
def next_day(self, date):
    """Foreign method, should be in datetime"""
    return date + timedelta(days=1)

new_start = self.next_day(previous_end)
```

---

## 8. Introduce Local Extension

**Problem:** Utility class lacks methods you need; cannot modify it; need many methods.

**Solution:** Create subclass or wrapper of the utility class containing new methods.

**When to use:**
- Need multiple additional methods for third-party class
- Avoid code clutter in client classes
- More robust than Introduce Foreign Method for many methods

```python
# Subclass approach
class MutableDate(datetime):
    def next_day(self):
        return self + timedelta(days=1)

    def is_weekend(self):
        return self.weekday() >= 5

# Wrapper approach
class DateWrapper:
    def __init__(self, date):
        self._date = date

    def next_day(self):
        return DateWrapper(self._date + timedelta(days=1))

    def is_weekend(self):
        return self._date.weekday() >= 5

    # Delegate original methods
    def __getattr__(self, name):
        return getattr(self._date, name)
```

## Related Pairs

- **Hide Delegate** ↔ **Remove Middle Man**: Opposite techniques; balance based on coupling vs simplicity
- **Introduce Foreign Method** ↔ **Introduce Local Extension**: Use Foreign Method for 1-2 methods, Local Extension for many
