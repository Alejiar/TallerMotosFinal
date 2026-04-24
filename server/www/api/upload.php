<?php
/**
 * MotoFlow Pro - Manejo de Uploads
 * POST /api/upload.php -> Subir archivo
 */

require_once __DIR__ . '/config.php';

$uploadDir = __DIR__ . '/../uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
        exit;
    }
    
    if (!isset($_FILES['file'])) {
        http_response_code(400);
        echo json_encode(['error' => 'No se recibió archivo']);
        exit;
    }
    
    $file = $_FILES['file'];
    
    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'Error en la subida del archivo']);
        exit;
    }
    
    // Generar nombre único
    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid('upload_') . '.' . $extension;
    $filepath = $uploadDir . $filename;
    
    // Mover archivo
    if (!move_uploaded_file($file['tmp_name'], $filepath)) {
        http_response_code(500);
        echo json_encode(['error' => 'No se pudo guardar el archivo']);
        exit;
    }
    
    // Retornar ruta relativa
    echo json_encode([
        'path' => '/uploads/' . $filename,
        'filename' => $filename,
        'size' => filesize($filepath)
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

?>
