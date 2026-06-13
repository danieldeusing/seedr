# Creational Patterns

Patterns that deal with object creation mechanisms, trying to create objects in a manner suitable to the situation.

## Table of Contents
- [Factory Method](#factory-method)
- [Abstract Factory](#abstract-factory)
- [Builder](#builder)
- [Prototype](#prototype)
- [Singleton](#singleton)

---

## Factory Method

**Also Known As:** Virtual Constructor

**Intent:** Define an interface for creating an object, but let subclasses decide which class to instantiate.

**Problem:** Tight coupling between creator and concrete product classes. Adding new products requires modifying existing code.

**Solution:** Replace direct construction (`new`) with calls to a factory method. Subclasses override this method to return different product types.

**Participants:**
| Component | Role |
|-----------|------|
| Product | Interface for objects the factory creates |
| Concrete Product | Implements the Product interface |
| Creator | Declares factory method, may provide default |
| Concrete Creator | Overrides factory method to return specific product |

**When to Use:**
- Product types unknown beforehand
- Enable library users to extend internal components
- Reuse existing objects (object pooling)

**TypeScript Example:**
```typescript
interface Transport { deliver(): void }

class Truck implements Transport {
  deliver() { console.log('Deliver by land') }
}

class Ship implements Transport {
  deliver() { console.log('Deliver by sea') }
}

abstract class Logistics {
  abstract createTransport(): Transport

  planDelivery() {
    const transport = this.createTransport()
    transport.deliver()
  }
}

class RoadLogistics extends Logistics {
  createTransport(): Transport { return new Truck() }
}

class SeaLogistics extends Logistics {
  createTransport(): Transport { return new Ship() }
}
```

---

## Abstract Factory

**Intent:** Create families of related objects without specifying concrete classes.

**Problem:** Need to create multiple related products while ensuring compatibility within a family. Risk of mismatched objects.

**Solution:** Declare interfaces for each product type, then create concrete factories that produce a specific family variant.

**Participants:**
| Component | Role |
|-----------|------|
| Abstract Products | Interfaces for distinct related products |
| Concrete Products | Variant implementations grouped by family |
| Abstract Factory | Interface declaring creation methods |
| Concrete Factories | Implement creation for specific variants |
| Client | Uses only abstract interfaces |

**When to Use:**
- Code interacts with multiple product families
- Products from same family must be compatible
- Need to add new product variations without modifying clients

**TypeScript Example:**
```typescript
interface Button { render(): void }
interface Checkbox { toggle(): void }

interface GUIFactory {
  createButton(): Button
  createCheckbox(): Checkbox
}

class WindowsFactory implements GUIFactory {
  createButton(): Button { return new WindowsButton() }
  createCheckbox(): Checkbox { return new WindowsCheckbox() }
}

class MacFactory implements GUIFactory {
  createButton(): Button { return new MacButton() }
  createCheckbox(): Checkbox { return new MacCheckbox() }
}

// Client code
function createUI(factory: GUIFactory) {
  const button = factory.createButton()
  const checkbox = factory.createCheckbox()
  button.render()
  checkbox.toggle()
}
```

---

## Builder

**Intent:** Construct complex objects step-by-step, allowing different representations from the same construction process.

**Problem:** Complex object initialization with many parameters ("telescoping constructor" anti-pattern).

**Solution:** Extract construction into separate builder objects. Optionally use a director to define construction sequences.

**Participants:**
| Component | Role |
|-----------|------|
| Builder | Declares construction steps |
| Concrete Builders | Implement building strategies for variants |
| Product | The resulting complex object |
| Director | Manages step ordering (optional) |
| Client | Associates builders with directors |

**When to Use:**
- Eliminate constructors with many parameters
- Create different product representations
- Construct composite trees or nested objects

**TypeScript Example:**
```typescript
class House {
  walls?: number
  doors?: number
  windows?: number
  roof?: string
  garage?: boolean
}

interface HouseBuilder {
  reset(): void
  buildWalls(count: number): this
  buildDoors(count: number): this
  buildWindows(count: number): this
  buildRoof(type: string): this
  buildGarage(): this
  getResult(): House
}

class ConcreteHouseBuilder implements HouseBuilder {
  private house: House = new House()

  reset() { this.house = new House() }
  buildWalls(count: number) { this.house.walls = count; return this }
  buildDoors(count: number) { this.house.doors = count; return this }
  buildWindows(count: number) { this.house.windows = count; return this }
  buildRoof(type: string) { this.house.roof = type; return this }
  buildGarage() { this.house.garage = true; return this }
  getResult() { return this.house }
}

// Fluent usage
const house = new ConcreteHouseBuilder()
  .buildWalls(4)
  .buildDoors(2)
  .buildWindows(6)
  .buildRoof('tile')
  .getResult()
```

---

## Prototype

**Also Known As:** Clone

**Intent:** Create new objects by copying existing ones without depending on their classes.

**Problem:** Creating exact copies is challenging when fields are private or you only know an object's interface.

**Solution:** Delegate cloning to objects themselves via a common `clone` method.

**Participants:**
| Component | Role |
|-----------|------|
| Prototype | Interface declaring clone method |
| Concrete Prototype | Implements cloning, handles deep copy |
| Client | Produces copies via prototype interface |
| Registry (optional) | Stores pre-built prototypes |

**When to Use:**
- Code shouldn't depend on concrete classes being copied
- Reduce subclasses that differ only in initialization
- Work with third-party objects via interfaces

**TypeScript Example:**
```typescript
interface Prototype<T> {
  clone(): T
}

class Shape implements Prototype<Shape> {
  constructor(
    public x: number,
    public y: number,
    public color: string
  ) {}

  clone(): Shape {
    return new Shape(this.x, this.y, this.color)
  }
}

class Circle extends Shape {
  constructor(x: number, y: number, color: string, public radius: number) {
    super(x, y, color)
  }

  clone(): Circle {
    return new Circle(this.x, this.y, this.color, this.radius)
  }
}

// Usage
const original = new Circle(10, 20, 'red', 15)
const copy = original.clone()
```

---

## Singleton

**Intent:** Ensure a class has only one instance with global access point.

**Problem:** Need controlled access to a shared resource (database, file system, configuration).

**Solution:** Private constructor + static method returning the cached instance.

**Participants:**
| Component | Role |
|-----------|------|
| Singleton | Private constructor, static getInstance method |

**When to Use:**
- Exactly one instance required for all clients
- Stricter control over global variables needed

**Caveats:**
- Violates Single Responsibility Principle
- Difficult to unit test and mock
- Can hide dependencies

**TypeScript Example:**
```typescript
class Database {
  private static instance: Database
  private connection: string

  private constructor() {
    this.connection = 'Connected to database'
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database()
    }
    return Database.instance
  }

  query(sql: string): string {
    return `Executing: ${sql}`
  }
}

// Usage
const db1 = Database.getInstance()
const db2 = Database.getInstance()
console.log(db1 === db2) // true
```

**Thread-Safe Variant (with lazy initialization):**
```typescript
class ThreadSafeSingleton {
  private static instance: ThreadSafeSingleton | null = null
  private static initializing = false

  private constructor() {}

  static getInstance(): ThreadSafeSingleton {
    if (!this.instance && !this.initializing) {
      this.initializing = true
      this.instance = new ThreadSafeSingleton()
      this.initializing = false
    }
    return this.instance!
  }
}
```
