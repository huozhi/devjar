# Single file

One React component and one Markdown file, each previewed on its own without a
`pages/` directory.

## Run locally

From the repository root:

```sh
npx devjar examples/single-file/chart.tsx  # Render the component at /
npx devjar examples/single-file/notes.md   # Render the Markdown page at /
```

`chart.tsx` imports `data.json` and `chart.css` with relative paths, and its
packages load from the CDN at the versions in `package.json`. Edit the label
or data and the chart updates in place; a selected bar stays selected.
