# Upgrade the base image to a modern version supporting PHP 8.3/8.4
FROM richarvey/nginx-php-fpm:latest

# Copy everything into the server
COPY . /var/www/html

# Set the working web directory directly to Laravel's public folder
ENV WEBROOT /var/www/html/public
ENV APP_ENV production

# Allow composer to execute system tasks safely
ENV COMPOSER_ALLOW_SUPERUSER 1

# Install project dependencies
RUN composer install --no-dev --optimize-autoloader

# Install Node and compile your React assets via Vite
RUN apk add --no-cache nodejs npm && \
    npm install && \
    npm run build

# Set correct storage permissions for Laravel
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
