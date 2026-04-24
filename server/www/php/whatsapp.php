<?php
require_once __DIR__ . '/config.php';
$a = action();
$i = input();
$db = getDB();
define('WA_SECRET', 'wa_internal_2025');

switch ($a) {
    case 'pendientes':
        if (($_GET['secret'] ?? $i['secret'] ?? '') !== WA_SECRET) error('Acceso no autorizado', 403);
        $stmt = $db->query("SELECT * FROM whatsapp_mensajes WHERE estado='pendiente' ORDER BY id ASC LIMIT 50");
        $pending = $stmt->fetchAll();

        // Calcular recordatorios: órdenes listas hace más de 3 días sin recoger
        $recordatorios = $db->query("
            SELECT o.id, o.number, c.name as cliente_name, c.phone as cliente_phone, m.plate, m.model as moto_model
            FROM ordenes o
            LEFT JOIN clientes c ON c.id=o.customerId
            LEFT JOIN motos m ON m.id=o.bikeId
            WHERE o.status='lista' AND o.active=1 AND o.locked=0
              AND DATE(o.entryDate) <= DATE('now', '-3 days')
              AND NOT EXISTS (
                SELECT 1 FROM whatsapp_mensajes wm
                WHERE wm.entidad_id=o.id AND wm.tipo='recordatorio'
                AND DATE(wm.createdAt) >= DATE('now', '-1 days')
              )
        ")->fetchAll();

        foreach ($recordatorios as $r) {
            if (empty($r['cliente_phone'])) continue;
            $msg = "Hola {$r['cliente_name']}, te recordamos que tu moto *{$r['plate']}* ({$r['moto_model']}) lleva varios días lista en el taller. ¡Puedes venir a recogerla cuando gustes!";
            $telefono = $r['cliente_phone'];
            $modo = getConfig('modo_prueba','0');
            if ($modo === '1') { $numPrueba = getConfig('numero_prueba',''); if ($numPrueba) $telefono = $numPrueba; }
            $stmt2 = $db->prepare("INSERT INTO whatsapp_mensajes(entidad_id,tipo,telefono,mensaje,estado,createdAt) VALUES(?,?,?,?,'pendiente',?)");
            $stmt2->execute([$r['id'], 'recordatorio', $telefono, $msg, nowISO()]);
            $pending[] = ['id' => (int)$db->lastInsertId(), 'telefono' => $telefono, 'mensaje' => $msg, 'tipo' => 'recordatorio'];
        }

        respond($pending);

    case 'log_enviado':
        if (($_GET['secret'] ?? $i['secret'] ?? '') !== WA_SECRET) error('Acceso no autorizado', 403);
        $id = (int)($i['id'] ?? 0);
        $estado = $i['estado'] ?? 'enviado';
        $errMsg = $i['error'] ?? null;
        if (!$id) error('ID requerido');
        $db->prepare("UPDATE whatsapp_mensajes SET estado=?,error_msg=?,fecha_envio=? WHERE id=?")->execute([$estado, $errMsg, nowISO(), $id]);
        respond(['ok' => true]);

    case 'config_get':
        requireAuth();
        respond([
            'modo_prueba' => getConfig('modo_prueba','0'),
            'numero_prueba' => getConfig('numero_prueba',''),
        ]);

    case 'config_set':
        requireAdmin();
        $modo = $i['modo_prueba'] ?? null;
        $num = $i['numero_prueba'] ?? null;
        if ($modo !== null) $db->prepare("INSERT OR REPLACE INTO configuracion(clave,valor) VALUES('modo_prueba',?)")->execute([$modo ? '1' : '0']);
        if ($num !== null) $db->prepare("INSERT OR REPLACE INTO configuracion(clave,valor) VALUES('numero_prueba',?)")->execute([$num]);
        respond(['ok' => true]);

    case 'send_test':
        requireAuth();
        $telefono = trim($i['telefono'] ?? getConfig('numero_prueba',''));
        if (!$telefono) error('Número requerido');
        queueWhatsApp('prueba', $telefono, '✅ Mensaje de prueba desde MotoFlow Pro. El sistema de WhatsApp funciona correctamente.');
        respond(['ok' => true]);

    case 'history':
        requireAuth();
        $rows = $db->query("SELECT * FROM whatsapp_mensajes ORDER BY id DESC LIMIT 50")->fetchAll();
        foreach ($rows as &$r) { unset($r['mensaje']); } // no exponemos el texto completo en el listado
        // Incluir mensaje en historial
        $rows = $db->query("SELECT id,tipo,telefono,mensaje,estado,error_msg,fecha_envio,createdAt FROM whatsapp_mensajes ORDER BY id DESC LIMIT 50")->fetchAll();
        respond($rows);

    default:
        error('Acción no reconocida');
}
