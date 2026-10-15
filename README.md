# Stillmotion

A React + PHP/MySQL photo-to-video application. Upload a photograph and a video, generate a permanent experience URL, download a printable photograph with a real QR code, and play the video inside the original photo frame.

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
├── storage/                      # Randomized uploaded filenames; HTTP denied
├── scripts/setup.php            # CLI-only interactive database/admin setup
├── tests/                        # Validation and browser checks
├── .env.example
├── vite.config.js
├── package.json
└── package-lock.json
```

## Local setup with XAMPP and Vite

Requirements: Node.js 20.19+ or 22.12+, PHP 8.0+ with `pdo_mysql`, `fileinfo`, and `exif` (for camera JPEG orientation), MySQL 5.7+ or MariaDB 10.4+, and Apache. The included code supports XAMPP's PHP 8.0. Use a currently maintained PHP release for public hosting.

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
- Scan counts represent visits to the watch page (including previews), deduplicated for 30 minutes in the browser's server session. They are not unique-person analytics. Replays in the same viewing session do not count again.

## Actual AR tracking

AR is isolated in `public/ar.html` to load a compatible pinned Three.js version. On the user's **Start camera experience** action, it loads MindAR 1.2.5, compiles the exact uploaded image into a `.mind` target in the browser, and starts camera image tracking. A Three.js video texture is attached to target anchor 0 with the image's aspect ratio. MindAR updates the anchor's transform to follow the physical photo's translation, scale, rotation, and perspective. Losing the target hides the mesh and pauses playback. Leaving the page stops camera tracks.

Compilation can take a minute on slower phones and currently repeats when reopening AR. Production applications at scale should compile/cache targets during ingestion. First launch needs internet access to jsDelivr for MindAR/Three.js; normal playback, uploads, QR, and printing do not depend on that CDN. AR video loops while the photo remains detected. HTTPS, camera permission, WebGL, and a detailed, well-lit, matte photo are needed. Blank skies, low-detail portraits, glare, and movement can make tracking unreliable. The **Back to the photo experience** link always offers a fallback. Physical alignment and camera behavior must be validated on your target phones before offering AR to customers.

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

Verified during implementation: production build, PHP syntax, two validation tests, a real PHP/MySQL API lifecycle, eight desktop/mobile interface checks, two desktop/mobile real upload → playback → replay → edit → delete flows, and AR target compilation/engine initialization with a simulated Chromium camera. These checks do not establish that a physical device can play every uploaded codec or track a printed target. Scan a real QR and test a physical print on your target phones before release.
