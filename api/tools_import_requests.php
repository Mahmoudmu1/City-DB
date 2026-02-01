<?php

require_once __DIR__ . '/bootstrap.php';

use App\Config\Database;

if (php_sapi_name() !== 'cli') {
    fwrite(STDERR, "This tool must be run from the command line.\n");
    exit(1);
}

$csvPath = $argv[1] ?? null;
if (!$csvPath) {
    fwrite(STDERR, "Usage: php api/tools_import_requests.php path/to/requests.csv\n");
    exit(1);
}

if (!is_file($csvPath)) {
    fwrite(STDERR, "File not found: {$csvPath}\n");
    exit(1);
}

$pdo = Database::connection();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$handle = fopen($csvPath, 'r');
if (!$handle) {
    fwrite(STDERR, "Unable to open {$csvPath}\n");
    exit(1);
}

$header = fgetcsv($handle);
if (!$header) {
    fwrite(STDERR, "CSV appears to be empty.\n");
    exit(1);
}

$columns = array_map('strtolower', $header);
$required = ['title','category','area','description','email'];
foreach ($required as $col) {
    if (!in_array($col, $columns, true)) {
        fwrite(STDERR, "Missing required column '{$col}'.\n");
        exit(1);
    }
}

$colIndex = array_flip($columns);
$userCache = [];
$inserted = 0;

while (($row = fgetcsv($handle)) !== false) {
    if (count($row) === 1 && trim($row[0]) === '') {
        continue;
    }

    $title = trim($row[$colIndex['title']] ?? '');
    $category = trim($row[$colIndex['category']] ?? '');
    $area = trim($row[$colIndex['area']] ?? '');
    $description = trim($row[$colIndex['description']] ?? '');
    $email = strtolower(trim($row[$colIndex['email']] ?? ''));
    $priority = isset($colIndex['priority']) ? trim($row[$colIndex['priority']]) : 'Medium';
    $status = isset($colIndex['status']) ? trim($row[$colIndex['status']]) : 'Pending';
    $created = isset($colIndex['created_at']) ? trim($row[$colIndex['created_at']]) : null;

    if (!$title || !$category || !$area || !$description || !$email) {
        fwrite(STDERR, "Skipping row with missing required fields.\n");
        continue;
    }

    if (!isset($userCache[$email])) {
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $userCache[$email] = $stmt->fetchColumn() ?: null;
    }
    $userId = $userCache[$email];
    if (!$userId) {
        fwrite(STDERR, "Skipping row: no user for {$email}.\n");
        continue;
    }

    $departmentId = resolveDepartmentId($pdo, $category);

    $insert = $pdo->prepare(
        'INSERT INTO requests (user_id, title, category, department_id, area, priority, description, status, created_at, updated_at)
         VALUES (:user_id, :title, :category, :department_id, :area, :priority, :description, :status, :created_at, :created_at)'
    );
    $createdAt = $created && strtotime($created) ? date('Y-m-d H:i:s', strtotime($created)) : date('Y-m-d H:i:s');

    $insert->execute([
        ':user_id' => $userId,
        ':title' => $title,
        ':category' => $category,
        ':department_id' => $departmentId,
        ':area' => $area,
        ':priority' => $priority ?: 'Medium',
        ':description' => $description,
        ':status' => in_array($status, ['Pending','In Progress','Completed','Rejected'], true) ? $status : 'Pending',
        ':created_at' => $createdAt,
    ]);

    $inserted++;
}

fclose($handle);
fwrite(STDOUT, "Imported {$inserted} request(s).\n");

function resolveDepartmentId(PDO $pdo, string $category): ?int
{
    if ($category === '') {
        return null;
    }
    $stmt = $pdo->prepare('SELECT department_id FROM category_department WHERE category = :category LIMIT 1');
    $stmt->execute([':category' => $category]);
    $id = $stmt->fetchColumn();
    return $id ? (int) $id : null;
}
