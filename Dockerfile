FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY client ./client
COPY server ./server
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

EXPOSE 8080
CMD ["npm", "run", "start"]
