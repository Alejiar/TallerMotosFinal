<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

// Ensure table exists
$db->exec("CREATE TABLE IF NOT EXISTS garantias (id INTEGER PRIMARY KEY AUTOINCREMENT, orderId INTEGER, customerId INTEGER, bikeId INTEGER, description TEXT NOT NULL, expiresAt TEXT, status TEXT NOT NULL DEFAULT 'activa', createdAt TEXT NOT NULL, notes TEXT)");

switch ($a) {
    case 'listar':
        $rows = $db->query("
            SELECT g.*, c.name as cliente_name, m.plate, o.number as orden_number
            FROM garantias g
            LEFT JOIN clientes c ON c.id=g.customerId
            LEFT JOIN motos m ON m.id=g.bikeId
            LEFT JOIN ordenes o ON o.id=g.orderId
            ORDER BY g.id DESC
        ")->fetchAll();
        respond($rows);

    case 'crear':
        $desc = trim($i['description'] ?? '');
        if (!$desc) error('Descripción requerida');
        $db->prepare("INSERT INTO garantias(orderId,customerId,bikeId,description,expiresAt,status,createdAt,notes) VALUES(?,?,?,?,?,'activa',?,?)")->execute([$i['orderId']??null, $i['customerId']??null, $i['bikeId']??null, $desc, $i['expiresAt']??null, todayISO(), $i['notes']??'']);
        respond(['ok' => true, 'id' => (int)$db->lastInsertId()]);

    case 'actualizar':
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $fields = []; $vals = [];
        foreach (['description','expiresAt','status','notes'] as $f) {
            if (array_key_exists($f, $i)) { $fields[] = "$f=?"; $vals[] = $i[$f]; }
        }
        if (empty($fields)) error('Nada que actualizar');
        $vals[] = $id;
        $db->prepare("UPDATE garantias SET " . implode(',', $fields) . " WHERE id=?")->execute($vals);
        respond(['ok' => true]);

    case 'eliminar':
        requireAdmin();
        $id = (int)($i['id'] ?? 0);
        $db->prepare("DELETE FROM garantias WHERE id=?")->execute([$id]);
        respond(['ok' => true]);

    default:
        error('Acción no reconocida');
}
