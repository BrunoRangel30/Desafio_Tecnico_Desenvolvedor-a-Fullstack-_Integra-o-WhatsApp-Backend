# Use a imagem oficial do Node.js
FROM node:18-alpine

# Defina o diretório de trabalho no contêiner
WORKDIR /usr/src/app

# Copie o package.json e instale as dependências
COPY package*.json ./
RUN npm install

# **Execute as migrações**
# Este passo garante que a estrutura do banco de dados está atualizada antes da aplicação rodar
RUN npm run typeorm migration:run

# Copie o resto do código da sua aplicação
COPY . .

# Compila a aplicação NestJS
RUN npm run build

# Comando final para rodar a aplicação
CMD ["node", "dist/main"]