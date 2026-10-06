# Step 1: Build the frontend assets using Node
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Step 2: Set up the production PHP environment
FROM php:8.3-fpm-alpine

# Install system dependencies and Nginx
RUN apk add --no-cache nginx git unzip supervisor libpng-dev libzip-dev zip

# Install PHP extensions required by Laravel
RUN docker-php-ext-install pdo pdo_mysql gd zip

# Get the latest Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set up working directory
WORKDIR /var/www/html
COPY . .

# Copy compiled React assets over from Step 1
COPY --from=frontend-builder /app/public/build ./public/build

# Set Composer environment parameters
ENV COMPOSER_ALLOW_SUPERUSER=1
RUN composer install --no-dev --optimize-autoloader

# Fix directory file permissions for Laravel
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

# Expose port and start Nginx + PHP-FPM using a basic entrypoint
EXPOSE 80
CMD php-fpm -D && nginx -g "daemon off;"
