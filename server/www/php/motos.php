<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'kanban':
        $rows = $db->query("
            SELECT o.id, o.number, o.status, o.entryDate, o.estimatedDate, o.total, o.locked,
                   c.name as cliente_name, c.phone as cliente_phone, m.plate, m.model as moto_model, m.id as moto_id
            FROM ordenes o
            LEFT JOIN clientes c ON c.id=o.customerId
            LEFT JOIN motos m ON m.id=o.bikeId
            WHERE o.active=1 AND o.status != 'entregada'
            ORDER BY o.id DESC
        ")->fetchAll();
        foreach ($rows as &$r) { $r['locked'] = (bool)$r['locked']; $r['total'] = (float)$r['total']; }
        respond($rows);

    case 'cambiar_estado':
        $id = (int)($i['id'] ?? 0);
        $status = $i['status'] ?? '';
        if (!$id || !$status) error('Datos requeridos');
        $stmt = $db->prepare("SELECT o.*, c.name as cn, c.phone as cp, m.plate, m.model as mm FROM ordenes o LEFT JOIN clientes c ON c.id=o.customerId LEFT JOIN motos m ON m.id=o.bikeId WHERE o.id=?");
        $stmt->execute([$id]);
        $o = $stmt->fetch();
        if (!$o) error('No encontrada');
        if ($o['locked']) error('Orden bloqueada');
        $db->prepare("UPDATE ordenes SET status=? WHERE id=?")->execute([$status, $id]);
        $statusLabels = ['lista' => 'Lista para entregar', 'ingresada' => 'Ingresada', 'diagnostico' => 'En diagnóstico', 'esperando_repuestos' => 'Esperando repuestos', 'reparacion' => 'En reparación'];
        $tipo = ($status === 'lista') ? 'finalizacion' : 'proceso';
        $msg = buildTemplate($tipo, ['cliente' => $o['cn'], 'placa' => $o['plate'], 'moto' => $o['mm'], 'orden' => $o['number'], 'estado' => $statusLabels[$status] ?? $status]);
        queueWhatsApp($tipo, $o['cp'], $msg, $id);
        respond(['ok' => true]);

    case 'actualizar_moto':
        $id = (int)($i['moto_id'] ?? 0);
        if (!$id) error('ID requerido');
        $fields = []; $vals = [];
        foreach (['plate','model','year','color'] as $f) {
            if (array_key_exists($f, $i)) { $fields[] = "$f=?"; $vals[] = ($f === 'plate') ? strtoupper(trim($i[$f])) : $i[$f]; }
        }
        if (empty($fields)) error('Nada que actualizar');
        $vals[] = $id;
        $db->prepare("UPDATE motos SET " . implode(',', $fields) . " WHERE id=?")->execute($vals);
        respond(['ok' => true]);

    default:
        error('Acción no reconocida');
}
