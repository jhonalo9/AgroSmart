# Etapa 1: compilar Angular
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 2: servir con nginx
FROM nginx:alpine
COPY --from=build /app/dist/agrosmart-frontend/browser /usr/share/nginx/html
EXPOSE 80
