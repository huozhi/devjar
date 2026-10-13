---
title: Measuring uncertainty
author: Ada Chen · Research notes
---

# Measuring uncertainty

A measurement is useful when we know how much confidence to place in it.

## Repeated observations

Take several readings under the same conditions. Their spread tells us something that a single value cannot.

| Trial | Reading |
| --- | ---: |
| A | 4.2 |
| B | 4.4 |
| C | 4.1 |

The sample spread gives us a useful summary:

$$
s = \sqrt{\frac{1}{n-1}\sum_{i=1}^{n}(x_i-\bar{x})^2}.
$$

## Report what remains

Keep the original readings beside the summary. Precision describes the instrument; uncertainty describes what we still do not know.
