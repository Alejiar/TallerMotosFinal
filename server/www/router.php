<?php
/**
 * MotoFlow Pro - Router para PHP built-in server
 * Se usa como: php -S 0.0.0.0:8000 router.php
 * Maneja rutas SPA y archivos estáticos
 */

$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$requestFile = __DIR__ . $requestUri;

// Archivos PHP en /php/ (el JS los llama sin extensión: php/auth => php/auth.php)
if (strpos($requestUri, '/php/') === 0) {
    $phpFile = is_file($requestFile) ? $requestFile : $requestFile . '.php';
    if (is_file($phpFile)) {
        set_error_handler(function($errno, $errstr, $errfile, $errline) {
            header('Content-Type: application/json');
            http_response_code(500);
            echo json_encode(['error' => "PHP Error [$errno]: $errstr en $errfile:$errline"]);
            exit;
        });
        try {
            require $phpFile;
        } catch (Throwable $e) {
            header('Content-Type: application/json');
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
        }
    } else {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Endpoint no encontrado: ' . $requestUri]);
    }
    return true;
}

// Rutas de API legacy (/api/)
if (strpos($requestUri, '/api/') === 0) {
    require_once __DIR__ . '/api/config.php';
    require_once __DIR__ . '/api/db.php';
    $apiFile = __DIR__ . $requestUri;
    if (is_file($apiFile)) {
        require $apiFile;
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Endpoint no encontrado']);
    }
    return true;
}

// Archivos estáticos que existen (js, css, imágenes, etc.)
if (is_file($requestFile) && !is_dir($requestFile)) {
    return false; // El servidor built-in lo maneja
}

// Directorio con index.html
if (is_dir($requestFile) && is_file($requestFile . '/index.html')) {
    header('Content-Type: text/html; charset=utf-8');
    require $requestFile . '/index.html';
    return true;
}

// SPA fallback: cualquier ruta desconocida sirve index.html
if (is_file(__DIR__ . '/index.html')) {
    header('Content-Type: text/html; charset=utf-8');
    require __DIR__ . '/index.html';
} else {
    http_response_code(404);
    echo 'index.html not found';
}

?>
