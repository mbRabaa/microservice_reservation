FROM node:18-alpine
WORKDIR /app

# Installation sécurisée des dépendances
COPY package*.json ./
RUN npm ci --production --ignore-scripts && \
    npm cache clean --force

# Copie des fichiers
COPY . .

# Configuration sécurité
RUN chown -R node:node /app
USER node

EXPOSE 3004
CMD ["node", "server.js"]