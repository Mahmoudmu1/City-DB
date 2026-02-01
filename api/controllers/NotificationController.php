<?php

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Support\Request;
use App\Support\Response;
use PDO;

final class NotificationController
{
    public static function index(): void
    {
        $user = AuthMiddleware::requireUser();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, request_id, type, payload, read_at, created_at
             FROM notifications
             WHERE user_id = :uid
             ORDER BY created_at DESC'
        );
        $stmt->execute([':uid' => $user['id']]);
        $rows = array_map(function ($row) {
            $payload = json_decode($row['payload'] ?? '{}', true) ?: [];
            return [
                'id' => (int)$row['id'],
                'requestId' => $row['request_id'],
                'type' => $row['type'],
                'payload' => $payload,
                'readAt' => $row['read_at'],
                'createdAt' => $row['created_at'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));

        Response::success(['notifications' => $rows]);
    }

    public static function markAllRead(): void
    {
        $user = AuthMiddleware::requireUser();
        $pdo = Database::connection();
        $stmt = $pdo->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = :uid AND read_at IS NULL');
        $stmt->execute([':uid' => $user['id']]);
        Response::success(['message' => 'Notifications marked as read']);
    }
}
