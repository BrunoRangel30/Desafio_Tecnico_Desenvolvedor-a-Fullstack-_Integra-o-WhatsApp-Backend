# Usa a imagem oficial do Node.js
FROM node:18-alpine

# Define o diretório de trabalho no container
WORKDIR /usr/src/app

# Copia o package.json e o package-lock.json e instala as dependências
COPY package*.json ./
RUN npm install --only=production

# Copia o resto do código da sua aplicação
COPY . .

# Compila a aplicação NestJS
RUN npm run build

# Exponha a porta
EXPOSE 3000

# Comando para rodar a aplicação
CMD ["node", "dist/main"]