import { pool } from '../db.js';
import { errorResponse } from '../utils/helpers.js';

/**
 * Middleware de autenticación simple consistente con el proyecto.
 * Valida que el cliente envíe el header "x-usuario" y que exista
 * en la tabla `usuarios`. Si no, responde 401.
 *
 * Los endpoints existentes del proyecto validan el usuario directamente
 * en sus controladores; este middleware centraliza esa validación para
 * los nuevos módulos de proveedores y pedidos.
 */
export async function verificarUsuario(req, res, next) {
    try {
        const usuario = req.headers['x-usuario'];

        if (!usuario) {
            return errorResponse(res, 401, 'No autorizado: falta header x-usuario');
        }

        const [rows] = await pool.query(
            'SELECT usuario FROM `usuarios` WHERE `usuario` = ? LIMIT 1',
            [usuario]
        );

        if (rows.length === 0) {
            return errorResponse(res, 401, 'No autorizado: usuario no encontrado');
        }

        req.usuario = rows[0].usuario;
        next();
    } catch (error) {
        return errorResponse(res, 500, 'Error al validar autenticación', error.message);
    }
}
