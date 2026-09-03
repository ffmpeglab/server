FROM node:24-alpine AS builder
WORKDIR /app

# Ensure production runtime defaults
ENV NODE_ENV=production

COPY . .

RUN npm i -g @nestjs/cli

RUN yarn && yarn build

FROM linuxserver/ffmpeg:7.1-cli

WORKDIR /app

COPY --from=builder /app/ /app/

RUN mkdir /tmp/ffmpeglab

# Declare data volume for clarity and persistence
VOLUME ["/tmp/ffmpeglab"]

RUN ./installnode.sh

# Expose port
EXPOSE 3000

# Start the application
ENTRYPOINT ["./entrypoint.sh"]