# Behavioral Patterns

Patterns that deal with object interaction and responsibility distribution.

## Table of Contents
- [Chain of Responsibility](#chain-of-responsibility)
- [Command](#command)
- [Iterator](#iterator)
- [Mediator](#mediator)
- [Memento](#memento)
- [Observer](#observer)
- [State](#state)
- [Strategy](#strategy)
- [Template Method](#template-method)
- [Visitor](#visitor)

---

## Chain of Responsibility

**Also Known As:** CoR, Chain of Command

**Intent:** Pass requests along a chain of handlers. Each handler decides to process or pass along.

**Problem:** Sequential checks become messy when hardcoded. Adding new checks creates bloated code.

**Solution:** Transform checks into standalone handler objects linked in a chain.

**Participants:**
| Component | Role |
|-----------|------|
| Handler | Interface for handling requests |
| Base Handler | Boilerplate, manages next handler reference |
| Concrete Handlers | Implement processing logic |
| Client | Constructs chains, initiates requests |

**When to Use:**
- Process various request types in unknown sequences
- Handlers must execute in specific order
- Handler set needs runtime modification

**TypeScript Example:**
```typescript
interface Handler {
  setNext(handler: Handler): Handler
  handle(request: string): string | null
}

abstract class AbstractHandler implements Handler {
  private nextHandler: Handler | null = null

  setNext(handler: Handler): Handler {
    this.nextHandler = handler
    return handler
  }

  handle(request: string): string | null {
    if (this.nextHandler) {
      return this.nextHandler.handle(request)
    }
    return null
  }
}

class AuthHandler extends AbstractHandler {
  handle(request: string) {
    if (request === 'auth') return 'AuthHandler: Authenticated'
    return super.handle(request)
  }
}

class CacheHandler extends AbstractHandler {
  handle(request: string) {
    if (request === 'cache') return 'CacheHandler: From cache'
    return super.handle(request)
  }
}

// Build chain
const auth = new AuthHandler()
const cache = new CacheHandler()
auth.setNext(cache)

auth.handle('auth')  // AuthHandler processes
auth.handle('cache') // Passes to CacheHandler
```

---

## Command

**Also Known As:** Action, Transaction

**Intent:** Encapsulate a request as an object, enabling parameterization, queuing, and undo.

**Problem:** Code duplication when same operations invoked from multiple UI elements.

**Solution:** Create command objects that encapsulate requests with a common execute interface.

**Participants:**
| Component | Role |
|-----------|------|
| Sender (Invoker) | Triggers command execution |
| Command | Interface with execute method |
| Concrete Commands | Implement specific requests |
| Receiver | Contains business logic |
| Client | Creates and configures commands |

**When to Use:**
- Parameterize objects with operations
- Queue, schedule, or execute remotely
- Implement undo/redo

**TypeScript Example:**
```typescript
interface Command {
  execute(): void
  undo(): void
}

class Editor {
  text = ''

  insert(text: string) { this.text += text }
  delete(count: number) { this.text = this.text.slice(0, -count) }
}

class InsertCommand implements Command {
  constructor(private editor: Editor, private text: string) {}

  execute() { this.editor.insert(this.text) }
  undo() { this.editor.delete(this.text.length) }
}

class CommandHistory {
  private history: Command[] = []

  push(cmd: Command) {
    this.history.push(cmd)
    cmd.execute()
  }

  undo() {
    const cmd = this.history.pop()
    cmd?.undo()
  }
}

// Usage
const editor = new Editor()
const history = new CommandHistory()
history.push(new InsertCommand(editor, 'Hello'))
history.push(new InsertCommand(editor, ' World'))
console.log(editor.text) // "Hello World"
history.undo()
console.log(editor.text) // "Hello"
```

---

## Iterator

**Intent:** Traverse elements of a collection without exposing its representation.

**Problem:** Different collections need different traversal approaches. Adding traversal to collection classes blurs responsibility.

**Solution:** Extract traversal into separate iterator objects.

**Participants:**
| Component | Role |
|-----------|------|
| Iterator | Interface for traversal methods |
| Concrete Iterators | Implement traversal algorithms |
| Collection | Interface for creating iterators |
| Concrete Collections | Return appropriate iterators |

**When to Use:**
- Hide complex data structure internals
- Eliminate duplicate traversal code
- Support multiple traversal strategies

**TypeScript Example:**
```typescript
interface Iterator<T> {
  current(): T
  next(): T
  hasNext(): boolean
  reset(): void
}

interface Collection<T> {
  createIterator(): Iterator<T>
}

class ArrayIterator<T> implements Iterator<T> {
  private position = 0

  constructor(private items: T[]) {}

  current() { return this.items[this.position] }
  next() { return this.items[this.position++] }
  hasNext() { return this.position < this.items.length }
  reset() { this.position = 0 }
}

class WordsCollection implements Collection<string> {
  private items: string[] = []

  add(item: string) { this.items.push(item) }
  createIterator() { return new ArrayIterator(this.items) }
}

// Usage
const collection = new WordsCollection()
collection.add('First')
collection.add('Second')

const iterator = collection.createIterator()
while (iterator.hasNext()) {
  console.log(iterator.next())
}
```

---

## Mediator

**Also Known As:** Intermediary, Controller

**Intent:** Reduce chaotic dependencies by centralizing communication through a mediator.

**Problem:** Components develop tangled interdependencies, hindering reuse.

**Solution:** Components communicate through mediator instead of directly.

**Participants:**
| Component | Role |
|-----------|------|
| Components | Classes with business logic, reference mediator |
| Mediator | Interface for communication methods |
| Concrete Mediator | Encapsulates component relationships |

**When to Use:**
- Classes are tightly coupled
- Component reuse is blocked by dependencies
- Need multiple collaboration patterns

**TypeScript Example:**
```typescript
interface Mediator {
  notify(sender: Component, event: string): void
}

class Component {
  constructor(protected mediator: Mediator) {}
}

class Button extends Component {
  click() { this.mediator.notify(this, 'click') }
}

class Textbox extends Component {
  value = ''
  update(text: string) { this.value = text }
}

class Checkbox extends Component {
  checked = false
  toggle() {
    this.checked = !this.checked
    this.mediator.notify(this, 'toggle')
  }
}

class DialogMediator implements Mediator {
  constructor(
    private button: Button,
    private textbox: Textbox,
    private checkbox: Checkbox
  ) {}

  notify(sender: Component, event: string) {
    if (sender === this.checkbox && event === 'toggle') {
      if (this.checkbox.checked) {
        this.textbox.update('Checkbox is checked')
      }
    }
    if (sender === this.button && event === 'click') {
      console.log('Submit:', this.textbox.value)
    }
  }
}
```

---

## Memento

**Also Known As:** Snapshot

**Intent:** Save and restore object state without revealing implementation details.

**Problem:** Implementing undo requires exposing private data, breaking encapsulation.

**Solution:** Object creates snapshots of its own state. Caretakers store but don't access memento internals.

**Participants:**
| Component | Role |
|-----------|------|
| Originator | Produces and restores from snapshots |
| Memento | Immutable snapshot of state |
| Caretaker | Manages when to capture/restore |

**When to Use:**
- Implement undo/redo
- Support transactional rollbacks
- Preserve encapsulation

**TypeScript Example:**
```typescript
class EditorMemento {
  constructor(
    private readonly content: string,
    private readonly cursorPosition: number
  ) {}

  getContent() { return this.content }
  getCursorPosition() { return this.cursorPosition }
}

class Editor {
  private content = ''
  private cursorPosition = 0

  type(text: string) {
    this.content += text
    this.cursorPosition = this.content.length
  }

  save(): EditorMemento {
    return new EditorMemento(this.content, this.cursorPosition)
  }

  restore(memento: EditorMemento) {
    this.content = memento.getContent()
    this.cursorPosition = memento.getCursorPosition()
  }

  getContent() { return this.content }
}

class History {
  private snapshots: EditorMemento[] = []

  push(memento: EditorMemento) { this.snapshots.push(memento) }
  pop(): EditorMemento | undefined { return this.snapshots.pop() }
}

// Usage
const editor = new Editor()
const history = new History()

editor.type('Hello')
history.push(editor.save())
editor.type(' World')
history.push(editor.save())
editor.type('!')

console.log(editor.getContent()) // "Hello World!"
editor.restore(history.pop()!)
console.log(editor.getContent()) // "Hello World"
```

---

## Observer

**Also Known As:** Event-Subscriber, Listener

**Intent:** Define subscription mechanism to notify multiple objects about events.

**Problem:** One object's state changes need to update many other objects without tight coupling.

**Solution:** Publisher maintains subscriber list, notifies through common interface.

**Participants:**
| Component | Role |
|-----------|------|
| Publisher | Issues events, maintains subscriptions |
| Subscriber | Interface with update method |
| Concrete Subscribers | React to notifications |
| Client | Creates and registers subscribers |

**When to Use:**
- Changes to one object may require changes in unknown/dynamic set
- Objects need temporary observation
- Implement event handling systems

**TypeScript Example:**
```typescript
interface Observer {
  update(data: any): void
}

class Subject {
  private observers: Observer[] = []
  private state: any

  attach(observer: Observer) { this.observers.push(observer) }
  detach(observer: Observer) {
    this.observers = this.observers.filter(o => o !== observer)
  }

  notify() {
    this.observers.forEach(o => o.update(this.state))
  }

  setState(state: any) {
    this.state = state
    this.notify()
  }
}

class ConcreteObserver implements Observer {
  constructor(private name: string) {}

  update(data: any) {
    console.log(`${this.name} received: ${JSON.stringify(data)}`)
  }
}

// Usage
const subject = new Subject()
const observer1 = new ConcreteObserver('Observer 1')
const observer2 = new ConcreteObserver('Observer 2')

subject.attach(observer1)
subject.attach(observer2)
subject.setState({ message: 'Hello' })
// Both observers receive the update
```

---

## State

**Intent:** Let object alter behavior when internal state changes, appearing to change class.

**Problem:** Objects with state-dependent behavior lead to massive conditionals.

**Solution:** Create classes for each state, extract state-specific behavior into them.

**Participants:**
| Component | Role |
|-----------|------|
| Context | Maintains state reference, delegates |
| State | Interface for state-specific methods |
| Concrete States | Implement behavior, may trigger transitions |

**When to Use:**
- Object behaves differently based on state
- Massive conditionals pollute class
- Eliminate duplicate code across states

**TypeScript Example:**
```typescript
interface State {
  handle(context: Context): void
}

class Context {
  constructor(private state: State) {}

  setState(state: State) { this.state = state }
  request() { this.state.handle(this) }
}

class ConcreteStateA implements State {
  handle(context: Context) {
    console.log('State A handling, transitioning to B')
    context.setState(new ConcreteStateB())
  }
}

class ConcreteStateB implements State {
  handle(context: Context) {
    console.log('State B handling, transitioning to A')
    context.setState(new ConcreteStateA())
  }
}

// Usage
const context = new Context(new ConcreteStateA())
context.request() // "State A handling, transitioning to B"
context.request() // "State B handling, transitioning to A"
```

---

## Strategy

**Intent:** Define family of interchangeable algorithms.

**Problem:** Class contains multiple conditional branches for algorithm variants.

**Solution:** Extract algorithms into separate classes implementing common interface.

**Participants:**
| Component | Role |
|-----------|------|
| Context | Maintains strategy reference, delegates |
| Strategy | Common interface for algorithms |
| Concrete Strategies | Implement algorithm variants |
| Client | Creates and configures strategies |

**When to Use:**
- Switch algorithms at runtime
- Similar classes differ only in behavior
- Isolate algorithm from business logic
- Replace massive conditionals

**TypeScript Example:**
```typescript
interface SortStrategy {
  sort(data: number[]): number[]
}

class QuickSort implements SortStrategy {
  sort(data: number[]) {
    console.log('Quick sorting')
    return [...data].sort((a, b) => a - b)
  }
}

class MergeSort implements SortStrategy {
  sort(data: number[]) {
    console.log('Merge sorting')
    return [...data].sort((a, b) => a - b)
  }
}

class Sorter {
  constructor(private strategy: SortStrategy) {}

  setStrategy(strategy: SortStrategy) { this.strategy = strategy }
  sort(data: number[]) { return this.strategy.sort(data) }
}

// Usage
const sorter = new Sorter(new QuickSort())
sorter.sort([3, 1, 2])

sorter.setStrategy(new MergeSort())
sorter.sort([3, 1, 2])
```

---

## Template Method

**Intent:** Define algorithm skeleton in superclass, let subclasses override specific steps.

**Problem:** Code duplication across similar classes performing same algorithm with variations.

**Solution:** Base class with template method calling step methods. Subclasses override steps.

**Participants:**
| Component | Role |
|-----------|------|
| Abstract Class | Template method + abstract/default steps |
| Concrete Classes | Override specific steps |

**Step Types:**
- **Abstract:** Must be implemented
- **Optional:** Have defaults, can be overridden
- **Hooks:** Empty by default, extension points

**When to Use:**
- Multiple classes share algorithm with minor variations
- Let clients extend only specific steps
- Eliminate code duplication

**TypeScript Example:**
```typescript
abstract class DataMiner {
  // Template method
  mine(path: string) {
    const file = this.openFile(path)
    const rawData = this.extractData(file)
    const data = this.parseData(rawData)
    const analysis = this.analyzeData(data)
    this.sendReport(analysis)
    this.closeFile(file)
  }

  abstract openFile(path: string): any
  abstract extractData(file: any): string
  abstract closeFile(file: any): void

  // Default implementation
  parseData(rawData: string): object {
    return JSON.parse(rawData)
  }

  analyzeData(data: object): string {
    return `Analyzed: ${JSON.stringify(data)}`
  }

  // Hook
  sendReport(analysis: string) {
    console.log(analysis)
  }
}

class PDFDataMiner extends DataMiner {
  openFile(path: string) { return { path, type: 'pdf' } }
  extractData(file: any) { return '{"data": "from pdf"}' }
  closeFile(file: any) { console.log('PDF closed') }
}

class CSVDataMiner extends DataMiner {
  openFile(path: string) { return { path, type: 'csv' } }
  extractData(file: any) { return '{"data": "from csv"}' }
  closeFile(file: any) { console.log('CSV closed') }
}
```

---

## Visitor

**Intent:** Add operations to object structures without modifying the objects.

**Problem:** Need new behaviors for a collection of classes without altering them.

**Solution:** Visitor class with methods for each element type. Elements accept visitors via double dispatch.

**Participants:**
| Component | Role |
|-----------|------|
| Visitor | Interface with visit methods per element type |
| Concrete Visitors | Implement operations for each element |
| Element | Interface with accept method |
| Concrete Elements | Call correct visitor method |
| Client | Works with collections via abstract interfaces |

**When to Use:**
- Perform operations on complex object structures
- Extract auxiliary behaviors from primary classes
- Behaviors apply only to specific hierarchy classes

**Trade-off:** Easy to add operations, hard to add element types.

**TypeScript Example:**
```typescript
interface Visitor {
  visitCircle(circle: Circle): void
  visitRectangle(rect: Rectangle): void
}

interface Shape {
  accept(visitor: Visitor): void
}

class Circle implements Shape {
  constructor(public radius: number) {}
  accept(visitor: Visitor) { visitor.visitCircle(this) }
}

class Rectangle implements Shape {
  constructor(public width: number, public height: number) {}
  accept(visitor: Visitor) { visitor.visitRectangle(this) }
}

class AreaCalculator implements Visitor {
  visitCircle(circle: Circle) {
    console.log('Circle area:', Math.PI * circle.radius ** 2)
  }
  visitRectangle(rect: Rectangle) {
    console.log('Rectangle area:', rect.width * rect.height)
  }
}

class XMLExporter implements Visitor {
  visitCircle(circle: Circle) {
    console.log(`<circle radius="${circle.radius}"/>`)
  }
  visitRectangle(rect: Rectangle) {
    console.log(`<rectangle width="${rect.width}" height="${rect.height}"/>`)
  }
}

// Usage
const shapes: Shape[] = [new Circle(5), new Rectangle(4, 6)]
const areaCalc = new AreaCalculator()
const xmlExport = new XMLExporter()

shapes.forEach(s => s.accept(areaCalc))
shapes.forEach(s => s.accept(xmlExport))
```
