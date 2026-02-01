<?php

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Support\Response;

final class DepartmentController
{
    public static function index(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();
        $stmt = $pdo->query('SELECT id, name, email FROM departments ORDER BY name ASC');
        $rows = $stmt->fetchAll();
        $departments = array_map(fn($row) => [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
        ], $rows);

        Response::success(['departments' => $departments]);
    }
}
