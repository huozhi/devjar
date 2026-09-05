# Personal résumé

A simple black-and-white résumé with an editable playground. Alex Placeholder is an intentionally fictional sample profile. Replace the
content and the example.com email address with your own.

## Run locally

From this example directory:

```sh
npx devjar dev
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

From this example directory:

```sh
npx devjar build --exclude pages/playground.tsx
npx devjar start
```

The build writes `dist/`, including prerendered page HTML,
CSS, and vendored dependencies. The playground and its browser compiler are
excluded; the editor link is hidden in production. Publish the contents to a
static host.

<details>
<summary>Include the playground in the export</summary>

Omit `--exclude` from the build command to also export `/playground`.

The embedded playground runs its compiler in a browser worker. No special
response headers are required on your static host.

</details>
