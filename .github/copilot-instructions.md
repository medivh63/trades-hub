# TradeHub Copilot Instructions

## Project Overview
TradeHub is a **Rust-based marketplace for licensed tradespeople** (electricians, plumbers, etc.) - think vertical Craigslist for professionals. The stack is **Axum (web framework) + Askama (server-side templates) + SQLx + SQLite + HTMX + Tailwind CSS**.

This is an **SSR-first (Server-Side Rendered) application** with minimal JavaScript - HTMX handles dynamic interactions by swapping HTML fragments.

## Architecture & Data Flow

### Core Components
- **`src/main.rs`**: Entry point. Sets up Axum server with tracing, runs SQLx migrations, merges routes at startup
- **`src/db.rs`**: SQLite connection pool initialization. Database URL from `DATABASE_URL` env var (defaults to `sqlite://tradehub.db`)
- **`src/routes/mod.rs`**: Route definitions. Currently has `public_routes()` function returning an Axum `Router<Db>` with state
- **`migrations/`**: SQLx migrations run automatically on startup via `sqlx::migrate!("./migrations")`

### Database Schema (see `migrations/0001_init.sql`)
- **users** → **pro_profiles** (1:1): Professionals have profiles with trade category, hourly rate, verification status
- **listings**: Job posts/service offerings. Has `pro_only` flag and `is_active` status
- **listings_fts** (FTS5): Full-text search virtual table with triggers to sync with `listings` table
- **bookings**: Connect clients to pros for a listing. Status flow: `pending` → `accepted` → `completed`/`cancelled`
- **messages**: Chat within booking context
- **licenses**: Upload and verification workflow (status: `pending`, etc.)

### Request Flow
1. Axum routes in `routes/mod.rs` receive requests with `State(Db)` extractor
2. Handlers use `sqlx::query!()` macro for compile-time checked SQL
3. Askama templates in `src/templates/` render HTML (extends `layout.html`)
4. HTMX attributes (`hx-get`, `hx-target`) handle dynamic updates without page reloads

## Development Workflows

### Setup & Running
```bash
# Install SQLx CLI (needed for migrations and compile-time verification)
cargo install sqlx-cli --no-default-features --features sqlite

# Copy environment config
cp .env.example .env

# Create database and run migrations
sqlx database create
sqlx migrate run

# Run dev server (with auto-reload on save, install cargo-watch)
cargo watch -x run
# OR standard run
cargo run
```

Server runs on `http://localhost:8080` by default.

### Adding New Routes
1. Add handler function in `src/routes/mod.rs` (or new module under `routes/`)
2. Use `State(db): State<Db>` to access database pool
3. Return either:
   - `impl IntoResponse` for Askama templates (use `#[derive(Template)]` structs)
   - `Html<String>` for HTMX fragment responses (like `/search` endpoint)
4. Register route in `public_routes()` function

### Database Queries
- **Always use `sqlx::query!()` macro** for compile-time SQL verification
- Return type uses anonymous structs with fields matching SELECT columns
- For INSERT/UPDATE/DELETE, use `sqlx::query!()` then `.execute(&db).await?`
- **FTS5 Search Pattern**: Join `listings_fts` MATCH results with main `listings` table on `rowid = id`, order by `rank`

### Templates (Askama)
- **Base template**: `src/templates/layout.html` with `{% block title %}` and `{% block content %}`
- Create new `.html` files in `src/templates/` (or subdirectories like `auth/`, `listings/`)
- Template structs must derive `Template` with `#[template(path = "filename.html")]`
- Pass struct fields to template via `{{ field_name }}` syntax

### HTMX Conventions
- Forms/links use `hx-get` or `hx-post` to request HTML fragments
- Target element specified with `hx-target="#results"` (CSS selector)
- Swap strategy with `hx-swap="innerHTML"` (default)
- See `/search` endpoint in `routes/mod.rs` for example: returns raw HTML string wrapped in `Html(...)`

## Project-Specific Patterns

### Error Handling
- Use `anyhow::Result<()>` in `main()` and `anyhow::Result<T>` for fallible functions
- In route handlers, use `.unwrap_or_default()` for queries that may return empty results (see `search()` handler)

### Authentication (Planned)
- Database has `users.role` enum: `user`, `pro`, `admin`
- Password storage uses `argon2` crate (already in deps)
- Session management likely via `tower-cookies` (already in deps)
- Auth routes should go in `src/routes/` (empty `templates/auth/` directory exists)

### Static Assets
- `src/static/tailwind.css` served at `/static/tailwind.css`
- HTMX loaded from CDN in `layout.html`
- No asset bundler - keep it simple with CDN + static files

### Verification Workflow
- `pro_profiles.is_verified` indicates admin approval
- `licenses.status` tracks approval state (default: `pending`)
- Admin routes (future) should check `users.role = 'admin'`

## Key Files to Reference
- **`src/routes/mod.rs`**: Example of Askama template usage and HTMX fragment response
- **`migrations/0001_init.sql`**: Complete schema with foreign keys and check constraints
- **`migrations/0002_fts5.sql`**: FTS5 table setup with automatic sync triggers
- **`src/templates/layout.html`**: Base template structure with HTMX script tag

## Common Gotchas
- SQLx requires `.env` file with `DATABASE_URL` for compile-time query verification
- Migrations run automatically on server start - no need to call manually after initial setup
- HTMX responses must be plain HTML fragments (not full pages) when using `hx-target`
- SQLite `PRAGMA foreign_keys = ON` is set in migrations to enforce referential integrity
