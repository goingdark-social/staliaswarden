FROM node:24-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# The app writes request/response logs to ./logs. Kubernetes runs the pod as a
# non-root user, so the directory has to be owned by that user or every log
# line turns into an EACCES.
RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app

USER node

EXPOSE 3000

# node directly rather than via npm: npm wants a writable HOME for its cache,
# which breaks under readOnlyRootFilesystem.
CMD ["node", "src/index.js"]
