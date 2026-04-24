<?php
/**
 * MotoFlow Pro - API CRUD de Recursos
 * Endpoints:
 * GET /api/resource.php?name=clientes -> Obtener todos
 * GET /api/resource.php?name=clientes&id=1 -> Obtener uno
 * POST /api/resource.php -> Crear (requiere name en JSON)
 * PATCH /api/resource.php -> Actualizar (requiere id y name en JSON)
 * DELETE /api/resource.php?name=clientes&id=1 -> Eliminar
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// Obtener input
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$name = $_GET['name'] ?? $input['name'] ?? null;
$id = $_GET['id'] ?? $input['id'] ?? null;

// Validar recurso
if (!$name || !isset($resourceConfig[$name])) {
    http_response_code(404);
    echo json_encode(['error' => 'Recurso inválido']);
    exit;
}

try {
    // GET /api/resource.php?name=clientes
    if ($method === 'GET' && $id === null) {
        $stmt = $pdo->prepare("SELECT * FROM {$name}");
        $stmt->execute();
        $rows = $stmt->fetchAll();
        echo json_encode(array_map(function($row) use ($name) {
            return parseRow($name, $row);
        }, $rows));
    }
    
    // GET /api/resource.php?name=clientes&id=1
    else if ($method === 'GET' && $id !== null) {
        $stmt = $pdo->prepare("SELECT * FROM {$name} WHERE id = ?");
        $stmt->execute([(int)$id]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'No encontrado']);
            exit;
        }
        echo json_encode(parseRow($name, $row));
    }
    
    // POST /api/resource.php - Crear
    else if ($method === 'POST') {
        if (empty($input)) {
            http_response_code(400);
            echo json_encode(['error' => 'Cuerpo vacío']);
            exit;
        }
        
        $normalized = serializeRow($name, $input);
        $columns = array_keys($normalized);
        $placeholders = array_fill(0, count($columns), '?');
        
        $sql = "INSERT INTO {$name} (" . implode(',', $columns) . ") VALUES (" . implode(',', $placeholders) . ")";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_values($normalized));
        
        $lastId = $pdo->lastInsertId();
        
        // Sincronizar detalle_orden si es orden
        if ($name === 'ordenes' && isset($input['parts'], $input['services'])) {
            syncDetalleOrden($lastId, $input['parts'], $input['services']);
        }
        
        // Retornar registro creado
        $stmt = $pdo->prepare("SELECT * FROM {$name} WHERE id = ?");
        $stmt->execute([$lastId]);
        $row = $stmt->fetch();
        
        http_response_code(201);
        echo json_encode(parseRow($name, $row));
    }
    
    // PATCH /api/resource.php - Actualizar
    else if ($method === 'PATCH') {
        if (!isset($input['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Falta ID']);
            exit;
        }
        
        $id = $input['id'];
        $normalized = serializeRow($name, $input);
        unset($normalized['id']);
        
        $columns = array_keys($normalized);
        $assignments = array_map(function($col) { return "{$col} = ?"; }, $columns);
        
        $sql = "UPDATE {$name} SET " . implode(',', $assignments) . " WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([...array_values($normalized), $id]);
        
        // Sincronizar detalle_orden si es orden
        if ($name === 'ordenes' && (isset($input['parts']) || isset($input['services']))) {
            syncDetalleOrden($id, $input['parts'] ?? [], $input['services'] ?? []);
        }
        
        // Retornar registro actualizado
        $stmt = $pdo->prepare("SELECT * FROM {$name} WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        
        echo json_encode(parseRow($name, $row));
    }
    
    // DELETE /api/resource.php?name=clientes&id=1
    else if ($method === 'DELETE') {
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Falta ID']);
            exit;
        }
        
        $stmt = $pdo->prepare("DELETE FROM {$name} WHERE id = ?");
        $stmt->execute([(int)$id]);
        
        http_response_code(204);
    }
    
    else {
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

// Función para sincronizar detalles de orden
function syncDetalleOrden($orderId, $parts = [], $services = []) {
    global $pdo;
    
    // Eliminar detalles antiguos
    $stmt = $pdo->prepare("DELETE FROM detalle_orden WHERE orderId = ?");
    $stmt->execute([$orderId]);
    
    // Insertar nuevos detalles
    $stmt = $pdo->prepare("
        INSERT INTO detalle_orden (orderId, itemType, name, qty, unitPrice)
        VALUES (?, ?, ?, ?, ?)
    ");
    
    foreach ($parts as $part) {
        $stmt->execute([
            $orderId,
            'part',
            $part['name'] ?? 'Part',
            $part['qty'] ?? 0,
            $part['unitPrice'] ?? 0
        ]);
    }
    
    foreach ($services as $service) {
        $stmt->execute([
            $orderId,
            'service',
            $service['description'] ?? $service['name'] ?? 'Service',
            $service['qty'] ?? 1,
            $service['price'] ?? 0
        ]);
    }
}

?>
