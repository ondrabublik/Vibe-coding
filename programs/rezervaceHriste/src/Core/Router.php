<?php
declare(strict_types=1);

namespace App\Core;

class Router
{
    private array $routes = [];

    public function get(string $path, callable|array $handler, array $middleware = []): void
    {
        $this->routes[] = ['GET', $path, $handler, $middleware];
    }

    public function post(string $path, callable|array $handler, array $middleware = []): void
    {
        $this->routes[] = ['POST', $path, $handler, $middleware];
    }

    public function dispatch(Request $request): void
    {
        $method = $request->method;
        $path   = rtrim($request->path, '/') ?: '/';

        foreach ($this->routes as [$routeMethod, $routePath, $handler, $middleware]) {
            if ($routeMethod !== $method) {
                continue;
            }
            $pattern = $this->toRegex($routePath);
            if (preg_match($pattern, $path, $matches)) {
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                foreach ($middleware as $mw) {
                    $mw($request);
                }
                if (is_array($handler)) {
                    [$class, $action] = $handler;
                    (new $class())->$action($request, $params);
                } else {
                    $handler($request, $params);
                }
                return;
            }
        }
        Response::notFound();
    }

    private function toRegex(string $path): string
    {
        $path = rtrim($path, '/') ?: '/';
        $pattern = preg_replace('/\{(\w+)\}/', '(?P<$1>[^/]+)', $path);
        return '#^' . $pattern . '$#u';
    }
}
