<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        $fecha = $_GET['fecha'] ?? $i['fecha'] ?? '';
        if ($fecha) {
            $stmt = $db->prepare("SELECT * FROM caja WHERE date=? ORDER BY id DESC");
            $stmt->execute([$fecha]);
        } else {
            $stmt = $db->query("SELECT * FROM caja ORDER BY id DESC LIMIT 200");
        }
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) { $r['amount'] = (float)$r['amount']; }
        respond($rows);

    case 'resumen':
        $fecha = $_GET['fecha'] ?? $i['fecha'] ?? todayISO();
        $stmt = $db->prepare("SELECT type, SUM(amount) as total FROM caja WHERE date=? GROUP BY type");
        $stmt->execute([$fecha]);
        $res = ['ingreso' => 0.0, 'egreso' => 0.0];
        foreach ($stmt->fetchAll() as $r) $res[$r['type']] = (float)$r['total'];
        respond(['fecha' => $fecha, 'ingresos' => $res['ingreso'], 'egresos' => $res['egreso'], 'balance' => $res['ingreso'] - $res['egreso']]);

    case 'crear':
        $type = $i['type'] ?? '';
        $amount = (float)($i['amount'] ?? 0);
        $concept = trim($i['concept'] ?? '');
        if (!in_array($type, ['ingreso','egreso']) || !$amount || !$concept) error('Datos requeridos');
        $db->prepare("INSERT INTO caja(date,type,amount,concept) VALUES(?,?,?,?)")->execute([$i['date']??todayISO(), $type, $amount, $concept]);
        respond(['ok' => true, 'id' => (int)$db->lastInsertId()]);

    case 'eliminar':
        requireAdmin();
        $id = (int)($i['id'] ?? 0);
        $db->prepare("DELETE FROM caja WHERE id=?")->execute([$id]);
        respond(['ok' => true]);

    default:
        error('Acción no reconocida');
}
