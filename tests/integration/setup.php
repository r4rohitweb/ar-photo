<?php
// Isolated verification database, never the user's XAMPP data directory.
if (PHP_SAPI !== 'cli') exit;
$root = dirname(__DIR__, 2);
$config = require $root . '/api/config.example.php';
$config['db_port'] = 3307;
$config['db_name'] = 'stillmotion_test';
$config['public_url'] = 'http://127.0.0.1:5174';
$config['admin_password_hash'] = password_hash('integration-test-password', PASSWORD_DEFAULT);
$config['storage_path'] = $root . '/test-results/uploads';
$pdo = new PDO('mysql:host=127.0.0.1;port=3307;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE DATABASE IF NOT EXISTS stillmotion_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$pdo->exec('USE stillmotion_test');
$schema = file_get_contents($root . '/database/schema.sql');
$pdo->exec(substr($schema, strpos($schema, 'CREATE TABLE')));
file_put_contents($root . '/test-results/config.php', '<?php return ' . var_export($config, true) . ';');
echo "Isolated database and test configuration ready.\n";
