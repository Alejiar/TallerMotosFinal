<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        $rows = $db->query("SELECT * FROM empleados WHERE active=1 ORDER BY name")->fetchAll();
        respond($rows);

    case 'crear':
        $name = trim($i['name'] ?? '');
        if (!$name) error('Nombre requerido');
        $db->prepare("INSERT INTO empleados(name,role,phone,active) VALUES(?,?,?,1)")->execute([$name, $i['role']??'', $i['phone']??'']);
        respond(['ok' => true, 'id' => (int)$db->lastInsertId()]);

    case 'actualizar':
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $db->prepare("UPDATE empleados SET name=?,role=?,phone=? WHERE id=?")->execute([trim($i['name']??''), $i['role']??'', $i['phone']??'', $id]);
        respond(['ok' => true]);

    case 'eliminar':
        requireAdmin();
        $id = (int)($i['id'] ?? 0);
        $db->prepare("UPDATE empleados SET active=0 WHERE id=?")->execute([$id]);
        respond(['ok' => true]);

    case 'pagos_listar':
        $empId = (int)($_GET['empleado_id'] ?? $i['empleado_id'] ?? 0);
        if ($empId) {
            $stmt = $db->prepare("SELECT pe.*, e.name as empleado_name FROM pagos_empleados pe JOIN empleados e ON e.id=pe.employeeId WHERE pe.employeeId=? ORDER BY pe.id DESC");
            $stmt->execute([$empId]);
        } else {
            $stmt = $db->query("SELECT pe.*, e.name as empleado_name FROM pagos_empleados pe JOIN empleados e ON e.id=pe.employeeId ORDER BY pe.id DESC LIMIT 100");
        }
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) { $r['amount'] = (float)$r['amount']; }
        respond($rows);

    case 'pagos_crear':
        $empId = (int)($i['employeeId'] ?? 0);
        $amount = (float)($i['amount'] ?? 0);
        if (!$empId || !$amount) error('Datos requeridos');
        $db->prepare("INSERT INTO pagos_empleados(employeeId,amount,date,note) VALUES(?,?,?,?)")->execute([$empId, $amount, $i['date']??todayISO(), $i['note']??'']);
        $pagoId = (int)$db->lastInsertId();
        $emp = $db->prepare("SELECT name FROM empleados WHERE id=?"); $emp->execute([$empId]);
        $empName = $emp->fetchColumn();
        $db->prepare("INSERT INTO caja(date,type,amount,concept,refType,refId) VALUES(?,?,?,?,?,?)")->execute([$i['date']??todayISO(), 'egreso', $amount, 'Pago empleado: '.$empName, 'pago_empleado', $pagoId]);
        respond(['ok' => true, 'id' => $pagoId]);

    default:
        error('Acción no reconocida');
}
