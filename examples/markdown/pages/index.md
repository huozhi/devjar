---
title: The art of noticing
description: A field guide to small observations and careful experiments.
author: Ada Chen
date: October 13, 2026
---

# The art of noticing

A good question often begins with something small: the angle of afternoon light,
a repeated pattern in a leaf, or a result that almost fits our expectations.

This notebook collects those questions. Read [the field notes](./notes.md).

## Begin with a question

> Pay attention to what changes. Then ask what stayed the same.

Before measuring anything, write down what you expect to find. A prediction
makes the difference between a surprising result and an unexplained one.[^method]

## Keep a record

| Observation | Morning | Evening |
| --- | --- | --- |
| Temperature | 18 °C | 22 °C |
| Light | Soft | Direct |
| Samples | 8 | 8 |

```js
const average = samples =>
  samples.reduce((total, value) => total + value, 0) / samples.length
```

## Share the details

- Describe the conditions.
- Keep the original measurements.
- Explain what you would try next.

中文笔记也应有舒适的行距和清楚的层级。每一个微小的观察，都可能成为新的问题。

[^method]: Repeating an experiment is often more useful than adding another decimal place.
