---
title: Cache a request
---
# Cache a request

[Start](./index.md) · [API](./api.md) · [Recipes](./recipes.md)

Check for a saved value before fetching a new one.

```js
async function weather(city) {
  const saved = cache.get(city)
  if (saved !== undefined) return saved

  const response = await fetch(`/weather/${city}`)
  if (!response.ok) throw new Error('Request failed')

  const value = await response.json()
  cache.set(city, value)
  return value
}
```

Only successful responses are stored. Concurrent misses still make separate requests.
