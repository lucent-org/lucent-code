# Lucent Code Docs

Docusaurus 3.x documentation site for [Lucent Code](https://lucentcode.dev).

## Local development

```bash
npm install
npm start        # dev server at http://localhost:3000
npm run build    # production build → build/
```

## Cloudflare Pages deployment

| Setting | Value |
|---|---|
| Root directory | `docs-site` |
| Build command | `npm run build` |
| Build output directory | `build` |
| Node.js version | `20` |

Set the `NODE_VERSION` environment variable to `20` in the Cloudflare Pages project settings.
