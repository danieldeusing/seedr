# Simplifying Conditional Expressions

8 techniques for making conditional logic clearer and more maintainable.

## 1. Consolidate Conditional Expression

**Problem:** Multiple conditionals lead to same result; unclear why they're separated.

**Solution:** Combine into single expression; extract to method with descriptive name.

**Rules:**
- Nested conditionals → join with AND
- Consecutive conditionals → join with OR

```python
# Before
def disability_amount(self):
    if self.seniority < 2:
        return 0
    if self.months_disabled > 12:
        return 0
    if self.is_part_time:
        return 0
    # compute amount

# After
def disability_amount(self):
    if self.is_not_eligible_for_disability():
        return 0
    # compute amount

def is_not_eligible_for_disability(self):
    return (self.seniority < 2 or
            self.months_disabled > 12 or
            self.is_part_time)
```

---

## 2. Consolidate Duplicate Conditional Fragments

**Problem:** Identical code appears in all branches of a conditional.

**Solution:** Move duplicate code outside the conditional structure.

**Placement:**
- Code at beginning of branches → before conditional
- Code at end of branches → after conditional

```python
# Before
if is_special_deal():
    total = price * 0.95
    send(total)
else:
    total = price * 0.98
    send(total)

# After
if is_special_deal():
    total = price * 0.95
else:
    total = price * 0.98
send(total)
```

---

## 3. Decompose Conditional

**Problem:** Complex if-then/else difficult to understand; must track multiple branches.

**Solution:** Extract condition, then-branch, and else-branch into separate methods.

**When to use:**
- Long conditional blocks obscure intent
- Complex boolean expressions
- Lengthy then/else requiring mental overhead

```python
# Before
if date.before(SUMMER_START) or date.after(SUMMER_END):
    charge = quantity * winter_rate + winter_service_charge
else:
    charge = quantity * summer_rate

# After
if is_winter(date):
    charge = winter_charge(quantity)
else:
    charge = summer_charge(quantity)

def is_winter(date):
    return date.before(SUMMER_START) or date.after(SUMMER_END)

def winter_charge(quantity):
    return quantity * winter_rate + winter_service_charge

def summer_charge(quantity):
    return quantity * summer_rate
```

---

## 4. Replace Conditional with Polymorphism

**Problem:** Conditional performs various actions based on object type/properties.

**Solution:** Create subclasses for each branch; use polymorphic method calls.

**When to use:**
- Conditionals vary based on class type or field values
- Similar conditionals across multiple methods
- New types require updating multiple conditionals

```python
# Before
class Bird:
    def get_speed(self):
        if self.type == "EUROPEAN":
            return self.get_base_speed()
        elif self.type == "AFRICAN":
            return self.get_base_speed() - self.get_load_factor() * self.number_of_coconuts
        elif self.type == "NORWEGIAN_BLUE":
            return 0 if self.is_nailed else self.get_base_speed()

# After
class Bird:
    def get_speed(self):
        raise NotImplementedError

class European(Bird):
    def get_speed(self):
        return self.get_base_speed()

class African(Bird):
    def get_speed(self):
        return self.get_base_speed() - self.get_load_factor() * self.number_of_coconuts

class NorwegianBlue(Bird):
    def get_speed(self):
        return 0 if self.is_nailed else self.get_base_speed()
```

---

## 5. Remove Control Flag

**Problem:** Boolean variable controls flow in complex way.

**Solution:** Replace with break, continue, or return statements.

**When to use:**
- Flag variables govern loop execution
- Flag controls function termination
- Want to simplify control flow

```python
# Before
found = False
for person in people:
    if not found:
        if person == "Don":
            send_alert()
            found = True
        if person == "John":
            send_alert()
            found = True

# After
for person in people:
    if person == "Don" or person == "John":
        send_alert()
        break
```

---

## 6. Replace Nested Conditional with Guard Clauses

**Problem:** Nested conditionals obscure normal flow; rightward indentation.

**Solution:** Extract edge cases to guards with immediate returns; flatten structure.

**When to use:**
- Multiple levels of nested if-else
- Guard conditions buried in nesting
- Normal path obscured by exception handling

```python
# Before
def get_pay_amount(self):
    if self.is_dead:
        result = dead_amount()
    else:
        if self.is_separated:
            result = separated_amount()
        else:
            if self.is_retired:
                result = retired_amount()
            else:
                result = normal_pay_amount()
    return result

# After
def get_pay_amount(self):
    if self.is_dead:
        return dead_amount()
    if self.is_separated:
        return separated_amount()
    if self.is_retired:
        return retired_amount()
    return normal_pay_amount()
```

---

## 7. Introduce Null Object

**Problem:** Methods return null; many null checks scattered throughout code.

**Solution:** Create null object subclass with default behavior; treat polymorphically.

**When to use:**
- Frequent null comparisons
- Different logic based on null checks
- Simplify conditionals via polymorphism

```python
# Before
def get_billing_plan(customer):
    if customer is None:
        return BillingPlan.basic()
    return customer.get_billing_plan()

# After
class NullCustomer(Customer):
    def get_billing_plan(self):
        return BillingPlan.basic()

    def get_name(self):
        return "Occupant"

# Factory returns NullCustomer instead of None
def get_billing_plan(customer):
    return customer.get_billing_plan()  # works for both real and null
```

---

## 8. Introduce Assertion

**Problem:** Code assumes certain conditions but doesn't make them explicit.

**Solution:** Add assertion checks that validate assumptions; acts as executable documentation.

**When to use:**
- Comments describe required conditions
- Make assumptions about state, parameters, or variables explicit
- For programmer errors (use exceptions for runtime errors)

```python
# Before
def get_expense_limit(self):
    # assumes either expense limit or primary project exists
    return self.expense_limit if self.expense_limit else \
           self.primary_project.get_member_expense_limit()

# After
def get_expense_limit(self):
    assert self.expense_limit or self.primary_project, \
           "Must have expense limit or primary project"
    return self.expense_limit if self.expense_limit else \
           self.primary_project.get_member_expense_limit()
```

## Technique Selection

| Symptom | Technique |
|---------|-----------|
| Multiple conditions → same result | Consolidate Conditional Expression |
| Same code in all branches | Consolidate Duplicate Fragments |
| Long/complex if-else | Decompose Conditional |
| Type-based switching | Replace Conditional with Polymorphism |
| Boolean control flags | Remove Control Flag |
| Deep nesting | Guard Clauses |
| Many null checks | Introduce Null Object |
| Implicit assumptions | Introduce Assertion |
