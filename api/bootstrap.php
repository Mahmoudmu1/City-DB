<?php

use App\Config\Env;

spl_autoload_register(function ($class) {
    $prefix = 'App\\';
    $baseDir = __DIR__ . '/';
    if (str_starts_with($class, $prefix)) {
        $relative = substr($class, strlen($prefix));
        $path = $baseDir . str_replace('\\', '/', $relative) . '.php';
        if (file_exists($path)) {
            require_once $path;
        }
    }
});

Env::load(__DIR__ . '/.env');

date_default_timezone_set($_ENV['APP_TIMEZONE'] ?? 'UTC');
