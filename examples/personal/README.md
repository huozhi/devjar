# Personal résumé

A simple black-and-white résumé with an editable playground. Alex Placeholder is an intentionally fictional sample profile. Replace the
content and the example.com email address with your own.

## Run locally

From the Devjar repository root:

```sh
pnpm run build
node dist/bin.js dev examples/personal
```

Open `/` for the website and `/playground` for the live editor. No dependency
installation is needed inside the example: `package.json` pins CDN versions.

## Make it yours

Edit `content.json` to change your name, introduction, experience, and projects.
Edit `styles.css` to change the theme. The shared layout lives in
`components/`; files in `pages/` are routes.

The playground imports those exact files using `with { type: 'text' }` and passes
them to `DevJar`. Its JSON edits update the résumé inside the iframe.
Click **Copy content**, then save the copied JSON to `content.json`. Browser
edits do not write to disk or survive a reload.

## Export the same website

From the repository root:

```sh
node dist/bin.js build examples/personal --exclude pages/playground.tsx
node dist/bin.js start examples/personal/dist
```

The build writes `examples/personal/dist/`, including prerendered page HTML,
CSS, and vendored dependencies. The playground and its browser compiler are
excluded; the editor link is hidden in production. Publish the contents to a
static host.

Once text imports and build exclusions are published, you can also run `npx devjar dev`,
`npx devjar build --exclude pages/playground.tsx`, and `npx devjar start` from this example directory. Until then,
use the repository CLI above.

<details>
<summary>Include the playground in the export</summary>

Omit `--exclude` from the build command to also export `/playground`.

The embedded playground needs HTTPS (or localhost) and these response headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Devjar's dev and preview servers set them automatically. Configure them on your
static host if you keep `/playground`.

</details>
