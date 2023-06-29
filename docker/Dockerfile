FROM node:20.3.1-alpine3.17

RUN npm install -g nodemon

RUN apk add ffmpeg

COPY . /app

WORKDIR /app

RUN npm install