# Step 1: Build the frontend assets
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Step 2: Production PHP + Nginx
FROM php:8.3-fpm-alpine

RUN apk add --no-cache nginx git unzip zip \
    libpng-dev libjpeg-turbo-dev freetype-dev libwebp-dev libzip-dev postgresql-dev

# gd with jpeg/webp/freetype support (needed by intervention/image).
# pdo_pgsql is for Render's managed Postgres; remove pdo_mysql if unused.
RUN docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" pdo pdo_mysql pdo_pgsql gd zip

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY . .
COPY --from=frontend-builder /app/public/build ./public/build

ENV COMPOSER_ALLOW_SUPERUSER=1
RUN composer install --no-dev --optimize-autoloader --no-interaction

RUN mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs \
    && chown -R www-data:www-data storage bootstrap/cache

# Nginx template + startup script
COPY docker/nginx.conf /etc/nginx/templates/laravel.conf
COPY docker/start.sh /usr/local/bin/start.sh
RUN sed -i 's/\r$//' /usr/local/bin/start.sh && chmod +x /usr/local/bin/start.sh

EXPOSE 10000
CMD ["/usr/local/bin/start.sh"]
