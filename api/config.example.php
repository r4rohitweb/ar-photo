<?php
// Copy to config.local.php or run: php scripts/setup.php
return [
    'db_host' => '127.0.0.1', 'db_port' => 3306, 'db_name' => 'stillmotion',
    'db_user' => 'root', 'db_password' => '',
    // Must be reachable by the phone. Include the frontend path but no # fragment.
    'public_url' => 'http://localhost:5173',
    // Generate with scripts/setup.php; no default administrator credentials.
    'admin_password_hash' => '',
    'storage_path' => dirname(__DIR__) . '/storage',
];
