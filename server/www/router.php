<?php
/**
 * MotoFlow Pro - Router para PHP built-in server
 * Se usa como: php -S 0.0.0.0:8000 router.php
 * Maneja rutas SPA y archivos estáticos
 */

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/db.php';

$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$requestFile = __DIR__ . $requestUri;

// Si es un archivo estático que existe, servirlo
if (is_file($requestFile) && !is_dir($requestFile)) {
    return false; // Let the built-in server handle it
}

// Si es una carpeta que existe pero sin index, dejar pasar
if (is_dir($requestFile)) {
    if (is_file($requestFile . '/index.html')) {
        require $requestFile . '/index.html';
        return true;
    }
    return false;
}

// Para cualquier otra ruta, servir index.html (SPA)
if (is_file(__DIR__ . '/index.html')) {
    require __DIR__ . '/index.html';
} else {
    http_response_code(404);
    echo 'index.html not found';
}

?>
