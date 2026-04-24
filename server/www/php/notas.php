<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        $rows = $db->query("SELECT * FROM notas ORDER BY done ASC, id DESC")->fetchAll();
        foreach ($rows as &$r) { $r['done'] = (bool)$r['done']; }
        respond($rows);

    case 'crear':
        $title = trim($i['title'] ?? '');
        if (!$title) error('Título requerido');
        $db->prepare("INSERT INTO notas(title,body,createdAt,done) VALUES(?,?,?,0)")->execute([$title, $i['body']??'', nowISO()]);
        respond(['ok' => true, 'id' => (int)$db->lastInsertId()]);

    case 'toggle':
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $db->prepare("UPDATE notas SET done=NOT done WHERE id=?")->execute([$id]);
        respond(['ok' => true]);

    case 'eliminar':
        $id = (int)($i['id'] ?? 0);
        $db->prepare("DELETE FROM notas WHERE id=?")->execute([$id]);
        respond(['ok' => true]);

    default:
        error('Acción no reconocida');
}
