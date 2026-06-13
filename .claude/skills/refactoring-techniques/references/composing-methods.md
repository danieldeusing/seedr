# Composing Methods

9 techniques for simplifying methods and managing local variables.

## 1. Extract Method

**Problem:** Code fragment that can be grouped together; long methods obscure intent.

**Solution:** Move code to a separate method with a descriptive name, replace original with a call.

**When to use:**
- Method exceeds reasonable length
- Code segments can be logically grouped
- Duplicate code across locations
- Operation benefits from self-documenting name

```python
# Before
def print_details():
    # print banner
    print("**********")
    print("** Name **")
    print("**********")
    # print body
    print(f"Name: {name}")

# After
def print_details():
    print_banner()
    print_body()

def print_banner():
    print("**********")
    print("** Name **")
    print("**********")

def print_body():
    print(f"Name: {name}")
```

---

## 2. Inline Method

**Problem:** Method body is more obvious than the method itself; unnecessary delegation.

**Solution:** Replace all calls with the method's content, delete the method.

**When to use:**
- Method simply delegates without adding value
- Method became trivially short through changes
- Method is not overridden in subclasses

```python
# Before
def get_rating():
    return more_than_five_late_deliveries() if 2 else 1

def more_than_five_late_deliveries():
    return late_deliveries > 5

# After
def get_rating():
    return 2 if late_deliveries > 5 else 1
```

---

## 3. Extract Variable

**Problem:** Complex expression that's hard to understand.

**Solution:** Assign parts to variables with self-explanatory names.

**When to use:**
- Complex conditionals in if() or ternary operators
- Long arithmetic expressions
- Preparing for Extract Method

```python
# Before
if platform.upper().find("MAC") > -1 and \
   platform.upper().find("IE") > -1 and \
   was_initialized() and resize > 0:

# After
is_mac_os = platform.upper().find("MAC") > -1
is_ie = platform.upper().find("IE") > -1
was_resized = resize > 0

if is_mac_os and is_ie and was_initialized() and was_resized:
```

---

## 4. Inline Temp

**Problem:** Temporary variable assigned result of simple expression, nothing more.

**Solution:** Replace all references with the expression, delete the variable.

**When to use:**
- Preparatory step for Replace Temp with Query or Extract Method
- Variable adds no semantic value
- Avoid if variable caches expensive operation used multiple times

```python
# Before
base_price = order.base_price()
return base_price > 1000

# After
return order.base_price() > 1000
```

---

## 5. Replace Temp with Query

**Problem:** Temporary variable storing expression result creates unnecessary intermediate storage.

**Solution:** Move expression to a separate method, query the method instead of using variable.

**When to use:**
- Method name would communicate purpose better than variable
- Same calculation appears in multiple methods
- Variable receives value only once
- Extracted method doesn't alter object state

```python
# Before
def calculate_total():
    base_price = quantity * item_price
    if base_price > 1000:
        return base_price * 0.95
    return base_price * 0.98

# After
def calculate_total():
    if base_price() > 1000:
        return base_price() * 0.95
    return base_price() * 0.98

def base_price():
    return quantity * item_price
```

---

## 6. Split Temporary Variable

**Problem:** Local variable used for multiple purposes inside a method.

**Solution:** Create distinct variables for each purpose with meaningful names.

**When to use:**
- Variable is reassigned for different computations
- Variable names don't communicate purpose (temp, k, a2)
- Preparing for Extract Method

```python
# Before
temp = 2 * (height + width)
print(temp)
temp = height * width
print(temp)

# After
perimeter = 2 * (height + width)
print(perimeter)
area = height * width
print(area)
```

---

## 7. Remove Assignments to Parameters

**Problem:** Value assigned to parameter inside method body; creates confusion about data flow.

**Solution:** Use local variable initialized with parameter value for all subsequent operations.

**When to use:**
- Clarify intent by keeping parameters unchanged
- Prevent side effects on caller arguments
- Preparing for method extraction

```python
# Before
def discount(input_val, quantity):
    if quantity > 50:
        input_val -= 2
    return input_val

# After
def discount(input_val, quantity):
    result = input_val
    if quantity > 50:
        result -= 2
    return result
```

---

## 8. Replace Method with Method Object

**Problem:** Long method with intertwined local variables preventing Extract Method.

**Solution:** Transform method into separate class; local variables become fields.

**When to use:**
- Method too long to refactor through standard extraction
- Local variables tightly coupled and difficult to isolate
- Need to decompose complex logic while keeping it together

```python
# Before (in Order class)
def price():
    primary_base_price = ...
    secondary_base_price = ...
    tertiary_base_price = ...
    # long computation using these variables

# After
class PriceCalculator:
    def __init__(self, order):
        self.order = order
        self.primary_base_price = 0
        self.secondary_base_price = 0
        self.tertiary_base_price = 0

    def compute(self):
        # computation split into multiple methods
        return self.calculate_primary() + self.calculate_secondary()
```

---

## 9. Substitute Algorithm

**Problem:** Need to replace existing algorithm that's cluttered, inefficient, or unsuitable.

**Solution:** Replace method body with new algorithm; simplify existing code first if possible.

**When to use:**
- Complexity makes gradual refactoring impractical
- Algorithm incorporated into well-known library
- Requirements shift making existing algorithm unsuitable

```python
# Before
def found_person(people):
    for person in people:
        if person == "Don":
            return "Don"
        if person == "John":
            return "John"
        if person == "Kent":
            return "Kent"
    return ""

# After
def found_person(people):
    candidates = {"Don", "John", "Kent"}
    for person in people:
        if person in candidates:
            return person
    return ""
```
