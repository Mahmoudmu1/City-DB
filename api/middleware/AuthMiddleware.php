<?php

namespace App\Middleware;

use App\Services\AuthService;
use App\Support\Request;
use App\Support\Response;

final class AuthMiddleware
{
    public static function requireUser(): array
    {
        $token = Request::bearerToken();
        $user = AuthService::userFromToken($token);
        if (!$user) {
            Response::json(['error' => 'Unauthorized'], 401);
        }
        return $user;
    }

    public static function requireAdmin(): array
    {
        $user = self::requireUser();
        if (($user['role'] ?? '') !== 'admin') {
            Response::json(['error' => 'Forbidden'], 403);
        }
        return $user;
    }
}
