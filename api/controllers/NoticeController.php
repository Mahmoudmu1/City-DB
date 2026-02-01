<?php

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Services\AuthService;
use App\Support\Request;
use App\Support\Response;
use PDO;

final class NoticeController
{
    public static function index(): void
    {
        $token = Request::bearerToken();
        $user = AuthService::userFromToken($token);
        $audience = 'guests';
        if ($user) {
            $audience = $user['role'] === 'admin' ? null : 'residents';
        }

        $pdo = Database::connection();
        $sql = 'SELECT id, type, title, message, audience, start_at, end_at, active
                FROM notices';
        $params = [];
        if ($audience) {
            $sql .= ' WHERE audience IN (:audience, \'all\') AND active = 1';
            $params[':audience'] = $audience;
        }
        $sql .= ' ORDER BY created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        Response::success(['notices' => $rows]);
    }

    public static function store(): void
    {
        AuthMiddleware::requireAdmin();
        $input = Request::body();
        $type = $input['type'] ?? 'info';
        $title = trim($input['title'] ?? '');
        $message = trim($input['message'] ?? '');
        $audience = $input['audience'] ?? 'all';
        $start = $input['startAt'] ?? null;
        $end = $input['endAt'] ?? null;

        if (!$title || !$message) {
            Response::json(['error' => 'Title and message are required'], 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'INSERT INTO notices (type, title, message, audience, start_at, end_at, active, created_at, updated_at)
             VALUES (:type, :title, :message, :audience, :start_at, :end_at, 1, NOW(), NOW())'
        );
        $stmt->execute([
            ':type' => $type,
            ':title' => $title,
            ':message' => $message,
            ':audience' => $audience,
            ':start_at' => $start,
            ':end_at' => $end,
        ]);

        Response::success(['message' => 'Notice published'], 201);
    }

    public static function toggle(array $context): void
    {
        AuthMiddleware::requireAdmin();
        $id = $context['params'][0] ?? null;
        if (!$id) {
            Response::json(['error' => 'Notice id missing'], 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('UPDATE notices SET active = NOT active, updated_at = NOW() WHERE id = :id');
        $stmt->execute([':id' => $id]);

        Response::success(['message' => 'Notice updated']);
    }
}
