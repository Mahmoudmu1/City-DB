<?php

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Support\Request;
use App\Support\Response;
use PDO;

final class RequestController
{
    public static function index(): void
    {
        $user = AuthMiddleware::requireUser();
        $pdo = Database::connection();

        [$conditions, $params] = self::buildFilters($user);
        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $sql = "
            SELECT requests.id, requests.title, requests.channel, requests.category, requests.department_id, departments.name AS department_name,
                   requests.area, requests.priority, requests.description, requests.status, requests.estimated_completion_at,
                   requests.photo_path, requests.created_at, requests.updated_at, users.email
            FROM requests
            INNER JOIN users ON users.id = requests.user_id
            LEFT JOIN departments ON departments.id = requests.department_id
            {$where}
            ORDER BY requests.created_at DESC
        ";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $requestIds = array_column($rows, 'id');
        $timelines = [];
        if (!empty($requestIds)) {
            $placeholders = implode(',', array_fill(0, count($requestIds), '?'));
            $timelineStmt = $pdo->prepare(
                "SELECT request_updates.request_id, request_updates.status, request_updates.note, request_updates.created_at,
                        users.first_name, users.last_name
                 FROM request_updates
                 LEFT JOIN users ON users.id = request_updates.updated_by
                 WHERE request_updates.request_id IN ({$placeholders})
                 ORDER BY request_updates.created_at ASC"
            );
            $timelineStmt->execute($requestIds);
            foreach ($timelineStmt->fetchAll(PDO::FETCH_ASSOC) as $entry) {
                $timelines[$entry['request_id']][] = [
                    'status' => $entry['status'],
                    'note' => $entry['note'],
                    'created_at' => $entry['created_at'],
                    'actor' => trim(($entry['first_name'] ?? '') . ' ' . ($entry['last_name'] ?? '')),
                ];
            }
        }

        foreach ($rows as &$row) {
            $timeline = $timelines[$row['id']] ?? [];
            array_unshift($timeline, [
                'status' => 'Created',
                'note' => null,
                'created_at' => $row['created_at'],
                'actor' => $row['email'] ?? '',
            ]);
            $row['timeline'] = $timeline;
        }
        unset($row);

        Response::success(['requests' => $rows]);
    }

    public static function store(): void
    {
        $user = AuthMiddleware::requireUser();
        $input = $_POST;
        if (empty($input)) {
            $input = Request::body();
        }

        $title = trim($input['title'] ?? '');
        $channel = trim($input['channel'] ?? 'web');
        $category = trim($input['category'] ?? '');
        $area = trim($input['area'] ?? '');
        $priority = trim($input['priority'] ?? 'Medium');
        $description = trim($input['description'] ?? '');
        $photoPath = null;

        if (!$title || !$category || !$area || !$description) {
            Response::json(['error' => 'Missing required fields'], 422);
        }

        if (!empty($_FILES['photo']) && ($_FILES['photo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $photoPath = self::handlePhotoUpload($_FILES['photo']);
        }

        $pdo = Database::connection();
        $departmentId = self::resolveDepartmentId($pdo, $category);

        $stmt = $pdo->prepare(
            'INSERT INTO requests (user_id, title, channel, category, department_id, area, priority, description, photo_path, status, created_at, updated_at)
             VALUES (:uid, :title, :channel, :category, :department_id, :area, :priority, :description, :photo_path, :status, NOW(), NOW())'
        );
        $stmt->execute([
            ':uid' => $user['id'],
            ':title' => $title,
            ':channel' => $channel ?: 'web',
            ':category' => $category,
            ':department_id' => $departmentId,
            ':area' => $area,
            ':priority' => $priority,
            ':description' => $description,
            ':photo_path' => $photoPath,
            ':status' => 'Pending',
        ]);

        Response::success(['message' => 'Request submitted'], 201);
    }

    public static function updateStatus(array $context): void
    {
        $admin = AuthMiddleware::requireAdmin();
        $input = Request::body();
        $requestId = $context['params'][0] ?? null;
        $status = $input['status'] ?? null;

        if (!$requestId || !in_array($status, ['Pending', 'In Progress', 'Completed', 'Rejected'], true)) {
            Response::json(['error' => 'Invalid payload'], 422);
        }

        $pdo = Database::connection();
        $pdo->beginTransaction();

        $stmt = $pdo->prepare('SELECT id, user_id, title, priority FROM requests WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $requestId]);
        $req = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$req) {
            $pdo->rollBack();
            Response::json(['error' => 'Request not found'], 404);
        }

        $eta = null;
        if ($status === 'In Progress') {
            $hours = match ($req['priority'] ?? 'Medium') {
                'High' => 24,
                'Low' => 72,
                default => 48,
            };
            $eta = (new \DateTimeImmutable())->modify("+{$hours} hours")->format('Y-m-d H:i:s');
        } elseif ($status === 'Completed') {
            $eta = (new \DateTimeImmutable())->format('Y-m-d H:i:s');
        }

        if ($status === 'Rejected' || $status === 'Pending') {
            $eta = null;
        }

        $stmt = $pdo->prepare('UPDATE requests SET status = :status, estimated_completion_at = :eta, updated_at = NOW() WHERE id = :id');
        $stmt->execute([':status' => $status, ':eta' => $eta, ':id' => $requestId]);

        $stmt = $pdo->prepare(
            'INSERT INTO request_updates (request_id, status, note, updated_by, created_at)
             VALUES (:request_id, :status, :note, :updated_by, NOW())'
        );
        $stmt->execute([
            ':request_id' => $requestId,
            ':status' => $status,
            ':note' => $input['note'] ?? null,
            ':updated_by' => $admin['id'],
        ]);

        $stmt = $pdo->prepare(
            'INSERT INTO notifications (user_id, request_id, type, payload, created_at)
             VALUES (:uid, :request_id, :type, :payload, NOW())'
        );
        $payload = json_encode([
            'title' => "{$req['title']} status updated",
            'message' => "Your request is now {$status}",
        ]);
        $stmt->execute([
            ':uid' => $req['user_id'],
            ':request_id' => $requestId,
            ':type' => 'request',
            ':payload' => $payload,
        ]);

        $pdo->commit();

        Response::success(['message' => 'Status updated']);
    }

    public static function exportCsv(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();
        [$conditions, $params] = self::buildFilters(['role' => 'admin']);
        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $stmt = $pdo->prepare(
            "
            SELECT requests.id, requests.title, requests.category, requests.department_id, departments.name AS department_name,
                   requests.area, requests.status, requests.priority, requests.channel, users.email, requests.created_at
            FROM requests
            INNER JOIN users ON users.id = requests.user_id
            LEFT JOIN departments ON departments.id = requests.department_id
            {$where}
            ORDER BY requests.created_at DESC
            "
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="requests.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, ['id', 'title', 'category', 'department', 'area', 'status', 'priority', 'channel', 'resident_email', 'created_at']);
        foreach ($rows as $row) {
            fputcsv($out, [
                $row['id'],
                $row['title'],
                $row['category'],
                $row['department_name'] ?? '',
                $row['area'],
                $row['status'],
                $row['priority'],
                $row['channel'],
                $row['email'],
                $row['created_at'],
            ]);
        }
        fclose($out);
        exit;
    }

    private static function resolveDepartmentId(PDO $pdo, string $category): ?int
    {
        if ($category === '') {
            return null;
        }
        $stmt = $pdo->prepare('SELECT department_id FROM category_department WHERE category = :category LIMIT 1');
        $stmt->execute([':category' => $category]);
        $id = $stmt->fetchColumn();
        if ($id) {
            return (int)$id;
        }

        // Fallback mapping for resident-facing category labels → departments.
        // Adjust this map if new categories are added.
        $normalized = strtolower(trim($category));
        $fallbackMap = [
            'waste' => 'Waste Management',
            'road & drainage' => 'Road Maintenance',
            'street lighting' => 'Public Lighting',
            'water' => 'Road Maintenance',
            'safety' => 'Road Maintenance',
            'others' => null,
        ];
        if (!array_key_exists($normalized, $fallbackMap)) {
            return null;
        }
        $deptName = $fallbackMap[$normalized];
        if ($deptName === null) {
            return null;
        }

        $deptStmt = $pdo->prepare('SELECT id FROM departments WHERE name = :name LIMIT 1');
        $deptStmt->execute([':name' => $deptName]);
        $deptId = $deptStmt->fetchColumn();
        return $deptId ? (int)$deptId : null;
    }

    private static function handlePhotoUpload(array $file): string
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            Response::json(['error' => 'Unable to upload photo'], 400);
        }

        $maxSize = 5 * 1024 * 1024; // 5MB
        if (($file['size'] ?? 0) > $maxSize) {
            Response::json(['error' => 'Photo too large (max 5MB)'], 422);
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']) ?: '';
        $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/jpg' => 'jpg'];
        if (!isset($allowed[$mime])) {
            Response::json(['error' => 'Invalid photo type'], 422);
        }

        $ext = $allowed[$mime];
        $uploadDir = dirname(__DIR__, 2) . '/uploads/requests';
        if (!is_dir($uploadDir)) {
            if (!mkdir($uploadDir, 0777, true)) {
                Response::json(['error' => 'Unable to create upload directory'], 500);
            }
        }

        if (!is_writable($uploadDir)) {
            Response::json(['error' => 'Upload directory is not writable'], 500);
        }

        $filename = uniqid('req_', true) . '.' . $ext;
        $targetPath = $uploadDir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            Response::json(['error' => 'Failed to save photo'], 500);
        }

        return 'uploads/requests/' . $filename;
    }

    private static function buildFilters(?array $user = null): array
    {
        $params = [];
        $conditions = [];

        if (($user['role'] ?? '') !== 'admin') {
            $conditions[] = 'requests.user_id = :uid';
            $params[':uid'] = $user['id'];
        }

        if (!empty($_GET['status'])) {
            $conditions[] = 'requests.status = :status';
            $params[':status'] = $_GET['status'];
        }

        if (!empty($_GET['channel'])) {
            $conditions[] = 'requests.channel = :channel';
            $params[':channel'] = $_GET['channel'];
        }

        if (!empty($_GET['department_id']) && ctype_digit((string)$_GET['department_id'])) {
            $conditions[] = 'requests.department_id = :dept';
            $params[':dept'] = (int)$_GET['department_id'];
        }

        if (!empty($_GET['search'])) {
            $conditions[] = '(requests.title LIKE :search OR requests.area LIKE :search OR users.email LIKE :search)';
            $params[':search'] = '%' . $_GET['search'] . '%';
        }

        if (!empty($_GET['start_date']) && self::isValidDate($_GET['start_date'])) {
            $conditions[] = 'requests.created_at >= :start_date';
            $params[':start_date'] = $_GET['start_date'] . ' 00:00:00';
        }

        if (!empty($_GET['end_date']) && self::isValidDate($_GET['end_date'])) {
            $conditions[] = 'requests.created_at <= :end_date';
            $params[':end_date'] = $_GET['end_date'] . ' 23:59:59';
        }

        return [$conditions, $params];
    }

    private static function isValidDate(string $date): bool
    {
        $d = \DateTime::createFromFormat('Y-m-d', $date);
        return $d && $d->format('Y-m-d') === $date;
    }
}
