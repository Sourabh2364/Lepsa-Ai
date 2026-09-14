FROM php:8.2-cli
COPY . /app
WORKDIR /app
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-10000}"]
