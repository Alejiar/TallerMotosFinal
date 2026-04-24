<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        $rows = $db->query("SELECT v.*, o.number as orden_number FROM ventas v LEFT JOIN ordenes o ON o.id=v.orderId ORDER BY v.id DESC")->fetchAll();
        foreach ($rows as &$r) {
            $r['items'] = json_decode($r['items'] ?? '[]', true) ?? [];
            $r['total'] = (float)$r['total'];
        }
        respond($rows);

    case 'crear':
        $items = $i['items'] ?? [];
        $method = $i['method'] ?? 'efectivo';
        if (empty($items)) error('Sin productos');
        $total = 0;
        foreach ($items as &$it) {
            $it['qty'] = (int)($it['qty'] ?? 1);
            $it['unitPrice'] = (float)($it['unitPrice'] ?? 0);
            $total += $it['qty'] * $it['unitPrice'];
        }
        $db->beginTransaction();
        try {
            $n = nextCounter('sale');
            $number = formatSaleNumber($n);
            $db->prepare("INSERT INTO ventas(number,date,items,total,method,type) VALUES(?,?,?,?,?,'mostrador')")->execute([$number, todayISO(), json_encode($items), $total, $method]);
            $saleId = (int)$db->lastInsertId();
            // Descontar stock
            foreach ($items as $it) {
                if (!empty($it['productId'])) {
                    $db->prepare("UPDATE productos SET stock=MAX(0,stock-?) WHERE id=?")->execute([$it['qty'], $it['productId']]);
                }
            }
            // Caja
            $db->prepare("INSERT INTO caja(date,type,amount,concept,refType,refId) VALUES(?,?,?,?,?,?)")->execute([todayISO(), 'ingreso', $total, 'Venta mostrador ' . $number, 'venta', $saleId]);
            $db->commit();
            respond(['ok' => true, 'id' => $saleId, 'number' => $number, 'total' => $total]);
        } catch (Exception $e) {
            $db->rollBack();
            error('Error al crear venta: ' . $e->getMessage());
        }

    default:
        error('Acción no reconocida');
}
