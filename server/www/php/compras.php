<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

switch ($a) {
    case 'listar':
        $rows = $db->query("SELECT c.*, p.name as proveedor_name FROM compras c LEFT JOIN proveedores p ON p.id=c.supplierId WHERE c.active=1 ORDER BY c.id DESC")->fetchAll();
        foreach ($rows as &$r) { $r['items'] = json_decode($r['items']??'[]', true)??[]; $r['total'] = (float)$r['total']; }
        respond($rows);

    case 'crear':
        $items = $i['items'] ?? [];
        if (empty($items)) error('Sin productos');
        $total = 0;
        foreach ($items as $it) $total += ((int)($it['qty']??1)) * ((float)($it['cost']??0));
        $db->beginTransaction();
        try {
            $db->prepare("INSERT INTO compras(supplierId,date,total,items,active) VALUES(?,?,?,?,1)")->execute([$i['supplierId']??null, $i['date']??todayISO(), $total, json_encode($items)]);
            $compraId = (int)$db->lastInsertId();
            // Incrementar stock
            foreach ($items as $it) {
                if (!empty($it['productId'])) {
                    $db->prepare("UPDATE productos SET stock=stock+? WHERE id=?")->execute([(int)($it['qty']??1), $it['productId']]);
                }
            }
            // Caja egreso
            $db->prepare("INSERT INTO caja(date,type,amount,concept,refType,refId) VALUES(?,?,?,?,?,?)")->execute([$i['date']??todayISO(), 'egreso', $total, 'Compra a proveedor', 'compra', $compraId]);
            $db->commit();
            respond(['ok' => true, 'id' => $compraId, 'total' => $total]);
        } catch (Exception $e) {
            $db->rollBack();
            error('Error: ' . $e->getMessage());
        }

    default:
        error('Acción no reconocida');
}
