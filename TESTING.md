# Verification guide

The app has unit tests, a native Netlify API test using the official Blobs SDK/emulator, fixture-backed browser tests, a live PHP/MySQL API test, end-to-end browser tests, and an opt-in AR initialization test. Live PHP tests must use an isolated test database; test passwords are not suitable for a real deployment.

## Native Netlify backend

`npm test` exercises the real serverless API factory and Netlify Blobs SDK against Netlify's local storage emulator. It checks persisted uploads, file signatures, chunk replay/conflicts, admin authentication/CSRF, stable QR URLs, scans, edits, deletion, and expired-upload cleanup. It requires no Netlify account and does not access production storage.

Build and package the production frontend/functions:

```powershell
npm.cmd run build:netlify
npm.cmd run check:netlify
```

The packager verifies both handlers are modern Netlify API v2 functions and that the cleanup schedule is retained. Native builds no longer require `PHP_BACKEND_URL`.

To test the built frontend end to end, start `npm.cmd run preview:netlify` in a separate terminal. It runs the production API code and the official Blobs emulator at `http://127.0.0.1:5190`, persisting test data under ignored `.local/netlify-emulator`. Use a clean test store if previous tests exhausted the login/upload limits. In a second terminal:

```powershell
$env:STILLMOTION_TEST_BASE_URL = 'http://127.0.0.1:5190'
$env:STILLMOTION_LIVE_API = 'http://127.0.0.1:5190/api/index.php'
$env:STILLMOTION_TEST_ADMIN_PASSWORD = 'netlify-test-password'
$env:STILLMOTION_NATIVE_NETLIFY = '1'
npx.cmd playwright test tests/browser/live.spec.js tests/browser/netlify-large.spec.js --workers=1
```

The large-file test appends a valid ISO BMFF free-space box to the CC0 flower clip, creating a playable MP4 of exactly 100 MiB. It verifies that 51 requests (one photo part and 50 video parts) each stay at or below 2 MiB, and that the resulting video plays through byte-range requests. Desktop runs this large case; desktop/mobile both run the ordinary create/play/replay/edit/delete lifecycle. `test-results/flower.mp4` must exist; download it with the command in the PHP section below if needed.

These checks verify the actual handlers, SDK persistence, streaming, and browser behavior locally. They do not assert that a live Netlify account has deployed/authorized the functions or enabled the required platform features. After deployment, check the public health endpoint and upload a real memory from a phone.

## Routine checks

```powershell
npm.cmd test
npm.cmd run build
Get-ChildItem api,scripts -Filter *.php -Recurse | ForEach-Object { php -l $_.FullName }
npx.cmd playwright install chromium
npm.cmd run test:browser
```

The default browser suite runs twelve fixture-backed tests across desktop and mobile. It covers QR downloads, legacy QR redirects into WebAR, the explicit camera-start screen, invalid experience handling, and ordinary playback fallback. It skips live/AR tests unless their environment variables are set. Playwright writes only to `test-results/browser`; runtime test services use other subdirectories. Never put runtime data inside the browser test output folder.

## Isolated live checks on Windows/XAMPP

Run from this project directory. This uses MariaDB on **3307**, PHP on **8089**, and Vite on **5174**, separate from normal XAMPP services. Ensure these ports are free. These commands assume XAMPP is at `C:/xampp`.

1. Initialize the verification server **once**, if `test-results/mysql` does not exist:

   ```powershell
   New-Item -ItemType Directory -Path test-results -Force | Out-Null
   C:/xampp/mysql/bin/mysql_install_db.exe --datadir="$PWD/test-results/mysql" --port=3307
   ```

2. Start isolated MariaDB in a separate terminal and keep it running:

   ```powershell
   C:/xampp/mysql/bin/mysqld.exe --no-defaults --basedir=C:/xampp/mysql --datadir="$PWD/test-results/mysql" --port=3307 --bind-address=127.0.0.1 --console
   ```

3. Prepare configuration and a small public-domain MP4 fixture:

   ```powershell
   php tests/integration/setup.php
   New-Item -ItemType Directory -Path test-results/php-tmp -Force | Out-Null
   Invoke-WebRequest -Uri 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' -OutFile test-results/flower.mp4
   ```

   This creates `stillmotion_test` on port 3307 and writes **test-results/config.php**, leaving `api/config.local.php` and production storage untouched. The sample clip is Mozilla's CC0 flower video, used only as a test fixture.

4. In another terminal, point PHP to the test configuration and writable temporary directory:

   ```powershell
   $env:STILLMOTION_CONFIG = "$PWD/test-results/config.php"
   php -d upload_max_filesize=100M -d post_max_size=115M -d display_errors=0 -d session.save_path="$PWD/test-results/php-tmp" -d upload_tmp_dir="$PWD/test-results/php-tmp" -S 127.0.0.1:8089 -t .
   ```

5. Run API and live browser checks:

   ```powershell
   npm.cmd run test:api
   $env:STILLMOTION_LIVE_API = 'http://127.0.0.1:8089/api/index.php'
   $env:STILLMOTION_TEST_BASE_URL = 'http://127.0.0.1:5174'
   $env:API_PROXY_TARGET = 'http://127.0.0.1:8089'
   npx.cmd playwright test tests/browser/live.spec.js --workers=1
   ```

   The test runner starts Vite with the real PHP proxy. Stop any old test Vite server on 5174 before changing the proxy environment. Browser upload interception cannot reliably reproduce streamed multipart file bodies, so the live tests exercise the real proxy.

6. Optional AR initialization check (needs network access to jsDelivr and working WebGL):

   ```powershell
   $env:STILLMOTION_TEST_AR = '1'
   npx.cmd playwright test tests/browser/ar.spec.js --project=desktop --workers=1
   ```

   This check also runs independently of the isolated PHP/MySQL setup, using fixture API responses on the normal Vite server. It needs `test-results/flower.mp4`. It follows an existing QR link into WebAR, compiles the photo, and starts MindAR with a simulated camera. It does not test the visual accuracy of physical image tracking. Compilation can take up to a minute. Browser network restrictions may block CDN modules; retry in a network-enabled environment.

7. Stop PHP with Ctrl+C in its terminal and shut down isolated MariaDB:

   ```powershell
   C:/xampp/mysql/bin/mysqladmin.exe --protocol=tcp --host=127.0.0.1 --port=3307 --user=root shutdown
   ```

Test artifacts stay under ignored `test-results/`. Do not deploy this folder or the test scripts. Clear the test environment variables or use a fresh terminal before running the normal application.
