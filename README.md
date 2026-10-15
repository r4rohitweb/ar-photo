# Stillmotion

A photo-to-video application with React and two supported backends: PHP/MySQL for local/XAMPP and PHP hosting, and Netlify Functions + Netlify Blobs for Netlify production. Upload a photograph and a video, download the printable photo with its QR code, then scan the code to open WebAR. Point the camera at the printed photo to play its video aligned with the physical image. Ordinary playback is available through **Watch without camera**.

## Project structure

```text
ar-video/
├── src/
│   ├── main.jsx                  # React entry / HashRouter
│   ├── App.jsx                   # Routes and error boundary
│   ├── styles.css                # Tailwind v4 + responsive visual system
│   ├── components/
│   │   ├── UI.jsx                # Navigation, footer, notices, loading, toast
│   │   ├── Icons.jsx
│   │   ├── FileDrop.jsx          # Drag/drop, validation, object URL previews
│   │   ├── MemoryPlayer.jsx      # Fixed frame, photo/video crossfade, replay/audio
│   │   └── QRCard.jsx            # Printable photo and client-generated QR
│   ├── lib/
│   │   ├── api.js                # JSON API and XHR upload progress
│   │   └── media.js              # Validation and high-resolution PNG export
│   └── pages/
│       ├── Create.jsx
│       ├── Preview.jsx
│       ├── Watch.jsx
│       ├── AR.jsx
│       ├── Admin.jsx
│       └── HowItWorks.jsx
├── public/
│   ├── ar.html                   # Isolated camera document / pinned import map
│   └── ar-runtime.js             # Actual MindAR + Three.js image tracking
├── api/
│   ├── index.php                 # REST endpoints
│   ├── bootstrap.php             # PDO, auth, validation, range streaming
│   ├── config.example.php
│   ├── config.local.php          # Created by setup; ignored by Git
│   └── .htaccess                 # Denies HTTP access to configuration
├── database/schema.sql
├── netlify/functions/             # Production API and scheduled cleanup
├── server/netlify/                # Native API, media validation/ranges, Blobs persistence
├── netlify.toml                   # Build, publish, and Functions settings
├── storage/                      # Randomized uploaded filenames; HTTP denied
├── scripts/setup.php            # CLI-only interactive database/admin setup
├── tests/                        # Validation and browser checks
├── .env.example
├── vite.config.js
├── package.json
└── package-lock.json
```

## Local setup with XAMPP and Vite

Requirements: Node.js 22.12+, PHP 8.0+ with `pdo_mysql`, `fileinfo`, and `exif` (for camera JPEG orientation), MySQL 5.7+ or MariaDB 10.4+, and Apache for PHP hosting. Netlify production requires Node.js 22 and does not require PHP or MySQL. The included local PHP code supports XAMPP's PHP 8.0; use a maintained PHP release for public PHP hosting.

1. Put this project at `C:\xampp\htdocs\testing\ar-video` (the current workspace).
2. Start **MySQL** in the XAMPP Control Panel if using the standard port 3306. `npm run dev` starts a dedicated PHP server on port 8080, so Apache is optional for development. In this workspace, a separate project-owned MariaDB database on **3308** is configured under `.local/mysql` because the system MySQL server was not completing startup. The development command automatically restarts that project database when needed; it does not change XAMPP's other databases.
3. The development command already supplies the required PHP upload limits. If serving the API through **Apache**, edit `C:\xampp\php\php.ini`:

   ```ini
   file_uploads=On
   upload_max_filesize=100M
   post_max_size=115M
   max_execution_time=180
   max_input_time=180
   ```

   Restart Apache. `post_max_size` must accommodate both files plus multipart overhead. The API rejects images above 10 MB and videos above 100 MB regardless of PHP's limit. Fileinfo and PDO MySQL must be enabled.

4. From this project directory, run:

   ```powershell
   npm.cmd install
   php scripts/setup.php
   npm.cmd run dev
   ```

   Use `C:\xampp\php\php.exe` if `php` is not on PATH. Setup prompts for database credentials, the frontend URL, and a new administrator password of at least 12 characters. Password entry is visible in this simple CLI; only the password hash is stored. There are no default administrator credentials. Setup creates the database/table and writes ignored `api/config.local.php`. It preserves existing experiences.

5. Open **http://localhost:5173**. The default development proxy sends `/api` to the project's PHP server at `http://127.0.0.1:8080/api`. `npm run dev` starts both servers. To use Apache instead, copy `.env.example` to `.env.local`, set `API_PROXY_TARGET=http://127.0.0.1/testing/ar-video` (adjust the port/path to your virtual host), and restart development. Apache's default virtual host must actually point at `htdocs`; an unrelated virtual host can return HTML 404 pages for this path.
6. Open `/#/admin` to sign in and manage experiences.

If your database user cannot create databases, create one using your hosting panel, import the `CREATE TABLE` portion of `database/schema.sql` into it, copy `api/config.example.php` to `api/config.local.php`, and configure the credentials manually. Generate an admin hash interactively with `php -a` and `password_hash()`; do not commit it.

Health check: `http://localhost:5173/api/index.php?action=health` should return `{"ok":true}`. A 503 usually means MySQL is stopped or configuration/schema is missing. PHP logs detailed errors while the API returns safe messages. A 404 indicates incorrect PHP routing rather than an upload-size problem.

Local database files and configuration are ignored by Git. The project database listens only on `127.0.0.1:3308`. While `npm run dev` is running, it checks that database every two seconds and restarts it if it stops. Startup failures are logged in `.local/mysql-supervisor.log`, with retries spaced at least 15 seconds apart. To stop the database intentionally, stop the development server first, then run `C:/xampp/mysql/bin/mysqladmin.exe --protocol=tcp --host=127.0.0.1 --port=3308 --user=root shutdown`. The next `npm run dev` starts it again. For this local configuration, run `php scripts/setup.php` when you want to set an administrator password.

## Use a phone on the same Wi-Fi

1. Run `ipconfig` and find the PC's LAN IPv4 address, for example `192.168.1.25`.
2. Set `public_url` in `api/config.local.php` to `http://192.168.1.25:5173`. This is the frontend URL, **not** the API URL. Vite already listens on `0.0.0.0`.
3. Allow Node/Vite port 5173 through Windows Firewall on your private network. The phone reaches PHP through Vite, so Apache can remain local for development.
4. Open that URL from your phone first. Ensure both devices are on the same network and Wi-Fi client isolation is off.
5. Create a **new** experience and scan its QR code. Codes generated for `localhost` cannot reach your PC from a phone. Existing `qr_code_url` values remain unchanged if you later change configuration; update them in MySQL and re-download printed QR codes if needed.

The ordinary viewer works over LAN HTTP. Clipboard access may be blocked on HTTP, so the UI shows the link for manual copying when needed. **AR camera mode requires HTTPS** on phones. Use a trusted local TLS setup or an HTTPS tunnel to Vite; update `public_url` to the HTTPS origin before generating QR codes. A phone treats `localhost` as itself.

## Playback and printing

- The frame's aspect ratio comes from the validated photo dimensions. The original photo remains underneath an absolutely positioned video. `playing` reveals the video with a crossfade; buffering retains the photo or last rendered frame. Ending returns to the photograph. The layout does not change.
- Video uses `object-fit: cover`, so mismatched video ratios crop rather than distort or change the frame. Match photo/video composition for best results.
- Muted `playsInline` autoplay is attempted after a short photo introduction. If autoplay is refused, the play button remains available. The viewer has replay/pause and mute controls. H.264 video with AAC audio in MP4 is recommended for iOS/Android; WEBM depends on browser codec support. PHP validates MIME/container type; it does not transcode videos.
- QR PNGs are generated locally by `qrcode`, using the backend's canonical URL. The photo export draws the original aspect ratio image and QR to a white canvas at 1600 px width; no screenshot service is used. Print the QR at least 2.5 cm wide with its white margin intact. Very tall images can exceed a browser's canvas limits; export the QR separately in that case.
- Anyone with a link can watch the memory. This is a share-by-link application, not a private photo vault. Administrator authentication protects listing, editing, deleting, and scan analytics; creation is public.
- Scan counts represent visits to WebAR or ordinary playback (including previews), deduplicated for 30 minutes in the browser's server session. They are not unique-person analytics. Replays or switching to the fallback in the same viewing session do not count again.

## Actual AR tracking

New QR codes open `/#/ar/:id` directly. Existing `/#/watch/:id` links redirect to the same WebAR page, so previously printed codes continue working. `/#/play/:id` provides ordinary playback. The WebAR page shows the photo to scan and an always-visible **Watch without camera** link. Browsers still require a user action and camera permission: opening a QR does not silently start the camera.

AR is isolated in `public/ar.html` to load a compatible pinned Three.js version. On the user's **Start WebAR camera** action, it loads MindAR 1.2.5, compiles the exact uploaded image into a `.mind` target in the browser, and starts camera image tracking. A Three.js video texture is attached to target anchor 0 with the image's aspect ratio. MindAR updates the anchor's transform to follow the physical photo's translation, scale, rotation, and perspective. Losing the target hides the mesh and pauses playback. Leaving the page stops camera tracks.

Compilation can take a minute on slower phones and currently repeats when reopening AR. Production applications at scale should compile/cache targets during ingestion. First launch needs internet access to jsDelivr for MindAR/Three.js; normal playback, uploads, QR, and printing do not depend on that CDN. AR video loops while the photo remains detected. HTTPS, camera permission, WebGL, and a detailed, well-lit, matte photo are needed. Blank skies, low-detail portraits, glare, and movement can make tracking unreliable. **Watch without camera** offers a fallback if tracking fails or camera permission is declined. Physical alignment and camera behavior must be validated on your target phones before offering AR to customers.

References: [MindAR compiler API](https://hiukim.github.io/mind-ar-js-doc/core-api/), [MindAR Three.js implementation](https://github.com/hiukim/mind-ar-js/blob/v1.2.5/src/image-target/three.js), [Vite production build](https://vite.dev/guide/build).

## API

All routes use `api/index.php?action=...`. Errors are JSON `{ "error": "message" }` with meaningful HTTP status codes. The PHP endpoints can be hosted in a subdirectory without rewrite rules.

| Action | Method | Access | Parameters / body |
|---|---|---|---|
| `health` | GET | Public | Database health |
| `create` | POST | Public | Multipart `image`, `video`, optional `title` |
| `get` | GET | Public | `id=<unique_id>` |
| `media` | GET / HEAD | Public | `file=<stored filename>`; HTTP Range supported |
| `scan` | POST | Public | `id=<unique_id>` |
| `session` | GET | Public | Returns authentication status and CSRF token |
| `login` | POST | Public | JSON `{ "password": "..." }` |
| `logout` | POST | Admin + CSRF | Ends session |
| `list` | GET | Admin | Returns experiences newest first |
| `update` | POST | Admin + CSRF | `id`, multipart title and optional replacement files |
| `delete` | DELETE | Admin + CSRF | `id`; removes record and media |

Creation combines validated file upload and experience creation in one request so callers cannot create records with arbitrary server paths. IDs use 128 bits of randomness; media filenames use 192 bits. PDO prepared statements handle user-controlled SQL values. Actual image dimensions/MIME are checked; executable content is never served as executable. The storage directory is denied direct HTTP access and media is served through a strict filename allowlist. Replacement/deletion cleans up previous media; failed database writes clean up newly saved files. Admin sessions use HttpOnly, SameSite cookies (Secure on HTTPS), expire after 8 hours, and require CSRF tokens for mutations.

There are basic session-based upload and login limits. They are **not** a substitute for an edge/IP rate limiter on an internet-facing public upload service. Configure host-level quotas, abuse controls and backups before public release. No malware scanning, transcoding, account-level ownership, or billing is included.

## Deploy the complete app to Netlify

The project now includes a **native Netlify backend**. Netlify Functions run the API; Netlify Blobs stores experience records, admin sessions, scan counters, upload manifests, and photo/video chunks. Blobs is a persistent key/value database for this version, not MySQL. There is no SQL service to provision and no PHP host to configure. Local `npm run dev` continues to use PHP/MySQL.

**Deploy the complete project through a Git-connected Netlify build or the Netlify CLI. Dragging only `dist/` into the Netlify drop zone does not deploy the serverless functions.** That would reproduce the missing API error.

1. Include `netlify/`, `server/`, `scripts/`, `src/`, `public/`, `package.json`, `package-lock.json`, and `netlify.toml` in your source repository. Exclude `.local/`, `.netlify/`, `node_modules/`, `test-results/`, local configuration, and credentials. The deployment-context module is generated by the build command.
2. In Netlify, connect the repository to the existing **ar-photo25** project and use:

   ```text
   Build command:       npm run build:netlify
   Publish directory:   dist
   Functions directory: netlify/functions
   Node version:        22
   ```

   The included `netlify.toml` supplies these settings. Remove an old `NETLIFY_BACKEND=php` override, if present. `PHP_BACKEND_URL` is not needed for the native backend. Do not override the build command with plain `vite build` or `npm run build` on Netlify.
3. Add a server-only environment variable **STILLMOTION_ADMIN_PASSWORD**, at least 12 characters, with the **Functions** scope (or all scopes if your plan does not expose scope selection). Choose your own strong password and mark it as secret where available. Uploads and public playback work without this variable; administrator sign-in intentionally remains disabled until it is configured. Never prefix it with `VITE_`.
4. Optionally set **STILLMOTION_PUBLIC_URL=https://ar-photo25.netlify.app** in the Functions scope to pin QR codes to that domain. Otherwise production uses Netlify's site URL automatically. Redeploy after changing environment variables.
5. Deploy the source. Netlify builds the frontend, bundles `api` and scheduled `cleanup` functions, and configures the API alias. Blobs authentication is supplied by the Netlify Functions runtime; it does not use your local XAMPP credentials. Your account must have Functions and Blobs available; usage is subject to your Netlify plan.
6. Open **https://ar-photo25.netlify.app/api/index.php?action=health**. A working native deployment returns:

   ```json
   {"ok":true,"backend":"netlify","database":"netlify-blobs"}
   ```

   Then create a memory, scan its QR from a different phone, and sign in at `/#/admin` using the password you configured.

If the site is not connected to Git, deploy from the project root using the included CLI dependency:

```powershell
npm.cmd ci
npx.cmd netlify login
npx.cmd netlify link
# Select the existing ar-photo25 project when prompted.
npm.cmd run deploy:netlify
```

`netlify login` authorizes your own account in a browser. Do not paste the access token in chat. `deploy:netlify` builds and uploads both frontend and functions to the linked project. See [Netlify's deployment guide](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/).

The original PHP proxy remains available as an explicit alternative: set `NETLIFY_BACKEND=php` and `PHP_BACKEND_URL=https://your-php-server.example/api/index.php`, host the PHP/MySQL backend separately, and set its `public_url` to the Netlify frontend address. Large PHP-proxied uploads are subject to Netlify's proxy timeout; the default native backend uses chunked uploads instead.

### Netlify storage and upload behavior

- The `/api/index.php` URL is retained for frontend/AR compatibility, but requests are handled by the JavaScript Netlify function; no PHP is executed on Netlify.
- Each upload uses authenticated 2 MiB chunks, individually retried on transient failures. The server verifies declared sizes, actual image/video signatures, image dimensions, and a 40-megapixel image limit before publishing the experience. The original 10 MB image and 100 MB video limits apply. Upload capabilities expire after an hour; no partial experience is published.
- Video delivery supports byte ranges capped at 4 MiB per response. Large video requests need a Range header, as browser video players normally send. Photos stream from their stored chunks. These bounds account for Netlify's request and response limits; see [function limits](https://docs.netlify.com/build/functions/configuration/).
- Experience and scan changes use strong reads and conditional writes. Concurrent scans preserve counts; conflicting administrator edits fail instead of overwriting newer data. Admin sessions use secure HttpOnly cookies on HTTPS with CSRF protection. Login and upload rate limits are persisted per client IP.
- Production stores use stable names beginning `stillmotion-v1-production-` and survive new deployments. Deploy previews use separate namespaces. Local PHP/MySQL memories are not copied into Netlify storage automatically; existing local records and media remain intact.
- A scheduled cleanup function removes expired unfinished uploads, old sessions/rate limits, and queued deleted/replaced media. Cleanup is bounded per invocation and retries remaining work on later runs. A successful deletion makes its experience unavailable immediately; media cleanup is queued if a storage failure interrupts it.
- Blobs is site-wide managed storage. You can inspect it in **Data & Storage > Blobs**. The public experience links remain share-by-link; this is not an account-based private photo vault. See [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) for platform behavior and usage.

### Validate the Netlify version locally

```powershell
npm.cmd test
npm.cmd run build:netlify
npm.cmd run check:netlify
npm.cmd run preview:netlify
```

The last command serves the built frontend and actual serverless API code using Netlify's official Blobs emulator at **http://127.0.0.1:5190**. It is a QA server, not production hosting. Its default administrator password is `netlify-test-password` unless overridden locally with `STILLMOTION_ADMIN_PASSWORD`; this test password is never configured for the deployed site. See [TESTING.md](TESTING.md) for end-to-end and 100 MB upload checks.

## Deploy to PHP/MySQL hosting

1. Create a MySQL database and limited application user. Import the table schema. Set credentials in `api/config.local.php`. Set `public_url` to the final HTTPS frontend URL, e.g. `https://memories.example.com` or `https://example.com/memories`.
2. Create `.env.production.local` (not committed):

   ```ini
   # For a root deployment:
   VITE_API_URL=/api/index.php
   # For a /memories deployment instead:
   # VITE_API_URL=/memories/api/index.php
   ```

3. Run `npm.cmd ci` and `npm.cmd run build`.
4. Copy **contents of `dist/`**, plus `api/` and `storage/`, into the hosting document directory. For example:

   ```text
   public_html/
   ├── index.html
   ├── assets/
   ├── ar.html
   ├── ar-runtime.js
   ├── api/  (including .htaccess and config.local.php)
   └── storage/ (including .htaccess)
   ```

5. Give the PHP process write access to storage (usually 0750 or 0770, depending on ownership). Prefer a storage directory **outside the web root** and set absolute `storage_path` accordingly. If using Nginx, explicitly deny access to `/storage`, `api/config*.php`, and `api/bootstrap.php`; `.htaccess` only applies to Apache. Do not publish `.env*`, scripts, tests, database files, or the source checkout.
6. Configure PHP upload limits and any reverse proxy request-body/time limits. Enable HTTPS. Do not add wildcard CORS; use the same origin for frontend and API. Behind a TLS-terminating proxy, configure your server to set PHP's HTTPS state correctly for Secure session cookies, and only trust forwarded headers from that proxy.
7. Open the health endpoint, upload a real test memory, sign in to admin, test printing/copying/QR playback on a phone, then test AR if needed. Keep regular backups of both MySQL and storage. Avoid changing public URLs after distributing printed codes.

The app uses hash routes, so refreshing an experience URL does not require an SPA rewrite. A static-only host cannot run the PHP/MySQL backend. Sites/Workers hosting is not used by this local XAMPP project.

## Verification

```powershell
npm.cmd run test
npm.cmd run build
Get-ChildItem api,scripts -Filter *.php -Recurse | ForEach-Object { php -l $_.FullName }
```

Browser checks (after installing Playwright's Chromium with `npx playwright install chromium`) run via `npm.cmd run test:browser`. The default suite verifies desktop/mobile layouts, file validation/previews, QR/print downloads, viewer failure handling, and admin interactions with deterministic API fixtures. Live lifecycle and AR tests are opt-in; see [TESTING.md](TESTING.md) for the isolated MySQL/PHP setup.

Verified during implementation: production builds, PHP syntax and local API lifecycle, validation/error handling, native Netlify API persistence through the official Blobs SDK/emulator, desktop/mobile upload → playback → replay → edit → delete flows, a 100 MB MP4 uploaded in 2 MiB chunks with ranged playback, and AR target compilation/engine initialization with a simulated Chromium camera. These are local/emulator checks; they do not verify an authenticated live Netlify deployment or physical image tracking. Scan a real QR and test a physical print on your target phones before release.
