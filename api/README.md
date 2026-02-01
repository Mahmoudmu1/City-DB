## PHP API Scaffold

This directory hosts a lightweight REST API for the City Services dashboard.  
It is intentionally framework-free so it can run on any PHP 8+ host.

### Structure

- `bootstrap.php` – PSR-4 autoloader + environment loader.
- `config/` – `.env` parser and PDO connection factory.
- `controllers/` – Request handlers for auth, requests, notices, analytics, feedback.
- `middleware/` – Auth helpers (bearer tokens).
- `services/` – Stateless helpers, e.g. issuing tokens.
- `support/` – Router, Request, Response helpers.
- `database/migrations/` – SQL migrations for MySQL-compatible databases.
- `public/index.php` – Entry point (point your PHP server root here).
- `tools_import_requests.php` – CLI helper to import request data from CSV.

### Getting Started

1. Copy `.env.example` to `.env` and update DB credentials.
2. Run the SQL files inside `database/migrations` on your database **in order**.
3. Configure your web server (e.g., Apache in XAMPP/MAMP) to expose `City-DB/api/public` – when the project is copied to `htdocs`, the API will be reachable at `http://localhost/City-DB/api/public`.
4. The front-end already calls `/City-DB/api/public/...` endpoints, including `Authorization: Bearer <token>` on protected requests.

### Importing municipal data

Use the CLI helper to load real or sample records into the `requests` table. The CSV must contain the columns `title,category,area,description,email` with optional `priority,status,created_at`.

```
php api/tools_import_requests.php path/to/municipal_requests.csv
```

Each row is inserted for the user referenced by `email`. Categories are mapped to departments using the `category_department` table.

### Available Endpoints

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /requests`, `POST /requests`, `PATCH /requests/{id}`
- `GET /notices`, `POST /notices`, `PATCH /notices/{id}`
- `GET /analytics/kpi`, `/analytics/categories`, `/analytics/areas`
- `POST /feedback`

All responses are JSON. When running locally alongside the static site, mount the API under `/api` (e.g., via nginx/apache rewrite or Vite proxy) so the front-end fetch paths continue to work.
