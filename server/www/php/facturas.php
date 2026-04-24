<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        $rows = $db->query("
            SELECT v.id, v.number, v.date, v.total, v.method, v.type, v.orderId, o.number as orden_number
            FROM ventas v
            LEFT JOIN ordenes o ON o.id=v.orderId
            ORDER BY v.id DESC
        ")->fetchAll();
        foreach ($rows as &$r) { $r['total'] = (float)$r['total']; }
        respond($rows);

    case 'get':
        $id = (int)($_GET['id'] ?? $i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $stmt = $db->prepare("SELECT v.*, o.number as orden_number, c.name as cliente_name, c.phone as cliente_phone FROM ventas v LEFT JOIN ordenes o ON o.id=v.orderId LEFT JOIN clientes c ON c.id=o.customerId WHERE v.id=?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) error('Factura no encontrada', 404);
        $row['items'] = json_decode($row['items'] ?? '[]', true) ?? [];
        $row['total'] = (float)$row['total'];
        respond($row);

    default:
        error('Acción no reconocida');
}
