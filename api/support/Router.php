<?php

namespace App\Support;

use App\Support\Response;

final class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler, array $options = []): void
    {
        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'handler' => $handler,
            'auth' => $options['auth'] ?? false,
        ];
    }

    public function dispatch(string $method, string $uri, array $context = []): void
    {
        $method = strtoupper($method);
        $path = '/' . trim(parse_url($uri, PHP_URL_PATH) ?? '/', '/');
        if ($path === '//') {
            $path = '/';
        }

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }

            $pattern = '#^' . $route['pattern'] . '$#';
            if (!preg_match($pattern, $path, $matches)) {
                continue;
            }

            array_shift($matches);
            $handler = $route['handler'];
            $params = $matches;

            $request = $context;
            $request['method'] = $method;
            $request['path'] = $path;
            $request['params'] = $params;

            call_user_func($handler, $request);
            return;
        }

        Response::json(['error' => 'Not found'], 404);
    }
}
