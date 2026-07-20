import { pool } from '../db.js';
import { errorResponse } from '../utils/helpers.js';

// ======================================================
// Helpers internos
// ======================================================

async function esAdmin(connection, usuario) {
    const [rows] = await connection.query(
        'SELECT rol FROM usuarios WHERE usuario = ? LIMIT 1',
        [usuario]
    );
    return rows.length > 0 && rows[0].rol === 'Administrador';
}

async function usuarioExiste(connection, usuario, excluirId = null) {
    let query = 'SELECT id_usuario FROM usuarios WHERE usuario = ?';
    const params = [usuario];
    if (excluirId) {
        query += ' AND id_usuario != ?';
        params.push(excluirId);
    }
    const [rows] = await connection.query(query, params);
    return rows.length > 0;
}

function formatUsuario(row) {
    return {
        id_usuario: row.id_usuario,
        nombre: row.nombre,
        usuario: row.usuario,
        rol: row.rol,
        correo: row.correo
    };
}

// ======================================================
// Controladores
// ======================================================

export async function listarUsuarios(req, res) {
    try {
        const [rows] = await pool.query('SELECT * FROM usuarios ORDER BY id_usuario ASC');
        res.json(rows.map(formatUsuario));
    } catch (error) {
        return errorResponse(res, 500, 'Error al listar usuarios', error.message);
    }
}

export async function obtenerUsuario(req, res) {
    const { id } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM usuarios WHERE id_usuario = ? LIMIT 1',
            [id]
        );
        if (rows.length === 0) {
            return errorResponse(res, 404, 'Usuario no encontrado');
        }
        res.json(formatUsuario(rows[0]));
    } catch (error) {
        return errorResponse(res, 500, 'Error al obtener usuario', error.message);
    }
}

export async function crearUsuario(req, res) {
    const { nombre, usuario, contrasena, rol, correo } = req.body;
    const usuarioActual = req.usuario;

    if (!nombre || !usuario || !contrasena || !rol) {
        return errorResponse(res, 400, 'nombre, usuario, contrasena y rol son requeridos');
    }

    const connection = await pool.getConnection();
    try {
        const admin = await esAdmin(connection, usuarioActual);
        if (!admin) {
            return errorResponse(res, 403, 'Solo un administrador puede crear usuarios');
        }

        const existe = await usuarioExiste(connection, usuario);
        if (existe) {
            return errorResponse(res, 409, 'El nombre de usuario ya existe');
        }

        const [result] = await connection.query(
            `INSERT INTO usuarios (nombre, usuario, contrasena, rol, correo)
             VALUES (?, ?, ?, ?, ?)`,
            [nombre, usuario, contrasena, rol, correo || null]
        );

        await connection.commit();

        res.status(201).json({
            mensaje: 'Usuario creado correctamente',
            id_usuario: result.insertId,
            nombre,
            usuario,
            rol,
            correo: correo || null
        });
    } catch (error) {
        await connection.rollback();
        return errorResponse(res, 500, 'Error al crear usuario', error.message);
    } finally {
        connection.release();
    }
}

export async function actualizarUsuario(req, res) {
    const { id } = req.params;
    const { nombre, usuario, rol, correo } = req.body;
    const usuarioActual = req.usuario;

    if (!nombre && !usuario && !rol && correo === undefined) {
        return errorResponse(res, 400, 'Debe enviar al menos un campo para actualizar');
    }

    const connection = await pool.getConnection();
    try {
        const admin = await esAdmin(connection, usuarioActual);
        const [targetRows] = await connection.query(
            'SELECT usuario FROM usuarios WHERE id_usuario = ? LIMIT 1',
            [id]
        );

        if (targetRows.length === 0) {
            return errorResponse(res, 404, 'Usuario no encontrado');
        }

        // Solo admin puede editar otros usuarios; cualquiera puede editarse a si mismo
        if (!admin && targetRows[0].usuario !== usuarioActual) {
            return errorResponse(res, 403, 'No autorizado para editar este usuario');
        }

        // Solo admin puede cambiar el rol
        if (rol && !admin) {
            return errorResponse(res, 403, 'Solo un administrador puede cambiar roles');
        }

        if (usuario) {
            const existe = await usuarioExiste(connection, usuario, id);
            if (existe) {
                return errorResponse(res, 409, 'El nombre de usuario ya existe');
            }
        }

        const campos = [];
        const valores = [];
        if (nombre) { campos.push('nombre = ?'); valores.push(nombre); }
        if (usuario) { campos.push('usuario = ?'); valores.push(usuario); }
        if (rol) { campos.push('rol = ?'); valores.push(rol); }
        if (correo !== undefined) { campos.push('correo = ?'); valores.push(correo); }
        valores.push(id);

        await connection.query(
            `UPDATE usuarios SET ${campos.join(', ')} WHERE id_usuario = ?`,
            valores
        );

        await connection.commit();

        res.json({ mensaje: 'Usuario actualizado correctamente' });
    } catch (error) {
        await connection.rollback();
        return errorResponse(res, 500, 'Error al actualizar usuario', error.message);
    } finally {
        connection.release();
    }
}

export async function cambiarContrasena(req, res) {
    const { id } = req.params;
    const { contrasena } = req.body;
    const usuarioActual = req.usuario;

    if (!contrasena) {
        return errorResponse(res, 400, 'contrasena es requerida');
    }

    const connection = await pool.getConnection();
    try {
        const admin = await esAdmin(connection, usuarioActual);
        const [targetRows] = await connection.query(
            'SELECT usuario FROM usuarios WHERE id_usuario = ? LIMIT 1',
            [id]
        );

        if (targetRows.length === 0) {
            return errorResponse(res, 404, 'Usuario no encontrado');
        }

        if (!admin && targetRows[0].usuario !== usuarioActual) {
            return errorResponse(res, 403, 'No autorizado para cambiar esta contraseña');
        }

        await connection.query(
            'UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?',
            [contrasena, id]
        );

        await connection.commit();

        res.json({ mensaje: 'Contraseña actualizada correctamente' });
    } catch (error) {
        await connection.rollback();
        return errorResponse(res, 500, 'Error al cambiar contraseña', error.message);
    } finally {
        connection.release();
    }
}

export async function eliminarUsuario(req, res) {
    const { id } = req.params;
    const usuarioActual = req.usuario;

    const connection = await pool.getConnection();
    try {
        const admin = await esAdmin(connection, usuarioActual);
        if (!admin) {
            return errorResponse(res, 403, 'Solo un administrador puede eliminar usuarios');
        }

        const [targetRows] = await connection.query(
            'SELECT usuario FROM usuarios WHERE id_usuario = ? LIMIT 1',
            [id]
        );

        if (targetRows.length === 0) {
            return errorResponse(res, 404, 'Usuario no encontrado');
        }

        if (targetRows[0].usuario === usuarioActual) {
            return errorResponse(res, 400, 'No puedes eliminar tu propio usuario');
        }

        await connection.query(
            'DELETE FROM usuarios WHERE id_usuario = ?',
            [id]
        );

        await connection.commit();

        res.json({ mensaje: 'Usuario eliminado correctamente' });
    } catch (error) {
        await connection.rollback();
        return errorResponse(res, 500, 'Error al eliminar usuario', error.message);
    } finally {
        connection.release();
    }
}
