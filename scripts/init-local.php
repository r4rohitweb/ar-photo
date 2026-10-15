<?php
// CLI-only local repair: creates the application schema, without changing any existing records.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__);
$local = $root . '/api/config.local.php';
$config = require (is_file($local) ? $local : $root . '/api/config.example.php');
if (!is_file($local) && getenv('STILLMOTION_DB_PORT')) $config['db_port'] = (int)getenv('STILLMOTION_DB_PORT');
try {
    if (!preg_match('/^[a-zA-Z0-9_]+$/D', $config['db_name'])) throw new RuntimeException('Invalid database name.');
    $pdo = new PDO("mysql:host={$config['db_host']};port={$config['db_port']};charset=utf8mb4", $config['db_user'], $config['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
    $pdo->exec('CREATE DATABASE IF NOT EXISTS `' . $config['db_name'] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('USE `' . $config['db_name'] . '`');
    $schema = file_get_contents($root . '/database/schema.sql');
    $pdo->exec(substr($schema, strpos($schema, 'CREATE TABLE')));
    if (!is_file($local)) file_put_contents($local, '<?php return ' . var_export($config, true) . ';', LOCK_EX);
    echo "Local database ready. Existing memories preserved.\n";
    if (empty($config['admin_password_hash'])) echo "Uploads are ready. Set an administrator password later with php scripts/setup.php.\n";
} catch (Throwable $error) { fwrite(STDERR, 'Local setup failed: ' . $error->getMessage() . "\n"); exit(1); }
