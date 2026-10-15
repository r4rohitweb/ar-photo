<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
try {
    $action = $_GET['action'] ?? 'health'; $id = $_GET['id'] ?? '';
    if ($action === 'media') { if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true)) fail('Method not allowed.', 405); streamMedia($_GET['file'] ?? ''); }
    // Same-origin writes only. A Vite proxy preserves the browser's Origin/Host pair.
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'HEAD'], true) && isset($_SERVER['HTTP_ORIGIN'])) {
        $origin = parse_url($_SERVER['HTTP_ORIGIN']);
        $host = strtolower(($origin['host'] ?? '') . (isset($origin['port']) ? ':' . $origin['port'] : ''));
        $expected = strtolower($_SERVER['HTTP_HOST'] ?? '');
        $public = parse_url($config['public_url']);
        $publicHost = strtolower(($public['host'] ?? '') . (isset($public['port']) ? ':' . $public['port'] : ''));
        if ($host !== $expected && $host !== $publicHost) fail('Cross-origin writes are not allowed.', 403);
    }
    switch ($action) {
        case 'health': method('GET'); db()->query('SELECT 1'); respond(['ok' => true]); break;
        case 'session': method('GET'); startSession(); respond(['authenticated' => !empty($_SESSION['admin']) && ($_SESSION['expires'] ?? 0) >= time(), 'csrf' => $_SESSION['csrf']]); break;
        case 'login':
            method('POST'); startSession();
            if (empty($config['admin_password_hash'])) fail('Administrator access is not configured. Run php scripts/setup.php.', 503);
            if (($_SESSION['login_attempts'] ?? 0) >= 8 && ($_SESSION['login_window'] ?? 0) > time() - 900) fail('Too many login attempts. Try again in 15 minutes.', 429);
            if (($_SESSION['login_window'] ?? 0) < time() - 900) { $_SESSION['login_window'] = time(); $_SESSION['login_attempts'] = 0; }
            $_SESSION['login_attempts'] = ($_SESSION['login_attempts'] ?? 0) + 1;
            $data = jsonBody();
            if (!is_string($data['password'] ?? null) || !password_verify($data['password'], $config['admin_password_hash'])) { usleep(250000); fail('That password isn’t correct.', 401); }
            session_regenerate_id(true); $_SESSION['admin'] = true; $_SESSION['expires'] = time() + 28800; $_SESSION['login_attempts'] = 0; $_SESSION['csrf'] = bin2hex(random_bytes(32));
            respond(['authenticated' => true, 'csrf' => $_SESSION['csrf']]); break;
        case 'logout': method('POST'); admin(true); $_SESSION = []; session_destroy(); respond(['ok' => true]); break;
        case 'get': method('GET'); respond(['experience' => experience($id)]); break;
        case 'list': method('GET'); admin(); respond(['experiences' => db()->query('SELECT * FROM experiences ORDER BY created_at DESC, id DESC')->fetchAll()]); break;
        case 'scan':
            method('POST'); startSession(); experience($id);
            // Count a viewing session at most once every 30 minutes; refreshes do not inflate counts.
            $key = 'scan_' . $id;
            if (($_SESSION[$key] ?? 0) < time() - 1800) { $stmt = db()->prepare('UPDATE experiences SET scan_count = scan_count + 1, updated_at = updated_at WHERE unique_id = ?'); $stmt->execute([$id]); $_SESSION[$key] = time(); }
            respond(['ok' => true]); break;
        case 'create':
        case 'update':
            method('POST'); $updating = $action === 'update';
            if ($updating) admin(true); else startSession();
            if (!empty($_SERVER['CONTENT_LENGTH']) && empty($_POST) && empty($_FILES)) fail('The upload exceeds PHP post_max_size. Ask the administrator to increase the upload limits.', 413);
            if (!$updating && count(array_filter($_SESSION['uploads'] ?? [], fn($t) => $t > time() - 3600)) >= 10) fail('Upload limit reached. Please try again in an hour.', 429);
            $existing = $updating ? experience($id) : null;
            $name = title($_POST['title'] ?? ($existing['title'] ?? ''));
            $image = validateUpload('image', !$updating); $video = validateUpload('video', !$updating);
            $saved = [];
            try {
                $pdo = db();
                $imagePath = $image ? ($saved[] = saveUpload($image)) : $existing['image_path'];
                $videoPath = $video ? ($saved[] = saveUpload($video)) : $existing['video_path'];
                $width = $image ? $image['dimensions'][0] : $existing['image_width']; $height = $image ? $image['dimensions'][1] : $existing['image_height'];
                if ($updating) { $stmt = $pdo->prepare('UPDATE experiences SET title=?, image_path=?, video_path=?, image_width=?, image_height=? WHERE unique_id=?'); $stmt->execute([$name, $imagePath, $videoPath, $width, $height, $id]); }
                else {
                    $id = bin2hex(random_bytes(16)); $url = rtrim($config['public_url'], '/') . '/#/watch/' . $id;
                    $stmt = $pdo->prepare('INSERT INTO experiences (unique_id,title,image_path,video_path,image_width,image_height,qr_code_url) VALUES (?,?,?,?,?,?,?)');
                    $stmt->execute([$id, $name, $imagePath, $videoPath, $width, $height, $url]);
                }
            } catch (Throwable $e) { foreach ($saved as $file) removeFile($file); throw $e; }
            if ($updating) { if ($image) removeFile($existing['image_path']); if ($video) removeFile($existing['video_path']); }
            else { $_SESSION['uploads'] = array_values(array_filter($_SESSION['uploads'] ?? [], fn($t) => $t > time() - 3600)); $_SESSION['uploads'][] = time(); }
            respond(['experience' => experience($id)], $updating ? 200 : 201); break;
        case 'delete':
            method('DELETE'); admin(true); $row = experience($id); $stmt = db()->prepare('DELETE FROM experiences WHERE unique_id = ?'); $stmt->execute([$id]); removeFile($row['image_path']); removeFile($row['video_path']); respond(['ok' => true]); break;
        default: fail('Endpoint not found.', 404);
    }
} catch (PDOException $e) { error_log('Stillmotion database: ' . $e->getMessage()); fail('The database is unavailable. Start MySQL and run the setup command in the README.', 503); }
catch (Throwable $e) { error_log('Stillmotion: ' . $e->getMessage()); fail('The server could not complete this request. Check the PHP error log and storage permissions.', 500); }
