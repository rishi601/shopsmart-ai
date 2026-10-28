# ShopSmart AI

A full-stack commerce application built with Next.js, NestJS, PostgreSQL, Prisma, Redis, and Razorpay checkout.

## Start the complete stack

1. Install Docker Desktop and start it.
2. Copy `.env.example` to `.env` in this folder. Set `JWT_SECRET` to a random string of at least 32 characters. Add Razorpay test credentials to enable card/UPI checkout.
3. From this folder, run:

   ```sh
   docker compose up --build
   ```

The first startup creates PostgreSQL and Redis, applies Prisma migrations, and starts the API and storefront. Open `http://localhost:3000`; Swagger is at `http://localhost:3003/docs`.

To add the sample catalog and an optional administrator account, run:

```sh
docker compose exec backend npm run seed
```

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `ADMIN_NAME` in `.env` before seeding to create the first admin. The seed script never changes an existing admin password. Then sign in at the storefront and open `/admin`.

Run the backend unit suite and API integration suite with `npm test` and `npm run test:e2e` from `backend/`. These suites use Prisma mocks, so they do not require a running database.

Stop the containers with `docker compose down`. Add `-v` only if you intentionally want to remove the local PostgreSQL and Redis data volumes.

## Run without Docker

- Start PostgreSQL and Redis locally.
- In `backend`, create `.env` with `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `FRONTEND_URL`, and optional Razorpay credentials.
- Run `npm ci`, `npm exec prisma migrate deploy`, `npm run seed` (optional), and `npm run start:dev` in `backend`.
- In `frontend`, set `NEXT_PUBLIC_API_URL=http://localhost:3003`, run `npm ci`, then `npm run dev`.

The API listens on port 3003 by default. The Next.js storefront listens on port 3000.
Set `DATABASE_URL` to the local PostgreSQL host when using this workflow; the Docker Compose sample URL uses the `postgres` service name. If you change the Compose PostgreSQL password, update both `POSTGRES_PASSWORD` and the password in `DATABASE_URL`.

## Main capabilities

- Customer registration, login, short-lived signed access tokens, and rotating refresh tokens held in an HTTP-only cookie.
- Product search, category filtering, sorting, pagination, images, variants, stock checks, and detailed product records.
- Server-backed carts, wishlists, delivery addresses, order history, and checkout with transactional inventory updates.
- Razorpay order creation and signature verification. Use test keys for local checkout; payment configuration is required.
- Hybrid recommendations using product content, customer interactions, similar-user interactions, stock-aware cold-start fallbacks, trending products, and frequently-bought-together suggestions.
- Admin product and inventory management, categories, brands, orders, customers, coupons, review moderation, revenue summaries, and low-stock alerts.
- Redis cache for frequently read catalog results, with an in-process fallback when Redis is unavailable.
- Swagger UI at `/docs`, Prisma migrations, and Docker Compose for local services.

## API overview

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /products`, `GET /products/catalog`, `GET /products/:id`, `GET /products/trending`
- `GET /recommendations`, authenticated `GET /recommendations/me`
- Authenticated `/cart`, `/wishlist`, `/addresses`, `/orders`, `/reviews`, `/events`
- Admin routes under `/admin` (administrator bearer token required)

See Swagger for request and response details.

## Project layout

- `frontend/` Next.js storefront and administrator workspace
- `backend/` NestJS REST API, Prisma schema, migrations, and seed data
- `docker-compose.yml` PostgreSQL, Redis, API, and storefront services

## Operational notes

Razorpay credentials are intentionally optional. Without them, accounts, catalog, recommendations, carts, addresses, and order creation work, while the payment endpoint reports that the provider is not configured. Use a strong unique `JWT_SECRET` for any shared or deployed environment. PostgreSQL and Redis data live in Docker volumes.
