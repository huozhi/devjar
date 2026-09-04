Ioskeley Mono Regular from the v2.0.0 release:
https://github.com/ahatem/IoskeleyMono/releases/tag/v2.0.0

Subset of WOFF2-Unhinted/IoskeleyMono-Regular.woff2 (30,724 bytes).
Includes ASCII, Latin-1, general punctuation, arrows, and box drawing.
Programming ligatures are preserved. Other characters use the CSS fallback.
The license is distributed in site/public/fonts/IoskeleyMono-OFL.txt.

Reproduce with FontTools and Brotli:

```sh
pyftsubset IoskeleyMono-Regular.woff2 --unicodes=U+0020-007E,U+00A0-00FF,U+2000-206F,U+2190-21FF,U+2500-257F --layout-features='*' --flavor=woff2 --output-file=code-symbols.woff2
```
