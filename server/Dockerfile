# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create directory for audio/video uploads
RUN mkdir -p uploads/recordings prisma

ENV PORT=5000
ENV DATABASE_URL="file:/app/prisma/dev.db"
ENV RECORDINGS_DIR="/app/uploads/recordings"
ENV JWT_SECRET="arabic_lab_super_secret_jwt_key_2026"
ENV CLIENT_ORIGIN="*"

EXPOSE 5000

# Push DB schema, run seed, and start server
CMD ["sh", "-c", "npx prisma db push && node dist/seed.js && node dist/server.js"]
