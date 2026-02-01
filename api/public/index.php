<?php

require_once __DIR__ . '/../bootstrap.php';

use App\Support\Request as HttpRequest;
use App\Support\Response;

$router = require __DIR__ . '/../routes/api.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$pathInfo = $_SERVER['PATH_INFO'] ?? null;
if (is_string($pathInfo) && $pathInfo !== '') {
    // When Apache serves index.php/... PATH_INFO already contains the clean route.
    $path = '/' . ltrim($pathInfo, '/');
} else {
    // Fallback: derive path from REQUEST_URI (needed for setups using /api/* without PATH_INFO).
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH) ?? '/';

    if (str_starts_with($path, '/api/')) {
        $path = substr($path, 4);
        $path = '/' . ltrim($path, '/');
    } elseif ($path === '/api') {
        $path = '/';
    }
}

$router->dispatch($method, $path);