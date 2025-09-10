# Use a imagem oficial do Node.js
FROM node:20-alpine

# Defina o diretório de trabalho no contêiner
WORKDIR /usr/src/app

# Copie os arquivos de dependências
COPY package*.json ./

# Instale dependências
RUN npm install

# Copie o resto do código
COPY . .

# Compile a aplicação NestJS
RUN npm run build

# Comando final:
# 1. Aplica as migrations em produção
# 2. Executa o seed do Prisma
# 3. Inicia a aplicação
CMD ["sh", "-c", "npx prisma migrate deploy  && node dist/main.js"]
