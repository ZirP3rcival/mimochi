FROM richarvey/nginx-php-fpm:3.1.6

# Copy everything into the server
COPY . /var/www/html

# Set the working web directory directly to Laravel's public folder
ENV WEBROOT /var/www/html/public
ENV APP_ENV production

# Install project dependencies
RUN composer install --no-dev --optimize-autoloader

# Install Node and compile your React assets via Vite
RUN apk add --no-cache nodejs npm && \
    npm install && \
    npm run build

# Set correct storage permissions for Laravel
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
