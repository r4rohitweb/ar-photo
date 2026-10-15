<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__); $local = $root . '/api/config.local.php';
$config = require (is_file($local) ? $local : $root . '/api/config.example.php');
function prompt(string $label, string $default): string { echo $label . ' [' . $default . ']: '; $value = trim((string)fgets(STDIN)); return $value === '' ? $default : $value; }
$config['db_host'] = prompt('MySQL host', $config['db_host']);
$config['db_port'] = (int)prompt('MySQL port', (string)$config['db_port']);
$config['db_name'] = prompt('Database name', $config['db_name']);
if (!preg_match('/^[a-zA-Z0-9_]+$/D', $config['db_name'])) exit("Use only letters, numbers, and underscores in the database name.\n");
$config['db_user'] = prompt('MySQL user', $config['db_user']);
echo "MySQL password (input is visible; empty for default XAMPP): "; $config['db_password'] = rtrim((string)fgets(STDIN), "\r\n");
$config['public_url'] = rtrim(prompt('Public frontend URL (use your LAN IP for mobile testing)', $config['public_url']), '/');
if (!filter_var($config['public_url'], FILTER_VALIDATE_URL) || !in_array(parse_url($config['public_url'], PHP_URL_SCHEME), ['http', 'https']) || str_contains($config['public_url'], '#') || str_contains($config['public_url'], '?')) exit("Use a complete http(s) URL without query or fragment.\n");
echo "New admin password (at least 12 characters; input is visible): "; $password = rtrim((string)fgets(STDIN), "\r\n");
if (strlen($password) < 12) exit("Password must contain at least 12 characters. No changes saved.\n");
$config['admin_password_hash'] = password_hash($password, PASSWORD_DEFAULT); unset($password);
try {
    $pdo = new PDO("mysql:host={$config['db_host']};port={$config['db_port']};charset=utf8mb4", $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $name = $config['db_name'];
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $pdo->exec("USE `{$name}`");
    $sql = file_get_contents($root . '/database/schema.sql');
    $sql = substr($sql, strpos($sql, 'CREATE TABLE'));
    $pdo->exec($sql);
    if (file_put_contents($local, "<?php\nreturn " . var_export($config, true) . ";\n", LOCK_EX) === false) throw new RuntimeException('Could not write config.local.php');
    echo "Database ready. Configuration saved in api/config.local.php. Start Vite with npm run dev.\n";
} catch (Throwable $e) { fwrite(STDERR, "Setup failed: " . $e->getMessage() . "\n"); exit(1); }
