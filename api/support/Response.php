<?php

namespace App\Support;

final class Response
{
    public static function json(array $payload, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json');
        echo json_encode($payload);
        exit;
    }

    public static function success(array $payload = [], int $status = 200): void
    {
        self::json(['data' => $payload], $status);
    }
}
