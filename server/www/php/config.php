<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

define('DB_PATH', getenv('APPDATA') . DIRECTORY_SEPARATOR . 'MotoFlowPro' . DIRECTORY_SEPARATOR . 'taller.db');
define('INIT_SQL', __DIR__ . '/../sql/init.sql');

function getDB(): PDO {
    static $conn = null;
    if ($conn !== null) return $conn;

    $dir = dirname(DB_PATH);
    if (!is_dir($dir)) mkdir($dir, 0777, true);

    $isNew = !file_exists(DB_PATH);
    $conn = new PDO('sqlite:' . DB_PATH);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $conn->exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");

    if ($isNew) {
        $sql = file_get_contents(INIT_SQL);
        $conn->exec($sql);
    }

    // Migraciones (idempotentes)
    try { $conn->exec("ALTER TABLE garantias ADD COLUMN notes TEXT"); } catch(Exception $e){}
    try { $conn->exec("CREATE TABLE IF NOT EXISTS garantias (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER, customerId INTEGER, bikeId INTEGER, description TEXT NOT NULL, expiresAt TEXT, status TEXT NOT NULL DEFAULT 'activa', createdAt TEXT NOT NULL)"); } catch(Exception $e){}

    return $conn;
}

function respond($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function error(string $msg, int $code = 400): void {
    respond(['error' => $msg], $code);
}

function requireAuth(): array {
    if (empty($_SESSION['uid'])) error('No autenticado', 401);
    return $_SESSION;
}

function requireAdmin(): array {
    $s = requireAuth();
    if ($s['rol'] !== 'admin') error('Solo administradores', 403);
    return $s;
}

function input(): array {
    $body = file_get_contents('php://input');
    return json_decode($body, true) ?? [];
}

function action(): string {
    $i = input();
    return $_GET['action'] ?? $i['action'] ?? '';
}

function todayISO(): string {
    return date('Y-m-d');
}

function nowISO(): string {
    return date('Y-m-d H:i:s');
}

function nextCounter(string $key): int {
    $db = getDB();
    $db->exec("INSERT OR IGNORE INTO counters(key,value) VALUES('$key',0)");
    $db->exec("UPDATE counters SET value=value+1 WHERE key='$key'");
    $stmt = $db->query("SELECT value FROM counters WHERE key='$key'");
    return (int)$stmt->fetchColumn();
}

function formatOrderNumber(int $n): string {
    return 'ORD-' . str_pad($n, 4, '0', STR_PAD_LEFT);
}

function formatSaleNumber(int $n): string {
    return 'FAC-' . str_pad($n, 4, '0', STR_PAD_LEFT);
}

function getConfig(string $clave, string $default = ''): string {
    $db = getDB();
    $stmt = $db->prepare("SELECT valor FROM configuracion WHERE clave=?");
    $stmt->execute([$clave]);
    $row = $stmt->fetch();
    return $row ? $row['valor'] : $default;
}

function queueWhatsApp(string $tipo, string $telefono, string $mensaje, ?int $entidad_id = null): void {
    if (empty($telefono)) return;
    $db = getDB();
    // Aplicar modo prueba
    $modo = getConfig('modo_prueba', '0');
    if ($modo === '1') {
        $numPrueba = getConfig('numero_prueba', '');
        if ($numPrueba) $telefono = $numPrueba;
    }
    $stmt = $db->prepare("INSERT INTO whatsapp_mensajes(entidad_id,tipo,telefono,mensaje,estado,createdAt) VALUES(?,?,?,?,'pendiente',?)");
    $stmt->execute([$entidad_id, $tipo, $telefono, $mensaje, nowISO()]);
}

function buildTemplate(string $key, array $vars = []): string {
    $db = getDB();
    $stmt = $db->prepare("SELECT body FROM templates WHERE key=?");
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    $body = $row ? $row['body'] : '';
    foreach ($vars as $k => $v) {
        $body = str_replace('{' . $k . '}', (string)$v, $body);
    }
    return $body;
}

function money(float $amount): string {
    return '$' . number_format($amount, 0, ',', '.');
}
