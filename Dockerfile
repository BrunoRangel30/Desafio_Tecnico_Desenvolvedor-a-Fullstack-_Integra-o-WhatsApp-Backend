# --------------------------
# Etapa de build
# --------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar apenas arquivos de dependência
COPY package*.json ./

# Instalar dependências completas (produção + dev)
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copiar todo o código
COPY . .

# Rodar build (NestJS, Next.js, etc.)
RUN npm run build


# --------------------------
# Etapa final (runner)
# --------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Copiar apenas arquivos de dependência
COPY package*.json ./

# Instalar apenas dependências de produção (inclui prisma client)
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

# Copiar dist e prisma do builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Porta padrão (ajuste se necessário)
EXPOSE 3000

# Rodar migrations antes de iniciar
CMD npx prisma migrate deploy && npm start
