<?php
require_once __DIR__ . '/config.php';

$a = action();
$db = getDB();

switch ($a) {
    case 'login':
        $i = input();
        $username = trim($i['username'] ?? '');
        $password = $i['password'] ?? '';
        if (!$username || !$password) error('Completa todos los campos');

        $stmt = $db->prepare("SELECT * FROM usuarios WHERE LOWER(username)=LOWER(?) AND active=1");
        $stmt->execute([$username]);
        $u = $stmt->fetch();

        if (!$u) error('Usuario o contraseña incorrectos', 401);

        // Soportar contraseñas en texto plano (admin inicial) y bcrypt
        $ok = ($u['password'] === $password) || password_verify($password, $u['password']);
        if (!$ok) error('Usuario o contraseña incorrectos', 401);

        // Si estaba en texto plano, actualizarla a bcrypt
        if ($u['password'] === $password) {
            $hash = password_hash($password, PASSWORD_BCRYPT);
            $db->prepare("UPDATE usuarios SET password=? WHERE id=?")->execute([$hash, $u['id']]);
        }

        $_SESSION['uid'] = $u['id'];
        $_SESSION['username'] = $u['username'];
        $_SESSION['nombre'] = $u['name'];
        $_SESSION['rol'] = $u['role'];
        respond(['ok' => true, 'uid' => $u['id'], 'nombre' => $u['name'], 'rol' => $u['role']]);

    case 'logout':
        session_destroy();
        respond(['ok' => true]);

    case 'status':
        if (!empty($_SESSION['uid'])) {
            respond(['uid' => $_SESSION['uid'], 'nombre' => $_SESSION['nombre'], 'rol' => $_SESSION['rol']]);
        }
        respond(['uid' => null]);

    case 'usuarios_listar':
        requireAdmin();
        $rows = $db->query("SELECT id,username,name,role,active FROM usuarios ORDER BY name")->fetchAll();
        respond($rows);

    case 'usuarios_crear':
        requireAdmin();
        $i = input();
        if (empty($i['username']) || empty($i['password']) || empty($i['name'])) error('Campos requeridos');
        $hash = password_hash($i['password'], PASSWORD_BCRYPT);
        $stmt = $db->prepare("INSERT INTO usuarios(username,password,name,role,active) VALUES(?,?,?,?,1)");
        $stmt->execute([$i['username'], $hash, $i['name'], $i['role'] ?? 'operador']);
        respond(['ok' => true, 'id' => $db->lastInsertId()]);

    case 'usuarios_actualizar':
        requireAdmin();
        $i = input();
        if (empty($i['id'])) error('ID requerido');
        $fields = [];
        $vals = [];
        if (!empty($i['name'])) { $fields[] = 'name=?'; $vals[] = $i['name']; }
        if (!empty($i['role'])) { $fields[] = 'role=?'; $vals[] = $i['role']; }
        if (isset($i['active'])) { $fields[] = 'active=?'; $vals[] = (int)$i['active']; }
        if (!empty($i['password'])) { $fields[] = 'password=?'; $vals[] = password_hash($i['password'], PASSWORD_BCRYPT); }
        if (empty($fields)) error('Nada que actualizar');
        $vals[] = $i['id'];
        $db->prepare("UPDATE usuarios SET " . implode(',', $fields) . " WHERE id=?")->execute($vals);
        respond(['ok' => true]);

    default:
        error('Acción no reconocida');
}
