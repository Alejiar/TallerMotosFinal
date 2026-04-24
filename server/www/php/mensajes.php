<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        respond($db->query("SELECT * FROM templates ORDER BY id")->fetchAll());

    case 'actualizar':
        $id = (int)($i['id'] ?? 0);
        $body = $i['body'] ?? '';
        if (!$id) error('ID requerido');
        $db->prepare("UPDATE templates SET body=? WHERE id=?")->execute([$body, $id]);
        respond(['ok' => true]);

    default:
        error('Acción no reconocida');
}
