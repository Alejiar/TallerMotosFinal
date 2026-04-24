<?php
/**
 * MotoFlow Pro - API WhatsApp
 * Comunicación con servicio Express:8001
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_GET['action'] ?? $input['action'] ?? null;

const WA_SERVICE_URL = 'http://localhost:8001';

try {
    // GET /api/whatsapp.php?action=status
    if ($method === 'GET' && $action === 'status') {
        $response = @file_get_contents(WA_SERVICE_URL . '/api/whatsapp/status');
        if ($response === false) {
            echo json_encode([
                'status' => 'disconnected',
                'qr' => null,
                'message' => 'Servicio WhatsApp no disponible'
            ]);
        } else {
            echo $response;
        }
    }
    
    // POST /api/whatsapp.php?action=init
    else if ($method === 'POST' && $action === 'init') {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => 'Content-Type: application/json',
                'content' => json_encode([]),
                'timeout' => 60
            ]
        ]);
        
        $response = @file_get_contents(WA_SERVICE_URL . '/api/whatsapp/init', false, $context);
        if ($response === false) {
            http_response_code(500);
            echo json_encode(['error' => 'No se pudo iniciar WhatsApp']);
        } else {
            echo $response;
        }
    }
    
    // POST /api/whatsapp.php?action=send
    else if ($method === 'POST' && $action === 'send') {
        if (!isset($input['phone'], $input['message'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Campos requeridos: phone, message']);
            exit;
        }
        
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => 'Content-Type: application/json',
                'content' => json_encode([
                    'phone' => $input['phone'],
                    'message' => $input['message']
                ]),
                'timeout' => 30
            ]
        ]);
        
        $response = @file_get_contents(WA_SERVICE_URL . '/api/whatsapp/send', false, $context);
        if ($response === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Error enviando mensaje']);
        } else {
            echo $response;
            
            // Guardar en BD para historial
            if (json_decode($response, true)['ok'] ?? false) {
                $stmt = $pdo->prepare("
                    INSERT INTO whatsapp_mensajes (phone, message, status, createdAt)
                    VALUES (?, ?, 'sent', ?)
                ");
                $stmt->execute([
                    $input['phone'],
                    $input['message'],
                    date('c')
                ]);
            }
        }
    }
    
    // POST /api/whatsapp.php?action=disconnect
    else if ($method === 'POST' && $action === 'disconnect') {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => 'Content-Type: application/json',
                'content' => json_encode([]),
                'timeout' => 10
            ]
        ]);
        
        $response = @file_get_contents(WA_SERVICE_URL . '/api/whatsapp/disconnect', false, $context);
        if ($response === false) {
            echo json_encode(['ok' => true]); // Considerar ok si el servicio no responde
        } else {
            echo $response;
        }
    }
    
    // GET /api/whatsapp.php?action=messages - Historial
    else if ($method === 'GET' && $action === 'messages') {
        $stmt = $pdo->prepare("SELECT * FROM whatsapp_mensajes ORDER BY createdAt DESC LIMIT 100");
        $stmt->execute();
        $messages = $stmt->fetchAll();
        echo json_encode($messages);
    }
    
    else {
        http_response_code(404);
        echo json_encode(['error' => 'Acción no válida']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

?>
