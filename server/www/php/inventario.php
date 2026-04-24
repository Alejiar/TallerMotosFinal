<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        $rows = $db->query("SELECT p.*, pv.name as proveedor_name FROM productos p LEFT JOIN proveedores pv ON pv.id=p.supplierId WHERE p.active=1 ORDER BY p.name")->fetchAll();
        foreach ($rows as &$r) { $r['stock'] = (int)$r['stock']; $r['minStock'] = (int)$r['minStock']; $r['price'] = (float)$r['price']; $r['cost'] = (float)$r['cost']; }
        respond($rows);

    case 'buscar':
        $q = strtolower(trim($_GET['q'] ?? $i['q'] ?? ''));
        $rows = $db->prepare("SELECT * FROM productos WHERE active=1 AND (LOWER(name) LIKE ? OR LOWER(code) LIKE ? OR LOWER(COALESCE(shelf,'')) LIKE ?) ORDER BY name LIMIT 30");
        $rows->execute(["%$q%", "%$q%", "%$q%"]);
        $res = $rows->fetchAll();
        foreach ($res as &$r) { $r['stock'] = (int)$r['stock']; $r['price'] = (float)$r['price']; }
        respond($res);

    case 'crear':
        $code = trim($i['code'] ?? '');
        $name = trim($i['name'] ?? '');
        if (!$code || !$name) error('Código y nombre requeridos');
        $stmt = $db->prepare("INSERT INTO productos(code,name,stock,minStock,shelf,price,cost,supplierId,active,createdAt) VALUES(?,?,?,?,?,?,?,?,1,?)");
        $stmt->execute([$code, $name, (int)($i['stock']??0), (int)($i['minStock']??0), $i['shelf']??'', (float)($i['price']??0), (float)($i['cost']??0), $i['supplierId']??null, todayISO()]);
        respond(['ok' => true, 'id' => (int)$db->lastInsertId()]);

    case 'actualizar':
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $fields = []; $vals = [];
        foreach (['code','name','stock','minStock','shelf','price','cost','supplierId'] as $f) {
            if (array_key_exists($f, $i)) {
                $fields[] = "$f=?";
                $v = $i[$f];
                if (in_array($f, ['stock','minStock'])) $v = (int)$v;
                if (in_array($f, ['price','cost'])) $v = (float)$v;
                $vals[] = $v;
            }
        }
        if (empty($fields)) error('Nada que actualizar');
        $vals[] = $id;
        $db->prepare("UPDATE productos SET " . implode(',', $fields) . " WHERE id=?")->execute($vals);
        respond(['ok' => true]);

    case 'eliminar':
        requireAdmin();
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $db->prepare("UPDATE productos SET active=0 WHERE id=?")->execute([$id]);
        respond(['ok' => true]);

    default:
        error('Acción no reconocida');
}
