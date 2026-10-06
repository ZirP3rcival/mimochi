# Keep the latest stable PHP runtime environment
FROM richarvey/nginx-php-fpm:latest

# Copy everything into the server
COPY . /var/www/html

# Set the working web directory directly to Laravel's public folder
ENV WEBROOT /var/www/html/public
ENV APP_ENV production

# Allow composer to execute system tasks safely
ENV COMPOSER_ALLOW_SUPERUSER 1

# FIX: Re-introduced platform ignore flags to jump past PHP version caps on dependencies
RUN composer install --no-dev --optimize-autoloader --ignore-platform-reqs

# Install Node and compile your React assets via Vite
RUN apk add --no-cache nodejs npm && \
    npm install && \
    npm run build

# Set correct storage permissions for Laravel
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
