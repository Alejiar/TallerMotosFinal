<?php
require_once __DIR__ . '/config.php';
requireAuth();
$db = getDB();
$today = todayISO();

$pendientes = (int)$db->query("SELECT COUNT(*) FROM ordenes WHERE status IN ('ingresada','diagnostico') AND active=1")->fetchColumn();
$en_proceso = (int)$db->query("SELECT COUNT(*) FROM ordenes WHERE status IN ('esperando_repuestos','reparacion') AND active=1")->fetchColumn();
$listas = (int)$db->query("SELECT COUNT(*) FROM ordenes WHERE status='lista' AND active=1")->fetchColumn();

$caja_hoy = $db->prepare("SELECT type, SUM(amount) as total FROM caja WHERE date=? GROUP BY type");
$caja_hoy->execute([$today]);
$caja = ['ingreso' => 0, 'egreso' => 0];
foreach ($caja_hoy->fetchAll() as $r) $caja[$r['type']] = (float)$r['total'];

$stock_bajo = $db->query("SELECT id,code,name,stock,minStock FROM productos WHERE active=1 AND stock<=minStock ORDER BY name")->fetchAll();
foreach ($stock_bajo as &$r) { $r['stock'] = (int)$r['stock']; $r['minStock'] = (int)$r['minStock']; }

// Últimas 5 órdenes activas
$ordenes_recientes = $db->query("
  SELECT o.id, o.number, o.status, o.entryDate, o.total, c.name as cliente, m.plate
  FROM ordenes o
  LEFT JOIN clientes c ON c.id=o.customerId
  LEFT JOIN motos m ON m.id=o.bikeId
  WHERE o.active=1 AND o.status != 'entregada'
  ORDER BY o.id DESC LIMIT 5
")->fetchAll();

// Top 5 productos más vendidos
$top_productos = $db->query("
  SELECT p.name, SUM(v_items.qty) as total_qty
  FROM ventas v
  JOIN json_each(v.items) as je
  JOIN json_extract(je.value, '$.productId') as pid
  JOIN json_extract(je.value, '$.name') as pname
  JOIN json_extract(je.value, '$.qty') as qty
  JOIN (SELECT id, name FROM productos) p ON p.id = CAST(pid AS INTEGER)
  GROUP BY p.id
  ORDER BY total_qty DESC
  LIMIT 5
") ;

// Top productos simple (alternativo sin json_each complejo)
$top_raw = $db->query("SELECT items FROM ventas")->fetchAll();
$prod_map = [];
foreach ($top_raw as $row) {
    $items = json_decode($row['items'], true) ?? [];
    foreach ($items as $it) {
        $k = $it['name'] ?? 'Desconocido';
        $prod_map[$k] = ($prod_map[$k] ?? 0) + ($it['qty'] ?? 1);
    }
}
arsort($prod_map);
$top_productos = array_slice(array_map(fn($k,$v) => ['name'=>$k,'qty'=>$v], array_keys($prod_map), $prod_map), 0, 5);

respond([
    'ordenes' => ['pendientes' => $pendientes, 'en_proceso' => $en_proceso, 'listas' => $listas],
    'caja' => ['ingresos' => $caja['ingreso'], 'egresos' => $caja['egreso'], 'balance' => $caja['ingreso'] - $caja['egreso']],
    'stock_bajo' => $stock_bajo,
    'ordenes_recientes' => $ordenes_recientes,
    'top_productos' => $top_productos,
]);
