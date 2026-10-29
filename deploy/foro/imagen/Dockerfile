# PHP 8.2 + Apache para vBulletin 5.7.5 (las .htaccess del foro funcionan tal cual)
FROM php:8.2-apache
RUN apt-get update && apt-get install -y --no-install-recommends libpng-dev libjpeg62-turbo-dev libfreetype6-dev libwebp-dev libzip-dev libicu-dev \
 && docker-php-ext-configure gd --with-jpeg --with-freetype --with-webp \
 && docker-php-ext-install -j"$(nproc)" mysqli pdo_mysql gd zip intl opcache exif \
 && rm -rf /var/lib/apt/lists/* \
 && a2enmod rewrite headers remoteip expires substitute \
 && a2disconf other-vhosts-access-log
COPY php.ini /usr/local/etc/php/conf.d/foro.ini
COPY apache-foro.conf /etc/apache2/conf-enabled/zz-foro.conf
