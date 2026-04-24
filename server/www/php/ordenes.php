<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$a = action();
$i = input();

$STATUS_LABELS = [
    'ingresada' => 'Ingresada', 'diagnostico' => 'En diagnóstico',
    'esperando_repuestos' => 'Esperando repuestos', 'reparacion' => 'En reparación',
    'lista' => 'Lista para entregar', 'entregada' => 'Entregada',
];

function getOrden(PDO $db, int $id): array {
    $stmt = $db->prepare("
        SELECT o.*, c.name as cliente_name, c.phone as cliente_phone, m.plate, m.model as moto_model
        FROM ordenes o
        LEFT JOIN clientes c ON c.id=o.customerId
        LEFT JOIN motos m ON m.id=o.bikeId
        WHERE o.id=?
    ");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) return [];
    $row['parts'] = json_decode($row['parts'] ?? '[]', true) ?? [];
    $row['services'] = json_decode($row['services'] ?? '[]', true) ?? [];
    $row['evidences'] = json_decode($row['evidences'] ?? '[]', true) ?? [];
    $row['locked'] = (bool)$row['locked'];
    $row['total'] = (float)$row['total'];
    return $row;
}

function syncDetalle(PDO $db, int $orderId, array $parts, array $services): void {
    $db->prepare("DELETE FROM detalle_orden WHERE orderId=?")->execute([$orderId]);
    $stmt = $db->prepare("INSERT INTO detalle_orden(orderId,itemType,name,qty,unitPrice) VALUES(?,?,?,?,?)");
    foreach ($parts as $p) $stmt->execute([$orderId, 'part', $p['name'] ?? '', $p['qty'] ?? 0, $p['unitPrice'] ?? 0]);
    foreach ($services as $s) $stmt->execute([$orderId, 'service', $s['description'] ?? $s['name'] ?? '', $s['qty'] ?? 1, $s['price'] ?? 0]);
}

switch ($a) {
    case 'listar':
        $all = isset($_GET['all']) && $_GET['all'] === '1';
        $sql = "
            SELECT o.id, o.number, o.status, o.entryDate, o.estimatedDate, o.total, o.locked, o.active,
                   c.name as cliente_name, c.phone as cliente_phone, m.plate, m.model as moto_model
            FROM ordenes o
            LEFT JOIN clientes c ON c.id=o.customerId
            LEFT JOIN motos m ON m.id=o.bikeId
            WHERE o.active=1" . ($all ? '' : " AND o.status != 'entregada'") . "
            ORDER BY o.id DESC
        ";
        $rows = $db->query($sql)->fetchAll();
        foreach ($rows as &$r) { $r['locked'] = (bool)$r['locked']; $r['total'] = (float)$r['total']; }
        respond($rows);

    case 'get':
        $id = (int)($_GET['id'] ?? $i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $orden = getOrden($db, $id);
        if (!$orden) error('Orden no encontrada', 404);
        // También devolver lista de productos para el selector
        $productos = $db->query("SELECT id,code,name,stock,price,shelf FROM productos WHERE active=1 ORDER BY name")->fetchAll();
        foreach ($productos as &$p) { $p['stock'] = (int)$p['stock']; $p['price'] = (float)$p['price']; }
        $orden['_productos'] = $productos;
        respond($orden);

    case 'crear':
        // Crea cliente + moto + orden en una transacción
        $nombre = trim($i['nombre'] ?? '');
        $telefono = trim($i['telefono'] ?? '');
        $placa = strtoupper(trim($i['placa'] ?? ''));
        $problema = trim($i['problema'] ?? '');
        if (!$nombre || !$telefono || !$placa || !$problema) error('Completa todos los campos');

        $db->beginTransaction();
        try {
            $db->prepare("INSERT INTO clientes(name,phone,active,createdAt) VALUES(?,?,1,?)")->execute([$nombre, $telefono, todayISO()]);
            $customerId = (int)$db->lastInsertId();
            $db->prepare("INSERT INTO motos(customerId,plate,model,createdAt,active) VALUES(?,?,'',?,1)")->execute([$customerId, $placa, todayISO()]);
            $bikeId = (int)$db->lastInsertId();
            $n = nextCounter('order');
            $number = formatOrderNumber($n);
            $db->prepare("INSERT INTO ordenes(number,customerId,bikeId,problem,status,entryDate,parts,services,evidences,locked,total,active) VALUES(?,?,?,?,'ingresada',?,'[]','[]','[]',0,0,1)")->execute([$number, $customerId, $bikeId, $problema, todayISO()]);
            $orderId = (int)$db->lastInsertId();
            $db->commit();

            $msg = buildTemplate('ingreso', ['cliente' => $nombre, 'placa' => $placa, 'moto' => '', 'orden' => $number]);
            queueWhatsApp('ingreso', $telefono, $msg, $orderId);

            respond(['ok' => true, 'id' => $orderId, 'number' => $number]);
        } catch (Exception $e) {
            $db->rollBack();
            error('Error al crear orden: ' . $e->getMessage());
        }

    case 'actualizar_estado':
        $id = (int)($i['id'] ?? 0);
        $status = $i['status'] ?? '';
        if (!$id || !$status) error('Datos requeridos');
        $orden = getOrden($db, $id);
        if (!$orden) error('Orden no encontrada', 404);
        if ($orden['locked']) error('Orden bloqueada');
        $db->prepare("UPDATE ordenes SET status=? WHERE id=?")->execute([$status, $id]);

        $tipo = ($status === 'lista') ? 'finalizacion' : 'proceso';
        $msg = buildTemplate($tipo, [
            'cliente' => $orden['cliente_name'], 'placa' => $orden['plate'],
            'moto' => $orden['moto_model'], 'orden' => $orden['number'],
            'estado' => $STATUS_LABELS[$status] ?? $status,
        ]);
        queueWhatsApp($tipo, $orden['cliente_phone'], $msg, $id);
        respond(['ok' => true]);

    case 'actualizar_campo':
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden bloqueada');
        $allowed = ['problem', 'estimatedDate', 'notes'];
        $updates = [];
        $vals = [];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $i)) { $updates[] = "$f=?"; $vals[] = $i[$f]; }
        }
        if (empty($updates)) error('Nada que actualizar');
        $vals[] = $id;
        $db->prepare("UPDATE ordenes SET " . implode(',', $updates) . " WHERE id=?")->execute($vals);
        respond(['ok' => true]);

    case 'agregar_parte':
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden bloqueada');
        $prodId = (int)($i['productId'] ?? 0);
        if (!$prodId) error('Producto requerido');
        $prod = $db->prepare("SELECT * FROM productos WHERE id=? AND active=1");
        $prod->execute([$prodId]);
        $p = $prod->fetch();
        if (!$p) error('Producto no encontrado');
        if ((int)$p['stock'] <= 0) error('Sin stock');
        $parts = $orden['parts'];
        $found = false;
        foreach ($parts as &$part) {
            if ((int)$part['productId'] === $prodId) { $part['qty']++; $found = true; break; }
        }
        if (!$found) $parts[] = ['productId' => $prodId, 'name' => $p['name'], 'qty' => 1, 'unitPrice' => (float)$p['price']];
        $total = array_sum(array_map(fn($x) => $x['qty'] * $x['unitPrice'], $parts)) + array_sum(array_map(fn($x) => $x['price'], $orden['services']));
        $db->prepare("UPDATE ordenes SET parts=?,total=? WHERE id=?")->execute([json_encode($parts), $total, $id]);
        syncDetalle($db, $id, $parts, $orden['services']);
        respond(['ok' => true, 'parts' => $parts, 'total' => $total]);

    case 'quitar_parte':
        $id = (int)($i['id'] ?? 0);
        $idx = (int)($i['idx'] ?? -1);
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden bloqueada');
        $parts = array_values(array_filter($orden['parts'], fn($_, $k) => $k !== $idx, ARRAY_FILTER_USE_BOTH));
        $total = array_sum(array_map(fn($x) => $x['qty'] * $x['unitPrice'], $parts)) + array_sum(array_map(fn($x) => $x['price'], $orden['services']));
        $db->prepare("UPDATE ordenes SET parts=?,total=? WHERE id=?")->execute([json_encode($parts), $total, $id]);
        syncDetalle($db, $id, $parts, $orden['services']);
        respond(['ok' => true, 'parts' => $parts, 'total' => $total]);

    case 'actualizar_qty':
        $id = (int)($i['id'] ?? 0);
        $idx = (int)($i['idx'] ?? 0);
        $qty = max(1, (int)($i['qty'] ?? 1));
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden bloqueada');
        $parts = $orden['parts'];
        if (!isset($parts[$idx])) error('Índice inválido');
        $parts[$idx]['qty'] = $qty;
        $total = array_sum(array_map(fn($x) => $x['qty'] * $x['unitPrice'], $parts)) + array_sum(array_map(fn($x) => $x['price'], $orden['services']));
        $db->prepare("UPDATE ordenes SET parts=?,total=? WHERE id=?")->execute([json_encode($parts), $total, $id]);
        syncDetalle($db, $id, $parts, $orden['services']);
        respond(['ok' => true, 'parts' => $parts, 'total' => $total]);

    case 'agregar_servicio':
        $id = (int)($i['id'] ?? 0);
        $desc = trim($i['description'] ?? '');
        $price = (float)($i['price'] ?? 0);
        if (!$id || !$desc) error('Datos requeridos');
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden bloqueada');
        $services = $orden['services'];
        $services[] = ['description' => $desc, 'price' => $price];
        $total = array_sum(array_map(fn($x) => $x['qty'] * $x['unitPrice'], $orden['parts'])) + array_sum(array_map(fn($x) => $x['price'], $services));
        $db->prepare("UPDATE ordenes SET services=?,total=? WHERE id=?")->execute([json_encode($services), $total, $id]);
        syncDetalle($db, $id, $orden['parts'], $services);
        respond(['ok' => true, 'services' => $services, 'total' => $total]);

    case 'quitar_servicio':
        $id = (int)($i['id'] ?? 0);
        $idx = (int)($i['idx'] ?? -1);
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden bloqueada');
        $services = array_values(array_filter($orden['services'], fn($_, $k) => $k !== $idx, ARRAY_FILTER_USE_BOTH));
        $total = array_sum(array_map(fn($x) => $x['qty'] * $x['unitPrice'], $orden['parts'])) + array_sum(array_map(fn($x) => $x['price'], $services));
        $db->prepare("UPDATE ordenes SET services=?,total=? WHERE id=?")->execute([json_encode($services), $total, $id]);
        syncDetalle($db, $id, $orden['parts'], $services);
        respond(['ok' => true, 'services' => $services, 'total' => $total]);

    case 'agregar_evidencia':
        $id = (int)($i['id'] ?? 0);
        $dataUrl = $i['dataUrl'] ?? '';
        if (!$id || !$dataUrl) error('Datos requeridos');
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden bloqueada');
        $evidences = $orden['evidences'];
        $evidences[] = $dataUrl;
        $db->prepare("UPDATE ordenes SET evidences=? WHERE id=?")->execute([json_encode($evidences), $id]);
        respond(['ok' => true, 'count' => count($evidences)]);

    case 'quitar_evidencia':
        $id = (int)($i['id'] ?? 0);
        $idx = (int)($i['idx'] ?? -1);
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden bloqueada');
        $evidences = array_values(array_filter($orden['evidences'], fn($_, $k) => $k !== $idx, ARRAY_FILTER_USE_BOTH));
        $db->prepare("UPDATE ordenes SET evidences=? WHERE id=?")->execute([json_encode($evidences), $id]);
        respond(['ok' => true]);

    case 'finalizar':
        $id = (int)($i['id'] ?? 0);
        if (!$id) error('ID requerido');
        $orden = getOrden($db, $id);
        if ($orden['locked']) error('Orden ya finalizada');

        $db->beginTransaction();
        try {
            // Descontar stock
            foreach ($orden['parts'] as $p) {
                if (!empty($p['productId'])) {
                    $db->prepare("UPDATE productos SET stock=MAX(0,stock-?) WHERE id=?")->execute([$p['qty'], $p['productId']]);
                }
            }
            // Generar factura
            $sn = nextCounter('sale');
            $saleNum = formatSaleNumber($sn);
            $items = array_map(fn($p) => ['productId' => $p['productId'] ?? 0, 'name' => $p['name'], 'qty' => $p['qty'], 'unitPrice' => $p['unitPrice']], $orden['parts']);
            $db->prepare("INSERT INTO ventas(number,date,items,total,method,type,orderId) VALUES(?,?,?,?,'efectivo','orden',?)")->execute([$saleNum, todayISO(), json_encode($items), $orden['total'], $id]);
            // Caja
            $db->prepare("INSERT INTO caja(date,type,amount,concept,refType,refId) VALUES(?,?,?,?,?,?)")->execute([todayISO(), 'ingreso', $orden['total'], 'Orden ' . $orden['number'], 'orden', $id]);
            // Bloquear orden
            $db->prepare("UPDATE ordenes SET locked=1,status='entregada',total=? WHERE id=?")->execute([$orden['total'], $id]);
            $db->commit();

            $msg = buildTemplate('finalizacion', ['cliente' => $orden['cliente_name'], 'placa' => $orden['plate'], 'moto' => $orden['moto_model'], 'orden' => $orden['number']]);
            queueWhatsApp('finalizacion', $orden['cliente_phone'], $msg, $id);

            respond(['ok' => true, 'factura' => $saleNum]);
        } catch (Exception $e) {
            $db->rollBack();
            error('Error al finalizar: ' . $e->getMessage());
        }

    default:
        error('Acción no reconocida');
}
