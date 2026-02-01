<?php

namespace App\Services;

use App\Config\Database;
use PDO;

final class AuthService
{
    public static function issueToken(int $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $ttlDays = (int)($_ENV['TOKEN_TTL_DAYS'] ?? $_SERVER['TOKEN_TTL_DAYS'] ?? 7);
        $expires = (new \DateTimeImmutable())->modify("+{$ttlDays} days")->format('Y-m-d H:i:s');

        $pdo = Database::connection();
        $stmt = $pdo->prepare('INSERT INTO sessions (user_id, token, expires_at, created_at) VALUES (:uid, :token, :expires, NOW())');
        $stmt->execute([
            ':uid' => $userId,
            ':token' => $token,
            ':expires' => $expires,
        ]);

        return $token;
    }

    public static function invalidateToken(string $token): void
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare('DELETE FROM sessions WHERE token = :token');
        $stmt->execute([':token' => $token]);
    }

    public static function userFromToken(?string $token): ?array
    {
        if (!$token) {
            return null;
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT users.id, users.email, users.first_name, users.last_name, users.address, users.role
             FROM sessions
             INNER JOIN users ON users.id = sessions.user_id
             WHERE sessions.token = :token AND sessions.expires_at > NOW()'
        );
        $stmt->execute([':token' => $token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            return null;
        }

        return $user;
    }
}
