# TypeScript for Python Developers Deep Dive

> A practical guide for Python developers working with TypeScript

---

## Quick Translation Table

| Concept | Python | TypeScript |
|---------|--------|-----------|
| Type hint | `def greet(name: str) -> str:` | `function greet(name: string): string` |
| Optional | `name: str \| None = None` | `name?: string` or `name: string \| undefined` |
| Dictionary | `Dict[str, Any]` | `Record<string, unknown>` |
| List | `List[int]` | `number[]` or `Array<number>` |
| Tuple | `Tuple[str, int]` | `[string, number]` |
| Enum | `class Color(Enum): RED = "red"` | `enum Color { RED = "red" }` |
| Interface | `class Base(ABC):` | `interface Base { ... }` |
| Data class | `@dataclass` / `BaseModel` | `interface` or `class` |
| Lambda | `lambda x: x + 1` | `(x: number) => x + 1` |
| Async | `async def fn():` | `async function fn():` |
| Import | `from x import y` | `import { y } from "x"` |
| None | `None` | `null` or `undefined` |
| f-string | `f"Hello {name}"` | `` `Hello ${name}` `` |

---

## Type System

### Basic Types

```typescript
// Primitives
const name: string = "Ketan";
const age: number = 30;         // No int/float distinction
const active: boolean = true;

// Arrays
const scores: number[] = [1, 2, 3];

// Objects
const config: Record<string, unknown> = { key: "value" };

// Union types (like Python's Union)
let value: string | number = "hello";
value = 42; // Also valid
```

### Interfaces (like ABC in Python)

```typescript
// TypeScript
interface DatabaseProvider {
  connect(): Promise<void>;
  query(sql: string): Promise<Record<string, unknown>[]>;
}

class InMemoryProvider implements DatabaseProvider {
  async connect(): Promise<void> { /* ... */ }
  async query(sql: string): Promise<Record<string, unknown>[]> { /* ... */ }
}
```

```python
# Python equivalent
class DatabaseProvider(ABC):
    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def query(self, sql: str) -> list[dict[str, Any]]: ...

class InMemoryProvider(DatabaseProvider):
    async def connect(self) -> None: ...
    async def query(self, sql: str) -> list[dict[str, Any]]: ...
```

### Generics

```typescript
// TypeScript
function first<T>(items: T[]): T | undefined {
  return items[0];
}

// Python equivalent
def first(items: list[T]) -> T | None:
    return items[0] if items else None
```

---

## Async/Await (Identical Pattern)

```typescript
// TypeScript
async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return await response.text();
}

// Usage
const data = await fetchData("https://api.example.com");
```

```python
# Python (identical pattern!)
async def fetch_data(url: str) -> str:
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.text

# Usage
data = await fetch_data("https://api.example.com")
```

**Key insight:** `async/await` is identical in both languages. The mental model transfers completely.

---

## Error Handling

```typescript
// TypeScript
try {
  const result = await riskyOperation();
} catch (error) {
  if (error instanceof ValidationError) {
    console.error("Validation failed:", error.message);
  } else {
    throw error; // Re-throw unknown errors
  }
}
```

```python
# Python
try:
    result = await risky_operation()
except ValidationError as e:
    print(f"Validation failed: {e}")
except Exception:
    raise
```

---

## Zod vs Pydantic

### Pydantic (Python)

```python
from pydantic import BaseModel, Field

class DatabaseQuery(BaseModel):
    query: str = Field(description="SQL SELECT query")
    params: list[str | int] | None = None
    limit: int = Field(default=10, ge=1, le=100)
```

### Zod (TypeScript)

```typescript
import { z } from "zod";

const DatabaseQuerySchema = z.object({
  query: z.string().describe("SQL SELECT query"),
  params: z.array(z.union([z.string(), z.number()])).optional(),
  limit: z.number().min(1).max(100).default(10),
});

// Infer TypeScript type from schema
type DatabaseQuery = z.infer<typeof DatabaseQuerySchema>;
```

### Validation

```typescript
// Zod parse (throws on invalid)
const input = DatabaseQuerySchema.parse(userInput);
// → Typed as DatabaseQuery

// Zod safeParse (returns result object)
const result = DatabaseQuerySchema.safeParse(userInput);
if (result.success) {
  console.log(result.data); // Typed
} else {
  console.log(result.error.issues); // Validation errors
}
```

---

## Module System

### Python

```python
# absolute import
from src.database.provider import DatabaseProvider

# relative import
from .provider import DatabaseProvider
```

### TypeScript (ES Modules)

```typescript
// Named export/import
export class DatabaseProvider { ... }
import { DatabaseProvider } from "./provider.js";

// Default export/import
export default class DatabaseProvider { ... }
import DatabaseProvider from "./provider.js";

// Type-only import
import type { Config } from "./config.js";
```

**Note:** TypeScript ESM requires `.js` extension in imports even though source files are `.ts`. The compiler resolves this.

---

## Key Differences to Watch

| Trap | Python | TypeScript |
|------|--------|-----------|
| **Equality** | `==` compares value | `===` compares value AND type |
| **Truthiness** | `[]` is falsy | `[]` is truthy! Use `.length === 0` |
| **Null** | Just `None` | Both `null` and `undefined` exist |
| **Destructuring** | Not native | `const { name, age } = person` |
| **Arrow functions** | Not needed (lambda is limited) | `(x) => x + 1` is idiomatic |
| **Semicolons** | Not needed | Optional but conventional |

---

**Related:** [MCP Protocol Deep Dive](mcp-protocol-deep-dive.md) · [Architecture](../architecture-and-design/architecture.md)
