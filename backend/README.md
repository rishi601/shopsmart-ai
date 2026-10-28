# ShopSmart API

The root [project README](../README.md) documents Docker startup and local development.

The API uses PostgreSQL through Prisma and optional Redis caching. Interactive API documentation is served at `/docs`. The database schema and migrations live in `prisma/`; `npm run seed` inserts the sample catalog and optionally creates an admin when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are configured.
