FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts postcss.config.js tailwind.config.js tsconfig.json ./
COPY src ./src
RUN VITE_API_URL=/api npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production TZ=Asia/Tehran
COPY --from=build /app/dist ./dist
COPY apps-script/Code.gs ./apps-script/Code.gs
COPY deploy/server.mjs ./deploy/
COPY --from=build /app/node_modules ./node_modules
USER node
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "deploy/server.mjs"]
