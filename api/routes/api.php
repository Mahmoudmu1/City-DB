<?php

use App\Controllers\AnalyticsController;
use App\Controllers\AuthController;
use App\Controllers\FeedbackController;
use App\Controllers\DepartmentController;
use App\Controllers\NotificationController;
use App\Controllers\NoticeController;
use App\Controllers\RequestController;
use App\Middleware\AuthMiddleware;
use App\Services\AuthService;
use App\Support\Request as HttpRequest;
use App\Support\Router;
use App\Support\Response;

$router = new Router();

// Auth
$router->add('POST', '/auth/register', fn () => AuthController::register());
$router->add('POST', '/auth/login', fn () => AuthController::login());
$router->add('POST', '/auth/logout', fn () => AuthController::logout());
$router->add('GET', '/auth/me', fn () => AuthController::me());
$router->add('PATCH', '/auth/profile', fn () => AuthController::updateProfile());
$router->add('DELETE', '/auth/profile', fn () => AuthController::destroyAccount());

// Requests
$router->add('GET', '/requests', fn () => RequestController::index());
$router->add('POST', '/requests', fn () => RequestController::store());
$router->add('PATCH', '/requests/([0-9]+)', fn ($ctx) => RequestController::updateStatus($ctx));
$router->add('GET', '/admin/requests/export', fn () => RequestController::exportCsv());

// Notices
$router->add('GET', '/notices', fn () => NoticeController::index());
$router->add('POST', '/notices', fn () => NoticeController::store());
$router->add('PATCH', '/notices/([0-9]+)', fn ($ctx) => NoticeController::toggle($ctx));

// Analytics
$router->add('GET', '/analytics/kpi', fn () => AnalyticsController::kpi());
$router->add('GET', '/public/kpi', fn () => AnalyticsController::publicKpi());
$router->add('GET', '/analytics/categories', fn () => AnalyticsController::categories());
$router->add('GET', '/analytics/areas', fn () => AnalyticsController::areas());
$router->add('GET', '/analytics/response-times', fn () => AnalyticsController::responseTimes());
$router->add('GET', '/analytics/channels', fn () => AnalyticsController::channels());

// Feedback
$router->add('POST', '/feedback', fn () => FeedbackController::store());
$router->add('POST', '/public/contact', fn () => FeedbackController::storePublic());
$router->add('GET', '/feedback/latest', fn () => FeedbackController::latest());
$router->add('GET', '/feedback/public', fn () => FeedbackController::publicList());
$router->add('GET', '/analytics/feedback', fn () => FeedbackController::summary());

// Departments
$router->add('GET', '/departments', fn () => DepartmentController::index());

// Notifications
$router->add('GET', '/notifications', fn () => NotificationController::index());
$router->add('POST', '/notifications/read-all', fn () => NotificationController::markAllRead());

return $router;
