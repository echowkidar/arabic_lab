# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL required by Prisma engine
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app

# Install OpenSSL in production image
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/downloads ./downloads

# Create directories for audio/video recordings, downloads, and database
RUN mkdir -p uploads/recordings prisma downloads

ENV PORT=5000
ENV DATABASE_URL="file:/app/prisma/dev.db"
ENV RECORDINGS_DIR="/app/uploads/recordings"
ENV JWT_SECRET="arabic_lab_super_secret_jwt_key_2026"
ENV CLIENT_ORIGIN="*"

EXPOSE 5000

# Push DB schema, seed users if needed, and start server
CMD ["sh", "-c", "npx prisma db push && node dist/seed.js && node dist/server.js"]
