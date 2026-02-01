<?php

namespace App\Support;

final class Request
{
    public static function body(): array
    {
        $content = file_get_contents('php://input') ?: '';
        $data = json_decode($content, true);
        return is_array($data) ? $data : [];
    }

    public static function headers(): array
    {
        if (function_exists('getallheaders')) {
            return getallheaders() ?: [];
        }

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
                $headers[$name] = $value;
            }
        }
        return $headers;
    }

    public static function bearerToken(): ?string
    {
        $headers = self::headers();
        if (!empty($headers['Authorization']) && preg_match('/Bearer\s+(.+)/i', $headers['Authorization'], $matches)) {
            return trim($matches[1]);
        }
        return null;
    }
}
