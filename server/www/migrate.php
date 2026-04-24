#!/usr/bin/php
<?php
/**
 * MotoFlow Pro - Script de Migración de BD
 * Convierte database.db (sql.js) a SQLite en AppData
 * 
 * Uso: php migrate.php
 */

// Rutas
$sourceDb = __DIR__ . '/../../../backend/database.db';
$appDataPath = $_SERVER['APPDATA'] ?? getenv('APPDATA');
$motoFlowPath = $appDataPath . '\MotoFlowPro';
$targetDb = $motoFlowPath . '\taller.db';

echo "[Migración] MotoFlow Pro - Migración de Base de Datos\n";
echo "================================================\n\n";

// Verificar DB fuente
if (!file_exists($sourceDb)) {
    echo "[ERROR] No se encontró database.db en: $sourceDb\n";
    echo "[INFO] Creando nueva BD desde cero...\n";
    
    // Crear directorio si no existe
    if (!is_dir($motoFlowPath)) {
        mkdir($motoFlowPath, 0777, true);
        echo "[OK] Directorio creado: $motoFlowPath\n";
    }
    
    // Crear BD vacía
    try {
        $pdo = new PDO("sqlite:$targetDb");
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        echo "[OK] Nueva BD creada: $targetDb\n";
        
        // Inicializar schema
        require __DIR__ . '/api/db.php';
        $result = initDatabase();
        if ($result['success']) {
            echo "[OK] Schema inicializado\n";
        } else {
            echo "[ERROR] " . $result['error'] . "\n";
        }
    } catch (Exception $e) {
        echo "[ERROR] " . $e->getMessage() . "\n";
        exit(1);
    }
} else {
    echo "[INFO] Archivo fuente encontrado: $sourceDb\n";
    echo "[INFO] Tamaño: " . filesize($sourceDb) . " bytes\n\n";
    
    // Crear directorio destino si no existe
    if (!is_dir($motoFlowPath)) {
        mkdir($motoFlowPath, 0777, true);
        echo "[OK] Directorio creado: $motoFlowPath\n";
    }
    
    // Copiar archivo
    if (copy($sourceDb, $targetDb)) {
        echo "[OK] BD copiada a: $targetDb\n";
        echo "[OK] Migración completada exitosamente\n";
    } else {
        echo "[ERROR] No se pudo copiar el archivo\n";
        exit(1);
    }
}

echo "\n================================================\n";
echo "[OK] Proceso finalizado\n";
echo "BD disponible en: $targetDb\n";

?>
