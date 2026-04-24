<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'global':
        $q = strtolower(trim($_GET['q'] ?? $i['q'] ?? ''));
        if (strlen($q) < 2) respond(['ordenes' => [], 'clientes' => [], 'productos' => []]);

        $like = "%$q%";

        $ordenes = $db->prepare("
            SELECT o.id, o.number, o.status, o.entryDate, o.total,
                   c.name as cliente_name, m.plate
            FROM ordenes o
            LEFT JOIN clientes c ON c.id=o.customerId
            LEFT JOIN motos m ON m.id=o.bikeId
            WHERE o.active=1 AND (LOWER(o.number) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(m.plate) LIKE ? OR LOWER(o.problem) LIKE ?)
            ORDER BY o.id DESC LIMIT 20
        ");
        $ordenes->execute([$like, $like, $like, $like]);
        $ord = $ordenes->fetchAll();
        foreach ($ord as &$r) { $r['total'] = (float)$r['total']; }

        $clientes = $db->prepare("
            SELECT c.id, c.name, c.phone,
                   COUNT(m.id) as motos_count
            FROM clientes c
            LEFT JOIN motos m ON m.customerId=c.id
            WHERE c.active=1 AND (LOWER(c.name) LIKE ? OR LOWER(c.phone) LIKE ?)
            GROUP BY c.id
            ORDER BY c.name LIMIT 20
        ");
        $clientes->execute([$like, $like]);

        $productos = $db->prepare("
            SELECT id, code, name, stock, price, shelf
            FROM productos
            WHERE active=1 AND (LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(COALESCE(shelf,'')) LIKE ?)
            ORDER BY name LIMIT 20
        ");
        $productos->execute([$like, $like, $like]);
        $prods = $productos->fetchAll();
        foreach ($prods as &$p) { $p['stock'] = (int)$p['stock']; $p['price'] = (float)$p['price']; }

        respond(['ordenes' => $ord, 'clientes' => $clientes->fetchAll(), 'productos' => $prods]);

    default:
        error('Acción no reconocida');
}
