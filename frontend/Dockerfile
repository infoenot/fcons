FROM node:22-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ARG CACHEBUST=2
RUN npm run build

FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
