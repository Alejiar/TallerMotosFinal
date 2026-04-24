<?php
/**
 * MotoFlow Pro - Configuración de Base de Datos (SQLite)
 * Este archivo maneja la conexión a SQLite y define los recursos permitidos
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

// Configuración de ruta de BD
$appDataPath = $_SERVER['APPDATA'] ?? getenv('APPDATA');
$motoFlowPath = $appDataPath . '\MotoFlowPro';
$dbPath = $motoFlowPath . '\taller.db';

// Crear directorio si no existe
if (!is_dir($motoFlowPath)) {
    mkdir($motoFlowPath, 0777, true);
}

// Migración automática si BD no existe
if (!file_exists($dbPath)) {
    $sourceDb = __DIR__ . '/../../backend/database.db';
    if (file_exists($sourceDb)) {
        // Copiar BD existente
        copy($sourceDb, $dbPath);
    } else {
        // Crear BD vacía
        touch($dbPath);
    }
}

// Conectar a SQLite
try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    
    // Habilitar foreign keys
    $pdo->exec('PRAGMA foreign_keys = ON');
    
    // Inicializar schema si BD está vacía
    $tables = $pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")->fetchColumn();
    if ($tables == 0) {
        require_once __DIR__ . '/db.php';
        initDatabase();
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión a BD: ' . $e->getMessage()]);
    exit;
}

// Definir recursos permitidos y columnas JSON
$resourceConfig = [
    'usuarios' => ['jsonColumns' => []],
    'clientes' => ['jsonColumns' => []],
    'motos' => ['jsonColumns' => []],
    'ordenes' => ['jsonColumns' => ['parts', 'services', 'evidences']],
    'detalle_orden' => ['jsonColumns' => []],
    'productos' => ['jsonColumns' => []],
    'proveedores' => ['jsonColumns' => []],
    'compras' => ['jsonColumns' => ['items']],
    'empleados' => ['jsonColumns' => []],
    'pagos_empleados' => ['jsonColumns' => []],
    'caja' => ['jsonColumns' => []],
    'ventas' => ['jsonColumns' => ['items']],
    'notas' => ['jsonColumns' => []],
    'templates' => ['jsonColumns' => []],
    'counters' => ['jsonColumns' => []],
];

// Función para parsear columnas JSON
function parseRow($resource, $row) {
    global $resourceConfig;
    if (!isset($resourceConfig[$resource])) {
        return $row;
    }
    
    $config = $resourceConfig[$resource];
    $parsed = $row;
    
    foreach ($config['jsonColumns'] as $field) {
        if (isset($parsed[$field])) {
            if (is_string($parsed[$field])) {
                $parsed[$field] = json_decode($parsed[$field], true) ?: [];
            }
        } else {
            $parsed[$field] = [];
        }
    }
    
    return $parsed;
}

// Función para serializar columnas JSON
function serializeRow($resource, $row) {
    global $resourceConfig;
    if (!isset($resourceConfig[$resource])) {
        return $row;
    }
    
    $config = $resourceConfig[$resource];
    $normalized = $row;
    
    foreach ($config['jsonColumns'] as $field) {
        if (isset($normalized[$field])) {
            if (is_array($normalized[$field])) {
                $normalized[$field] = json_encode($normalized[$field]);
            }
        } else {
            $normalized[$field] = '[]';
        }
    }
    
    return $normalized;
}

// Headers CORS
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Responder a OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

?>
