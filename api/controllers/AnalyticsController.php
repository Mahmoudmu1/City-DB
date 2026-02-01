<?php

namespace App\Controllers;

use App\Config\Database;
use App\Middleware\AuthMiddleware;
use App\Support\Response;

final class AnalyticsController
{
    public static function kpi(): void
    {
        AuthMiddleware::requireAdmin();
        $row = self::kpiRow();
        Response::success($row);
    }

    public static function publicKpi(): void
    {
        // Public landing page KPI endpoint; no auth required.
        $row = self::kpiRow();
        Response::success($row);
    }

    private static function kpiRow(): array
    {
        $pdo = Database::connection();
        $stmt = $pdo->query(
            "SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
                SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected
             FROM requests"
        );
        $kpiRow = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];

        $stmtResidents = $pdo->prepare("
            SELECT COUNT(*) AS resident_count
            FROM users
            WHERE role = 'resident'
        ");
        $stmtResidents->execute();
        $residentRow = $stmtResidents->fetch(\PDO::FETCH_ASSOC) ?: [];
        $residentCount = (int)($residentRow['resident_count'] ?? 0);

        return [
            'total' => (int)($kpiRow['total'] ?? 0),
            'pending' => (int)($kpiRow['pending'] ?? 0),
            'in_progress' => (int)($kpiRow['in_progress'] ?? 0),
            'completed' => (int)($kpiRow['completed'] ?? 0),
            'rejected' => (int)($kpiRow['rejected'] ?? 0),
            'resident_count' => $residentCount,
        ];
    }

    public static function categories(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();
        $stmt = $pdo->query(
            "SELECT category, COUNT(*) as total
             FROM requests
             GROUP BY category
             ORDER BY total DESC"
        );
        Response::success(['series' => $stmt->fetchAll()]);
    }

    public static function areas(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();
        $stmt = $pdo->query(
            "SELECT area, COUNT(*) as total
             FROM requests
             GROUP BY area
             ORDER BY total DESC
             LIMIT 10"
        );
        Response::success(['series' => $stmt->fetchAll()]);
    }

    public static function responseTimes(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();

        $sql = "
            SELECT
                AVG(TIMESTAMPDIFF(HOUR, r.created_at, first_updates.first_time)) AS avg_first_response_hours,
                AVG(TIMESTAMPDIFF(HOUR, r.created_at, completed_updates.completed_time)) AS avg_resolution_hours
            FROM requests r
            LEFT JOIN (
                SELECT request_id, MIN(created_at) AS first_time
                FROM request_updates
                WHERE status IN ('In Progress', 'Completed')
                GROUP BY request_id
            ) AS first_updates ON first_updates.request_id = r.id
            LEFT JOIN (
                SELECT request_id, MIN(created_at) AS completed_time
                FROM request_updates
                WHERE status = 'Completed'
                GROUP BY request_id
            ) AS completed_updates ON completed_updates.request_id = r.id
        ";

        $row = $pdo->query($sql)->fetch() ?: [];
        $response = [
            'average_first_response' => $row['avg_first_response_hours'] !== null ? (float)$row['avg_first_response_hours'] : null,
            'average_resolution' => $row['avg_resolution_hours'] !== null ? (float)$row['avg_resolution_hours'] : null,
        ];

        Response::success($response);
    }

    public static function channels(): void
    {
        AuthMiddleware::requireAdmin();
        $pdo = Database::connection();
        $stmt = $pdo->query(
            "SELECT channel, COUNT(*) as total
             FROM requests
             GROUP BY channel
             ORDER BY total DESC"
        );
        $series = array_map(fn($row) => ['channel' => $row['channel'], 'total' => (int)$row['total']], $stmt->fetchAll());
        Response::success(['series' => $series]);
    }
}
