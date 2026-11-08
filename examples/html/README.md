# HTML report

A folder in the shape AI agents often write: `report.html` with a stylesheet, a
classic script, CSV data, and an image next to it, plus an earlier draft.
There is no `pages/` directory and no build step.

## Run locally

From the repository root:

```sh
npx devjar examples/html              # List the HTML files, newest first
npx devjar examples/html/report.html  # Open the report at /
```

Files are served as-is with the same relative URLs, so `script.js` can fetch
`data.csv` and `drafts/outline.html` can link `../styles.css`. Edit any file and
the page reloads.
