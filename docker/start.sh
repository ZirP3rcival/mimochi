#!/bin/sh
set -e

# Render provides PORT (default 10000)
PORT="${PORT:-10000}"
rm -f /etc/nginx/http.d/default.conf
sed "s/__PORT__/${PORT}/g" /etc/nginx/templates/laravel.conf > /etc/nginx/http.d/laravel.conf

cd /var/www/html
php artisan storage:link 2>/dev/null || true

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    php artisan migrate --force
fi

php artisan optimize || true

# Artisan ran as root; make sure PHP-FPM (www-data) can write logs/cache
chown -R www-data:www-data storage bootstrap/cache

php-fpm -D
exec nginx -g "daemon off;"
