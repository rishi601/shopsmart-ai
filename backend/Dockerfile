FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig*.json nest-cli.json ./
COPY seed-products.ts ./
RUN npx prisma generate --schema prisma/schema.prisma
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY seed-products.ts ./
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN npx prisma generate --schema prisma/schema.prisma
COPY --from=build /app/dist ./dist
EXPOSE 3003
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
