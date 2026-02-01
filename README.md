# City-DB · Online City Service Dashboard

Two-sided web app for Majlis Daerah Kubang Pasu (MDKP) residents and administrators. The front-end is plain HTML/JS styled with Bootstrap 5 and Chart.js; the back-end is a lightweight PHP 8 REST API with MySQL storage.

## Highlights
- Resident portal: sign up/login, submit service requests with photos, track status timeline, see ETAs, manage profile/delete account, and read merged alerts + request updates in the notifications page.
- Admin portal: authenticate, review/update requests (status, department, ETA), publish notices, download CSVs, view analytics (KPI, category/area/channel breakdowns, response times), and browse feedback.
- Shared UX: themed landing page, gradient shell, light/dark toggle, multilingual stub (EN/BM), consistent cards/footers across auth and dashboards, and “Service Alerts” surfaced on both the homepage hero and resident dashboard.
- Notifications: notices + per-request events merged in localStorage with createdAt/updatedAt tracking, consistent read/dismiss state across tabs, friendly relative timestamps.
- Assets & uploads: request photos stored under `uploads/requests` (created on demand, must be writable).

## Project Structure
- `index.html`, `styles.css`, `app.js` – Landing page, global theme, and shared JS (theme toggle, API base).
- `Resident/` – Login, signup, dashboard, notifications, profile, feedback + `resident.js`, `profile.js`, `feedback.js`.
- `Admin/` – Login, dashboard UI + `admin.js`, `admin-auth.js`.
- `api/` – Framework-free PHP REST API (controllers, middleware, services, router, migrations, public entrypoint, CSV import tool).
- `uploads/` – User-uploaded request photos (keep writable).
- `Assets/` – Static images/illustrations.

## Requirements
- PHP 8.1+ with PDO (MySQL/MariaDB) and file uploads enabled.
- MySQL/MariaDB database.
- Any static file server for the front-end (PHP’s built-in server is fine).

## Backend Setup (PHP API)
1. Create `api/.env` (same dir as `bootstrap.php`):
   ```
   APP_TIMEZONE=UTC
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=city_db
   DB_USERNAME=root
   DB_PASSWORD=secret
   TOKEN_TTL_DAYS=7
   ```
2. Run migrations in order (001, 002, …). Example:
   ```bash
   for f in api/database/migrations/*.sql; do mysql -u root -p city_db < "$f"; done
   ```
3. Seed an admin account (passwords are bcrypt hashed). Either:
   - Generate a hash: `php generate_hash.php` then
   - Insert: `INSERT INTO users (first_name,last_name,email,password,address,role,created_at,updated_at) VALUES ('Site','Admin','admin@city.local','<HASH>', '', 'admin', NOW(), NOW());`
4. Serve the API (from repo root): `php -S localhost:8001 -t api/public`

## Front-end Setup
1. Serve the static site from the project root (keeps relative assets working):
   ```bash
   php -S localhost:8000
   ```
2. Point the front-end to your API. At the top of each HTML page you’ll see:
   ```html
   <script>window.__CITY_API_BASE__ = '/City-DB/api/public/index.php';</script>
   ```
   - If front-end runs at `http://localhost:8000` and API at `http://localhost:8001`, change that value to `http://localhost:8001/index.php`.
   - When deploying under a subfolder (e.g., XAMPP `htdocs/City-DB`), leave the bundled path as-is.
3. Visit `http://localhost:8000/index.html`, log in as resident/admin, and exercise dashboards/notifications.

## API Overview
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/profile`, `DELETE /auth/account`
- Requests: `GET /requests`, `POST /requests` (file upload supported), `PATCH /requests/{id}`
- Notices & Notifications: `GET/POST/PATCH /notices`, `GET /notifications`
- Analytics: `/analytics/kpi`, `/analytics/categories`, `/analytics/areas`
- Feedback: `POST /feedback`, plus admin feedback analytics
- Departments: `GET /departments`
- Router entrypoint: `api/public/index.php` (bearer tokens stored in `sessions`, TTL configurable via `TOKEN_TTL_DAYS`)

## Data Import
Load CSV data into `requests` via the CLI helper:
```bash
php api/tools_import_requests.php path/to/municipal_requests.csv
```
Expected columns: `title,category,area,description,email` with optional `priority,status,created_at`.

## Deployment Notes
- Keep `uploads/requests` writable by the web server user.
- Ensure PHP `fileinfo` extension is enabled for MIME checks.
- If using HTTPS + a different host, update `window.__CITY_API_BASE__` accordingly; the front-end uses relative fetch paths only via that variable.

## License
No explicit license provided; treat as private/internal unless the owner states otherwise.

