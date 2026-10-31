FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node extension ./extension
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data /app/dist && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3210 DATA_DIR=/app/data
EXPOSE 3210
CMD ["npm", "start"]
