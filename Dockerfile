# Image pour les hébergeurs qui préfèrent un conteneur (Fly.io, Railway, un VPS…).
FROM node:22-slim

WORKDIR /app

# better-sqlite3 est compilé nativement : on installe les dépendances avant le
# reste du code pour garder cette couche en cache entre deux déploiements.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# Deux façons de stocker la partie :
#  - une base libSQL hébergée, via DATABASE_URL et DATABASE_AUTH_TOKEN
#    (recommandé : le conteneur devient jetable) ;
#  - un fichier local, et il faut alors monter un volume sur /data,
#    sinon la partie disparaît au redémarrage.
VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "server/index.js"]
