<?php

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Support\Request;
use App\Support\Response;

final class FeedbackController
{
    public static function store(): void
    {
        $user = AuthMiddleware::requireUser();
        $input = Request::body();

        $rating = (int)($input['rating'] ?? 0);
        $comments = trim($input['comments'] ?? '');
        $channel = $input['channel'] ?? 'dashboard';
        $category = strtolower(trim($input['category'] ?? 'general'));

        if ($rating < 1 || $rating > 5) {
            Response::json(['error' => 'Rating must be between 1 and 5'], 422);
        }

        $allowedCategories = ['overall', 'request', 'usability', 'communication', 'general'];
        if (!in_array($category, $allowedCategories, true)) {
            $category = 'general';
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'INSERT INTO feedback (user_id, rating, category, comments, channel, created_at)
             VALUES (:user_id, :rating, :category, :comments, :channel, NOW())'
        );
        $stmt->execute([
            ':user_id' => $user['id'],
            ':rating' => $rating,
            ':category' => $category,
            ':comments' => $comments,
            ':channel' => $channel,
        ]);

        Response::success(['message' => 'Feedback recorded'], 201);
    }

    public static function summary(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();

        $stats = $pdo->query('SELECT COUNT(*) AS total, ROUND(AVG(rating), 2) AS avg_rating FROM feedback')->fetch() ?: ['total' => 0, 'avg_rating' => null];
        $byCategoryStmt = $pdo->query('SELECT category, COUNT(*) AS total, ROUND(AVG(rating), 2) AS avg_rating FROM feedback GROUP BY category ORDER BY total DESC');
        $byCategory = [];
        foreach ($byCategoryStmt as $row) {
            $byCategory[] = [
                'category' => $row['category'],
                'total' => (int)$row['total'],
                'avg_rating' => $row['avg_rating'] !== null ? (float)$row['avg_rating'] : null,
            ];
        }

        Response::success([
            'total' => (int)($stats['total'] ?? 0),
            'average' => $stats['avg_rating'] !== null ? (float)$stats['avg_rating'] : null,
            'byCategory' => $byCategory,
        ]);
    }

    public static function latest(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT feedback.id, feedback.rating, feedback.category, feedback.comments, feedback.created_at,
                    users.first_name, users.last_name
             FROM feedback
             LEFT JOIN users ON users.id = feedback.user_id
             WHERE feedback.user_id IS NOT NULL
             ORDER BY feedback.created_at DESC
             LIMIT 6'
        );
        $stmt->execute();
        $rows = $stmt->fetchAll();

        $items = array_map(function ($row) {
            return [
                'id' => (int)$row['id'],
                'rating' => (int)$row['rating'],
                'category' => $row['category'],
                'comments' => $row['comments'],
                'created_at' => $row['created_at'],
                'author' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
            ];
        }, $rows);

        Response::success(['items' => $items]);
    }
    public static function storePublic(): void
    {
        $input = Request::body();

        $email = trim($input['email'] ?? '');
        $message = trim($input['message'] ?? '');
        $first = trim($input['firstName'] ?? '');
        $last = trim($input['lastName'] ?? '');

        if (!$email || !$message) {
            Response::json(['error' => 'Email and message are required'], 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'INSERT INTO feedback (user_id, first_name, last_name, email, message, comments, rating, category, channel, status, created_at)
             VALUES (NULL, :first_name, :last_name, :email, :message, :comments, NULL, :category, :channel, :status, NOW())'
        );

        $stmt->execute([
            ':first_name' => $first ?: null,
            ':last_name' => $last ?: null,
            ':email' => $email,
            ':message' => $message,
            ':comments' => $message,
            ':category' => 'contact',
            ':channel' => 'contact_form',
            ':status' => 'new',
        ]);

        Response::success(['success' => true]);
    }

    public static function publicList(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, first_name, last_name, email, message, status, created_at
             FROM feedback
             WHERE channel = :channel
             ORDER BY created_at DESC'
        );
        $stmt->execute([':channel' => 'contact_form']);
        $rows = $stmt->fetchAll();

        $items = array_map(static function ($row) {
            return [
                'id' => (int)$row['id'],
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'email' => $row['email'],
                'message' => $row['message'],
                'status' => $row['status'],
                'created_at' => $row['created_at'],
            ];
        }, $rows);

        Response::success(['items' => $items]);
    }

}
