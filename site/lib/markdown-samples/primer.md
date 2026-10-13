---
title: tiny-cache
---

# tiny-cache

A small in-memory cache with an explicit lifetime.

## Usage

```js
const cache = createCache({ ttl: 60 })
cache.set('weather', { temperature: 18 })
cache.get('weather')
```

### API

| Method | Returns |
| --- | --- |
| `get(key)` | A value, or `undefined` |
| `set(key, value)` | The stored value |
| `clear()` | An empty cache |

### Contributing

Keep changes small. Add a reproducible example with your issue.
