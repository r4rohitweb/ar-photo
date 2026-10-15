<?php
declare(strict_types=1);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
header('X-Content-Type-Options: nosniff');
header('X-Stillmotion: 1');
header('Referrer-Policy: same-origin');
$configFile = getenv('STILLMOTION_CONFIG') ?: __DIR__ . '/config.local.php';
$config = require (is_file($configFile) ? $configFile : __DIR__ . '/config.example.php');
function respond(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function fail(string $message, int $status = 400): void { respond(['error' => $message], $status); }
function db(): PDO {
    global $config;
    static $pdo;
    if (!$pdo) {
        $pdo = new PDO("mysql:host={$config['db_host']};port={$config['db_port']};dbname={$config['db_name']};charset=utf8mb4", $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
        $pdo->exec("SET time_zone = '+00:00'");
    }
    return $pdo;
}
function startSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('stillmotion');
    session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Lax', 'path' => '/']);
    if (!session_start()) fail('Server sessions are unavailable. Check PHP session.save_path permissions.', 503);
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
function method(string $method): void { if ($_SERVER['REQUEST_METHOD'] !== $method) { header('Allow: ' . $method); fail('Method not allowed.', 405); } }
function admin(bool $mutation = false): void {
    startSession();
    if (empty($_SESSION['admin']) || ($_SESSION['expires'] ?? 0) < time()) fail('Please sign in to manage experiences.', 401);
    if ($mutation && !hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('Your session expired. Refresh and try again.', 403);
}
function jsonBody(): array { $data = json_decode(file_get_contents('php://input'), true); if (!is_array($data)) fail('Expected a JSON request body.'); return $data; }
function experience(string $id): array {
    if (!preg_match('/^[a-f0-9]{32}$/D', $id)) fail('This memory could not be found.', 404);
    $stmt = db()->prepare('SELECT * FROM experiences WHERE unique_id = ?'); $stmt->execute([$id]);
    $row = $stmt->fetch(); if (!$row) fail('This memory could not be found. It may have been removed.', 404);
    return $row;
}
function title(string $value): string {
    $value = trim($value); if ($value === '') return 'An unforgettable moment';
    if (!preg_match('//u', $value) || preg_match_all('/./us', $value) > 120 || preg_match('/[\x00-\x1f]/', $value)) fail('Memory names must be valid text with at most 120 characters.');
    return $value;
}
function validateUpload(string $key, bool $required = true): ?array {
    if (!isset($_FILES[$key]) || $_FILES[$key]['error'] === UPLOAD_ERR_NO_FILE) { if ($required) fail("Please upload a {$key}."); return null; }
    $file = $_FILES[$key];
    if (is_array($file['error']) || $file['error'] !== UPLOAD_ERR_OK) fail("The {$key} upload failed. Check PHP upload limits.");
    $max = $key === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
    if ($file['size'] < 1) fail("The {$key} is empty. Choose another file.");
    if ($file['size'] > $max) fail("The {$key} exceeds its size limit.");
    if (!is_uploaded_file($file['tmp_name'])) fail('The server could not process the temporary upload. Check upload_tmp_dir permissions.', 503);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $types = $key === 'image' ? ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'] : ['video/mp4' => 'mp4', 'video/webm' => 'webm'];
    if (!isset($types[$mime])) fail("Unsupported {$key} content. The file must be a valid " . ($key === 'image' ? 'JPG, PNG, or WEBP.' : 'MP4 or WEBM.'));
    $dimensions = null;
    if ($key === 'image') {
        $dimensions = @getimagesize($file['tmp_name']);
        if (!$dimensions || $dimensions[0] < 1 || $dimensions[1] < 1 || $dimensions[0] * $dimensions[1] > 40000000) fail('Choose a valid image of at most 40 megapixels.');
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($file['tmp_name'], 'IFD0');
            if (in_array((int)($exif['Orientation'] ?? 1), [5, 6, 7, 8], true)) [$dimensions[0], $dimensions[1]] = [$dimensions[1], $dimensions[0]];
        }
    }
    return ['tmp' => $file['tmp_name'], 'name' => bin2hex(random_bytes(24)) . '.' . $types[$mime], 'dimensions' => $dimensions];
}
function saveUpload(array $file): string {
    global $config;
    if (!is_dir($config['storage_path']) && !mkdir($config['storage_path'], 0750, true)) throw new RuntimeException('Storage directory is unavailable.');
    if (!move_uploaded_file($file['tmp'], $config['storage_path'] . '/' . $file['name'])) throw new RuntimeException('Could not save an uploaded file.');
    return $file['name'];
}
function removeFile(string $name): void { global $config; if (preg_match('/^[a-f0-9]{48}\.(jpg|png|webp|mp4|webm)$/D', $name)) { $path = $config['storage_path'] . '/' . $name; if (is_file($path) && !unlink($path)) error_log('Stillmotion: could not remove media ' . $name); } }
function streamMedia(string $file): void {
    global $config;
    if (!preg_match('/^[a-f0-9]{48}\.(jpg|png|webp|mp4|webm)$/D', $file)) fail('Media not found.', 404);
    $path = $config['storage_path'] . '/' . $file;
    if (!is_file($path)) fail('Media not found.', 404);
    $size = filesize($path); $start = 0; $end = $size - 1;
    $types = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'mp4' => 'video/mp4', 'webm' => 'video/webm'];
    header('Content-Type: ' . $types[pathinfo($file, PATHINFO_EXTENSION)]); header('Accept-Ranges: bytes'); header('Cache-Control: public, max-age=86400, immutable');
    if (isset($_SERVER['HTTP_RANGE'])) {
        if (!preg_match('/^bytes=(\d*)-(\d*)$/D', $_SERVER['HTTP_RANGE'], $range) || ($range[1] === '' && $range[2] === '')) { header("Content-Range: bytes */{$size}"); http_response_code(416); exit; }
        if ($range[1] === '') $start = max(0, $size - (int)$range[2]);
        else { $start = (int)$range[1]; if ($range[2] !== '') $end = min($end, (int)$range[2]); }
        if ($start > $end || $start >= $size) { header("Content-Range: bytes */{$size}"); http_response_code(416); exit; }
        http_response_code(206); header("Content-Range: bytes {$start}-{$end}/{$size}");
    }
    header('Content-Length: ' . ($end - $start + 1));
    if ($_SERVER['REQUEST_METHOD'] === 'HEAD') exit;
    $stream = fopen($path, 'rb'); fseek($stream, $start); $remaining = $end - $start + 1;
    while ($remaining > 0 && !feof($stream) && !connection_aborted()) { $chunk = fread($stream, min(65536, $remaining)); if ($chunk === false || $chunk === '') break; echo $chunk; $remaining -= strlen($chunk); }
    fclose($stream); exit;
}
