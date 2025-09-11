FROM node:20-alpine AS builder

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependência
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências (incluindo dev para build)
RUN npm install

# Copiar restante do código
COPY . .

# Build da aplicação
RUN npm run build


# ==============================
# Final image
# ==============================
FROM node:20-alpine

WORKDIR /app

# Copiar apenas os artefatos necessários
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Rodar migrações e iniciar app
CMD ["npm", "run", "start:migrate:prod"]
