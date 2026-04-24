<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        respond($db->query("SELECT * FROM proveedores WHERE active=1 ORDER BY name")->fetchAll());

    case 'crear':
        $name = trim($i['name'] ?? '');
        if (!$name) error('Nombre requerido');
        $db->prepare("INSERT INTO proveedores(name,phone,productsHint,active) VALUES(?,?,?,1)")->execute([$name, $i['phone']??'', $i['productsHint']??'']);
        respond(['ok' => true, 'id' => (int)$db->lastInsertId()]);

    case 'actualizar':
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $db->prepare("UPDATE proveedores SET name=?,phone=?,productsHint=? WHERE id=?")->execute([trim($i['name']??''), $i['phone']??'', $i['productsHint']??'', $id]);
        respond(['ok' => true]);

    case 'eliminar':
        requireAdmin();
        $id = (int)($i['id'] ?? 0);
        $db->prepare("UPDATE proveedores SET active=0 WHERE id=?")->execute([$id]);
        respond(['ok' => true]);

    default:
        error('Acción no reconocida');
}
