---
title: tiny-cache
---
# tiny-cache

[Start](./index.md) · [API](./api.md) · [Recipes](./recipes.md)

A small in-memory cache. Values expire; the API stays simple.

## Quick start

```js
const cache = createCache({ ttl: 60 })
cache.set('weather', { temperature: 18 })
cache.get('weather') // { temperature: 18 }
```

`ttl` is measured in seconds. An expired key returns `undefined`.

## Boundaries

- Values live in this process only.
- Reads do not extend a value’s lifetime.
- A restart clears the cache.
