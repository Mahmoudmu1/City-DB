<?php

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Services\AuthService;
use App\Support\Request;
use App\Support\Response;
use PDO;

final class AuthController
{
    public static function register(): void
    {
        $input = Request::body();
        $first = trim($input['firstName'] ?? '');
        $last = trim($input['lastName'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        $address = trim($input['address'] ?? '');

        if (!$first || !$last || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6) {
            Response::json(['error' => 'Invalid registration data'], 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        if ($stmt->fetchColumn()) {
            Response::json(['error' => 'Email already registered'], 409);
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare(
            'INSERT INTO users (first_name, last_name, email, password, address, role, created_at, updated_at)
             VALUES (:first, :last, :email, :password, :address, :role, NOW(), NOW())'
        );
        $stmt->execute([
            ':first' => $first,
            ':last' => $last,
            ':email' => $email,
            ':password' => $hash,
            ':address' => $address,
            ':role' => 'resident',
        ]);

        Response::success(['message' => 'Account created'], 201);
    }

    public static function login(): void
    {
        $input = Request::body();
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
            Response::json(['error' => 'Invalid credentials'], 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT id, email, first_name, last_name, address, password, role FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !password_verify($password, $user['password'])) {
            Response::json(['error' => 'Invalid credentials'], 401);
        }

        $token = AuthService::issueToken((int)$user['id']);

        Response::success([
            'token' => $token,
            'user' => [
                'id' => (int)$user['id'],
                'email' => $user['email'],
                'firstName' => $user['first_name'],
                'lastName' => $user['last_name'],
                'role' => $user['role'],
                'address' => $user['address'] ?? '',
            ],
        ]);
    }

    public static function logout(): void
    {
        $token = Request::bearerToken();
        if ($token) {
            AuthService::invalidateToken($token);
        }
        Response::success(['message' => 'Logged out']);
    }

    public static function me(): void
    {
        $user = AuthMiddleware::requireUser();
        Response::success([
            'id' => $user['id'],
            'email' => $user['email'],
            'firstName' => $user['first_name'] ?? $user['firstName'] ?? '',
            'lastName' => $user['last_name'] ?? $user['lastName'] ?? '',
            'address' => $user['address'] ?? '',
            'role' => $user['role'],
        ]);
    }

    public static function updateProfile(): void
    {
        $user = AuthMiddleware::requireUser();
        $input = Request::body();

        $first = trim($input['firstName'] ?? '');
        $last = trim($input['lastName'] ?? '');
        $address = trim($input['address'] ?? '');
        $currentPassword = $input['currentPassword'] ?? '';
        $newPassword = $input['newPassword'] ?? '';

        if (!$first || !$last) {
            Response::json(['error' => 'Name is required'], 422);
        }

        $pdo = Database::connection();

        if ($newPassword !== '') {
            if (strlen($newPassword) < 6) {
                Response::json(['error' => 'Password must be at least 6 characters'], 422);
            }
            $stmt = $pdo->prepare('SELECT password FROM users WHERE id = :id');
            $stmt->execute([':id' => $user['id']]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row || !password_verify($currentPassword, $row['password'])) {
                Response::json(['error' => 'Current password is incorrect'], 403);
            }
            $hash = password_hash($newPassword, PASSWORD_DEFAULT);
            $pdo->prepare('UPDATE users SET password = :password WHERE id = :id')
                ->execute([':password' => $hash, ':id' => $user['id']]);
        }

        $stmt = $pdo->prepare('UPDATE users SET first_name = :first, last_name = :last, address = :address WHERE id = :id');
        $stmt->execute([
            ':first' => $first,
            ':last' => $last,
            ':address' => $address,
            ':id' => $user['id'],
        ]);

        Response::success(['message' => 'Profile updated']);
    }

    public static function destroyAccount(): void
    {
        $user = AuthMiddleware::requireUser();
        $input = Request::body();
        $currentPassword = $input['currentPassword'] ?? '';
        if ($currentPassword === '') {
            Response::json(['error' => 'Current password required'], 422);
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT password FROM users WHERE id = :id');
        $stmt->execute([':id' => $user['id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || !password_verify($currentPassword, $row['password'])) {
            Response::json(['error' => 'Current password is incorrect'], 403);
        }

        $pdo->prepare('DELETE FROM users WHERE id = :id')->execute([':id' => $user['id']]);
        Response::success(['message' => 'Account deleted']);
    }
}
