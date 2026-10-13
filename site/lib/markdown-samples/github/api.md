---
title: API reference
---
# API reference

[Start](./index.md) · [API](./api.md) · [Recipes](./recipes.md)

### createCache({ ttl })

Create a cache with a lifetime in seconds. Use a positive number.

| Method | Behavior |
| --- | --- |
| `get(key)` | Return a fresh value, or `undefined` |
| `set(key, value)` | Store a value and restart its lifetime |
| `clear()` | Remove every entry |

### Expiration

A key is fresh until its lifetime ends. Reading an expired key removes it.

```js
cache.set('count', 0)
cache.get('count') // 0, not a miss
```
