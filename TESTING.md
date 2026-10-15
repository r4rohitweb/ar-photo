# Verification guide

The app has unit tests, fixture-backed browser tests, a live PHP/MySQL API test, a live end-to-end browser test, and an opt-in AR initialization test. Live tests must use an isolated test database; their known password is not suitable for a real deployment.

## Routine checks

```powershell
npm.cmd test
npm.cmd run build
Get-ChildItem api,scripts -Filter *.php -Recurse | ForEach-Object { php -l $_.FullName }
npx.cmd playwright install chromium
npm.cmd run test:browser
```

The default browser suite runs eight fixture-backed tests across desktop and mobile. It skips live/AR tests unless their environment variables are set. Playwright writes only to `test-results/browser`; runtime test services use other subdirectories. Never put runtime data inside the browser test output folder.

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

   It compiles the uploaded photo and starts MindAR with a simulated camera. It does not test the visual accuracy of physical image tracking. Compilation can take up to a minute. Browser network restrictions may block CDN modules; retry in a network-enabled environment.

7. Stop PHP with Ctrl+C in its terminal and shut down isolated MariaDB:

   ```powershell
   C:/xampp/mysql/bin/mysqladmin.exe --protocol=tcp --host=127.0.0.1 --port=3307 --user=root shutdown
   ```

Test artifacts stay under ignored `test-results/`. Do not deploy this folder or the test scripts. Clear the test environment variables or use a fresh terminal before running the normal application.
