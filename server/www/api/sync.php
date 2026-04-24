<?php
/**
 * MotoFlow Pro - Sincronización Completa
 * GET /api/sync.php -> Retorna todos los recursos
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

try {
    $data = [];
    
    foreach ($resourceConfig as $resource => $config) {
        $stmt = $pdo->prepare("SELECT * FROM {$resource}");
        $stmt->execute();
        $rows = $stmt->fetchAll();
        
        $data[$resource] = array_map(function($row) use ($resource) {
            return parseRow($resource, $row);
        }, $rows);
    }
    
    echo json_encode($data);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

?>
