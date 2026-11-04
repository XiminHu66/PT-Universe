# 净读 · Bilinovel Reader

Independent PT Universe subproject. Public entry: `apps/bilinovel-reader/`; owner-private runtime: `/bilipack/reader/` on the existing PT Tools Site.

The reader is mounted in the existing BiliPack process and reuses its dedicated Chromium profile, login and manually completed reading authorization. It creates only its own tab, closes only its own tab tree after 10 idle minutes, and does not change downloader jobs or browser profiles. No new service, cron, public port, Cloudflare browser session, or periodic collector is added.

Normal mode permits source-domain documents/scripts/styles and blocks third-party requests, images, video, fonts and common advertising endpoints. Verification mode is explicitly enabled in the UI and temporarily permits source-required resources and popups. Returning to reading restores filtering. Human verification and advertising authorization are performed by the owner; the reader does not solve or bypass these checks. The source chapter DOM supplies restored paragraph order. Only text nodes are returned, with advertisements, images and markup excluded; a chapter is delivered only after all its pages are read. Verification between pages preserves the already read pages in memory.

The device keeps a local shelf, per-chapter progress, typography and up to 12 recently read chapters (bounded to approximately 3 MB) in IndexedDB. No remote chapter library or cross-device reading sync is introduced. iOS supports dynamic viewport and safe-area insets, touch-sized controls, pinch zoom, scroll or horizontal column pagination, system fonts, paper/sepia/green/night themes and a standalone home-screen manifest. Real iPhone Safari behavior still requires device validation.

## Validation

`node --test services/bilinovel-reader/reader.test.mjs`

`node --check services/bilinovel-reader/public/app.js`

Deployment is performed by the private ops repository with a pinned tested public source revision. The deployment checks the existing process is idle, enforces a projected 15% disk/memory reserve, layers the files on the exact running image, patches only the current server's reader hook, and retains the old image/compose for rollback. Existing downloader tests are run before activation.
