---
name: design-patterns
description: >
  Gang of Four (GoF) design patterns reference covering all 23 classic patterns.
  Use when implementing, refactoring, or discussing software design patterns.
  Triggers on phrases like "use X pattern", "implement factory", "refactor to strategy",
  "which pattern for...", "design pattern help", or when code structure suggests a
  pattern would help (complex conditionals suggesting State/Strategy, object creation
  issues suggesting Factory/Builder, many similar objects suggesting Flyweight).
---

# Design Patterns

Quick reference for the 23 Gang of Four design patterns organized by category.

## Pattern Selection Guide

| Problem | Consider |
|---------|----------|
| Complex object creation | Factory Method, Abstract Factory, Builder |
| Clone existing objects | Prototype |
| Single shared instance | Singleton |
| Incompatible interfaces | Adapter |
| Separate abstraction from implementation | Bridge |
| Tree structures | Composite |
| Add behavior dynamically | Decorator |
| Simplify complex subsystems | Facade |
| Many similar objects (memory) | Flyweight |
| Control access/lazy loading | Proxy |
| Sequential handlers | Chain of Responsibility |
| Encapsulate requests as objects | Command |
| Traverse collections | Iterator |
| Reduce coupling between components | Mediator |
| Save/restore state (undo) | Memento |
| Event notification | Observer |
| Object behavior varies by state | State |
| Interchangeable algorithms | Strategy |
| Algorithm skeleton with variable steps | Template Method |
| Operations on object structures | Visitor |

## Pattern Categories

### Creational Patterns
Object creation mechanisms. See [references/creational.md](references/creational.md).

| Pattern | Intent |
|---------|--------|
| **Factory Method** | Defer instantiation to subclasses |
| **Abstract Factory** | Create families of related objects |
| **Builder** | Construct complex objects step-by-step |
| **Prototype** | Clone existing objects |
| **Singleton** | Ensure single instance with global access |

### Structural Patterns
Object composition and relationships. See [references/structural.md](references/structural.md).

| Pattern | Intent |
|---------|--------|
| **Adapter** | Convert interface to another expected interface |
| **Bridge** | Separate abstraction from implementation |
| **Composite** | Treat individual objects and compositions uniformly |
| **Decorator** | Add responsibilities dynamically |
| **Facade** | Simplified interface to complex subsystem |
| **Flyweight** | Share state to support many fine-grained objects |
| **Proxy** | Placeholder controlling access to another object |

### Behavioral Patterns
Object interaction and responsibility distribution. See [references/behavioral.md](references/behavioral.md).

| Pattern | Intent |
|---------|--------|
| **Chain of Responsibility** | Pass request along handler chain |
| **Command** | Encapsulate request as object |
| **Iterator** | Sequential access without exposing representation |
| **Mediator** | Centralize complex communications |
| **Memento** | Capture and restore object state |
| **Observer** | Notify dependents of state changes |
| **State** | Alter behavior when state changes |
| **Strategy** | Interchangeable algorithm family |
| **Template Method** | Define algorithm skeleton, defer steps to subclasses |
| **Visitor** | Add operations without modifying classes |

## Quick Implementation Examples

### Factory Method (TypeScript)
```typescript
interface Product { operation(): string }

abstract class Creator {
  abstract createProduct(): Product
  doSomething(): string {
    const product = this.createProduct()
    return product.operation()
  }
}

class ConcreteCreator extends Creator {
  createProduct(): Product { return new ConcreteProduct() }
}
```

### Strategy (TypeScript)
```typescript
interface Strategy { execute(data: string[]): string[] }

class Context {
  constructor(private strategy: Strategy) {}
  setStrategy(strategy: Strategy) { this.strategy = strategy }
  doWork(data: string[]): string[] { return this.strategy.execute(data) }
}

// Usage: context.setStrategy(new SortAscending())
```

### Observer (TypeScript)
```typescript
interface Observer { update(state: any): void }

class Subject {
  private observers: Observer[] = []
  attach(o: Observer) { this.observers.push(o) }
  detach(o: Observer) { this.observers = this.observers.filter(x => x !== o) }
  notify(state: any) { this.observers.forEach(o => o.update(state)) }
}
```

### Decorator (TypeScript)
```typescript
interface Component { operation(): string }

class ConcreteComponent implements Component {
  operation() { return 'base' }
}

class Decorator implements Component {
  constructor(protected component: Component) {}
  operation() { return this.component.operation() }
}

class ConcreteDecorator extends Decorator {
  operation() { return `decorated(${super.operation()})` }
}
```

## Resources

For detailed explanations, participants, and when-to-use guidance:

- [references/creational.md](references/creational.md) - Factory Method, Abstract Factory, Builder, Prototype, Singleton
- [references/structural.md](references/structural.md) - Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy
- [references/behavioral.md](references/behavioral.md) - Chain of Responsibility, Command, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor
