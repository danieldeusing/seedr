# Structural Patterns

Patterns that deal with object composition, creating relationships between objects to form larger structures.

## Table of Contents
- [Adapter](#adapter)
- [Bridge](#bridge)
- [Composite](#composite)
- [Decorator](#decorator)
- [Facade](#facade)
- [Flyweight](#flyweight)
- [Proxy](#proxy)

---

## Adapter

**Also Known As:** Wrapper

**Intent:** Convert one interface into another that clients expect.

**Problem:** Need to use a class with an incompatible interface (e.g., XML library in JSON-based app).

**Solution:** Create wrapper that translates calls between interfaces.

**Participants:**
| Component | Role |
|-----------|------|
| Client | Contains existing business logic |
| Client Interface | Protocol others must follow |
| Service | Incompatible third-party/legacy class |
| Adapter | Implements client interface, wraps service |

**When to Use:**
- Integrate incompatible classes
- Reuse subclasses lacking common functionality
- Work with legacy/third-party code

**TypeScript Example:**
```typescript
// Service with incompatible interface
class XMLParser {
  parseXML(xml: string): object { return { parsed: xml } }
}

// Target interface client expects
interface JSONParser {
  parse(json: string): object
}

// Adapter
class XMLToJSONAdapter implements JSONParser {
  constructor(private xmlParser: XMLParser) {}

  parse(json: string): object {
    // Convert JSON to XML, then parse
    const xml = this.jsonToXml(json)
    return this.xmlParser.parseXML(xml)
  }

  private jsonToXml(json: string): string {
    return `<converted>${json}</converted>`
  }
}

// Client code works with JSONParser
function processData(parser: JSONParser, data: string) {
  return parser.parse(data)
}
```

---

## Bridge

**Intent:** Separate abstraction from implementation so both can vary independently.

**Problem:** Class hierarchy explosion when extending across multiple dimensions (e.g., shapes × colors).

**Solution:** Extract one dimension into separate hierarchy, use composition instead of inheritance.

**Participants:**
| Component | Role |
|-----------|------|
| Abstraction | High-level control, delegates to implementation |
| Implementation | Interface for concrete implementations |
| Concrete Implementations | Platform-specific code |
| Refined Abstractions | Variants of control logic |

**When to Use:**
- Split monolithic classes with multiple variants
- Extend across independent dimensions
- Enable runtime implementation switching

**TypeScript Example:**
```typescript
// Implementation hierarchy
interface Device {
  isEnabled(): boolean
  enable(): void
  disable(): void
  setVolume(percent: number): void
}

class TV implements Device {
  private on = false
  private volume = 30

  isEnabled() { return this.on }
  enable() { this.on = true }
  disable() { this.on = false }
  setVolume(percent: number) { this.volume = percent }
}

class Radio implements Device {
  private on = false
  private volume = 20

  isEnabled() { return this.on }
  enable() { this.on = true }
  disable() { this.on = false }
  setVolume(percent: number) { this.volume = percent }
}

// Abstraction
class RemoteControl {
  constructor(protected device: Device) {}

  togglePower() {
    if (this.device.isEnabled()) {
      this.device.disable()
    } else {
      this.device.enable()
    }
  }
}

// Refined abstraction
class AdvancedRemote extends RemoteControl {
  mute() { this.device.setVolume(0) }
}
```

---

## Composite

**Also Known As:** Object Tree

**Intent:** Compose objects into tree structures, treat individual objects and compositions uniformly.

**Problem:** Need to work with tree structures (e.g., files/folders, nested boxes) without type-checking each element.

**Solution:** Common interface for leaves and containers. Containers delegate to children.

**Participants:**
| Component | Role |
|-----------|------|
| Component | Interface for all elements |
| Leaf | Basic elements, perform actual work |
| Composite | Containers with sub-elements, delegate work |
| Client | Works through component interface |

**When to Use:**
- Core model representable as tree
- Treat simple and complex elements uniformly
- Build nested, recursive structures

**TypeScript Example:**
```typescript
interface Graphic {
  draw(): void
  move(x: number, y: number): void
}

class Dot implements Graphic {
  constructor(private x: number, private y: number) {}

  draw() { console.log(`Dot at (${this.x}, ${this.y})`) }
  move(x: number, y: number) { this.x += x; this.y += y }
}

class CompoundGraphic implements Graphic {
  private children: Graphic[] = []

  add(child: Graphic) { this.children.push(child) }
  remove(child: Graphic) {
    this.children = this.children.filter(c => c !== child)
  }

  draw() { this.children.forEach(c => c.draw()) }
  move(x: number, y: number) { this.children.forEach(c => c.move(x, y)) }
}

// Usage - treat single dots and groups identically
const dot1 = new Dot(1, 2)
const dot2 = new Dot(3, 4)
const group = new CompoundGraphic()
group.add(dot1)
group.add(dot2)
group.draw() // Draws both dots
```

---

## Decorator

**Also Known As:** Wrapper

**Intent:** Attach new behaviors to objects dynamically by wrapping them.

**Problem:** Need to add responsibilities at runtime without subclass explosion.

**Solution:** Wrap objects in decorator classes implementing the same interface.

**Participants:**
| Component | Role |
|-----------|------|
| Component | Common interface |
| Concrete Component | Base object being decorated |
| Base Decorator | Holds wrapped reference, delegates |
| Concrete Decorators | Add specific behaviors |

**When to Use:**
- Add behaviors at runtime
- Inheritance is impractical (final classes)
- Combine behaviors flexibly

**TypeScript Example:**
```typescript
interface DataSource {
  writeData(data: string): void
  readData(): string
}

class FileDataSource implements DataSource {
  constructor(private filename: string) {}
  private data = ''

  writeData(data: string) { this.data = data }
  readData() { return this.data }
}

class DataSourceDecorator implements DataSource {
  constructor(protected wrappee: DataSource) {}

  writeData(data: string) { this.wrappee.writeData(data) }
  readData() { return this.wrappee.readData() }
}

class EncryptionDecorator extends DataSourceDecorator {
  writeData(data: string) {
    super.writeData(btoa(data)) // Encode
  }
  readData() {
    return atob(super.readData()) // Decode
  }
}

class CompressionDecorator extends DataSourceDecorator {
  writeData(data: string) {
    super.writeData(`compressed:${data}`)
  }
  readData() {
    return super.readData().replace('compressed:', '')
  }
}

// Stack decorators
let source: DataSource = new FileDataSource('data.txt')
source = new EncryptionDecorator(source)
source = new CompressionDecorator(source)
source.writeData('secret')
```

---

## Facade

**Intent:** Provide simplified interface to complex subsystem.

**Problem:** Code becomes tightly coupled to many subsystem classes.

**Solution:** Single class exposing limited but sufficient functionality.

**Participants:**
| Component | Role |
|-----------|------|
| Facade | Convenient access to subsystem |
| Additional Facades | Prevent facade from becoming complex |
| Complex Subsystem | Multiple interdependent objects |
| Client | Uses facade instead of subsystem directly |

**When to Use:**
- Need simple interface to complex system
- Structure system into layers
- Reduce coupling between components

**TypeScript Example:**
```typescript
// Complex subsystem classes
class VideoFile { constructor(public filename: string) {} }
class Codec { constructor(public type: string) {} }
class CodecFactory {
  static extract(file: VideoFile): Codec { return new Codec('mp4') }
}
class BitrateReader {
  static read(file: VideoFile, codec: Codec): string { return 'buffer' }
}
class AudioMixer {
  fix(buffer: string): string { return 'fixed:' + buffer }
}

// Facade
class VideoConverter {
  convert(filename: string, format: string): string {
    const file = new VideoFile(filename)
    const codec = CodecFactory.extract(file)
    const buffer = BitrateReader.read(file, codec)
    const result = new AudioMixer().fix(buffer)
    return `${filename}.${format}`
  }
}

// Simple client usage
const converter = new VideoConverter()
const mp4 = converter.convert('video.ogg', 'mp4')
```

---

## Flyweight

**Also Known As:** Cache

**Intent:** Share state to support many fine-grained objects efficiently.

**Problem:** Application with millions of similar objects exhausts memory.

**Solution:** Separate intrinsic (shared) state from extrinsic (unique) state. Store intrinsic in flyweights, pass extrinsic as parameters.

**Participants:**
| Component | Role |
|-----------|------|
| Flyweight | Contains immutable intrinsic state |
| Context | Holds extrinsic state, references flyweights |
| Flyweight Factory | Manages flyweight pool |
| Client | Stores/calculates extrinsic state |

**When to Use:**
- Program needs enormous quantities of similar objects
- Memory is the primary constraint
- Objects contain duplicate state that can be extracted

**TypeScript Example:**
```typescript
// Flyweight - shared state
class TreeType {
  constructor(
    public name: string,
    public color: string,
    public texture: string
  ) {}

  draw(x: number, y: number) {
    console.log(`Drawing ${this.name} at (${x}, ${y})`)
  }
}

// Flyweight factory
class TreeFactory {
  private static treeTypes: Map<string, TreeType> = new Map()

  static getTreeType(name: string, color: string, texture: string): TreeType {
    const key = `${name}-${color}-${texture}`
    if (!this.treeTypes.has(key)) {
      this.treeTypes.set(key, new TreeType(name, color, texture))
    }
    return this.treeTypes.get(key)!
  }
}

// Context - unique state
class Tree {
  constructor(
    private x: number,
    private y: number,
    private type: TreeType
  ) {}

  draw() { this.type.draw(this.x, this.y) }
}

// Forest with millions of trees, few TreeTypes
class Forest {
  private trees: Tree[] = []

  plantTree(x: number, y: number, name: string, color: string, texture: string) {
    const type = TreeFactory.getTreeType(name, color, texture)
    this.trees.push(new Tree(x, y, type))
  }
}
```

---

## Proxy

**Intent:** Provide placeholder controlling access to another object.

**Problem:** Need lazy initialization, access control, logging, or caching without modifying original class.

**Solution:** Proxy implements same interface, delegates to real subject after performing additional actions.

**Participants:**
| Component | Role |
|-----------|------|
| Service Interface | Common interface for proxy and service |
| Service | Actual business logic |
| Proxy | Manages lifecycle, adds behavior, delegates |
| Client | Works with both through interface |

**Types:**
- **Virtual Proxy:** Lazy initialization
- **Protection Proxy:** Access control
- **Remote Proxy:** Local representative for remote object
- **Logging Proxy:** Request logging
- **Caching Proxy:** Result caching

**TypeScript Example:**
```typescript
interface ThirdPartyYouTubeLib {
  listVideos(): string[]
  getVideoInfo(id: string): object
  downloadVideo(id: string): Buffer
}

class ThirdPartyYouTubeClass implements ThirdPartyYouTubeLib {
  listVideos() { return ['video1', 'video2'] }
  getVideoInfo(id: string) { return { id, title: 'Video' } }
  downloadVideo(id: string) { return Buffer.from('video data') }
}

// Caching proxy
class CachedYouTubeClass implements ThirdPartyYouTubeLib {
  private service: ThirdPartyYouTubeLib
  private listCache: string[] | null = null
  private videoCache: Map<string, object> = new Map()

  constructor() {
    this.service = new ThirdPartyYouTubeClass()
  }

  listVideos() {
    if (!this.listCache) {
      this.listCache = this.service.listVideos()
    }
    return this.listCache
  }

  getVideoInfo(id: string) {
    if (!this.videoCache.has(id)) {
      this.videoCache.set(id, this.service.getVideoInfo(id))
    }
    return this.videoCache.get(id)!
  }

  downloadVideo(id: string) {
    return this.service.downloadVideo(id)
  }
}
```
