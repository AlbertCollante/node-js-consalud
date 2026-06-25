import { pool } from '../db.js';
import { formatProveedor, errorResponse } from '../utils/helpers.js';

// POST /api/proveedores
export async function crearProveedor(req, res) {
    const { nombre, ruc, rubro, telefono } = req.body;

    if (!nombre || String(nombre).trim() === '') {
        return errorResponse(res, 400, 'El campo nombre es requerido');
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO proveedores (nombre, ruc, rubro, telefono, fecha_creacion)
             VALUES (?, ?, ?, ?, NOW())`,
            [nombre, ruc || null, rubro || null, telefono || null]
        );

        const [rows] = await pool.query(
            'SELECT * FROM proveedores WHERE id_proveedor = ?',
            [result.insertId]
        );

        res.status(201).json(formatProveedor(rows[0]));
    } catch (error) {
        return errorResponse(res, 500, 'Error al crear proveedor', error.message);
    }
}

// GET /api/proveedores?buscar=...
export async function listarProveedores(req, res) {
    const { buscar } = req.query;

    try {
        let query = 'SELECT * FROM proveedores';
        const params = [];

        if (buscar && String(buscar).trim() !== '') {
            query += ' WHERE nombre LIKE ? OR rubro LIKE ?';
            const like = `%${buscar}%`;
            params.push(like, like);
        }

        query += ' ORDER BY nombre ASC';

        const [rows] = await pool.query(query, params);
        res.json(rows.map(formatProveedor));
    } catch (error) {
        return errorResponse(res, 500, 'Error al listar proveedores', error.message);
    }
}

// GET /api/proveedores/:id
export async function obtenerProveedor(req, res) {
    const { id } = req.params;

    try {
        const [rows] = await pool.query(
            'SELECT * FROM proveedores WHERE id_proveedor = ?',
            [id]
        );

        if (rows.length === 0) {
            return errorResponse(res, 404, 'Proveedor no encontrado');
        }

        res.json(formatProveedor(rows[0]));
    } catch (error) {
        return errorResponse(res, 500, 'Error al obtener proveedor', error.message);
    }
}

// PUT /api/proveedores/:id
export async function actualizarProveedor(req, res) {
    const { id } = req.params;
    const { nombre, ruc, rubro, telefono } = req.body;

    if (!nombre || String(nombre).trim() === '') {
        return errorResponse(res, 400, 'El campo nombre es requerido');
    }

    try {
        const [result] = await pool.query(
            `UPDATE proveedores
             SET nombre = ?, ruc = ?, rubro = ?, telefono = ?
             WHERE id_proveedor = ?`,
            [nombre, ruc || null, rubro || null, telefono || null, id]
        );

        if (result.affectedRows === 0) {
            return errorResponse(res, 404, 'Proveedor no encontrado');
        }

        const [rows] = await pool.query(
            'SELECT * FROM proveedores WHERE id_proveedor = ?',
            [id]
        );

        res.json(formatProveedor(rows[0]));
    } catch (error) {
        return errorResponse(res, 500, 'Error al actualizar proveedor', error.message);
    }
}

// DELETE /api/proveedores/:id
export async function eliminarProveedor(req, res) {
    const { id } = req.params;

    try {
        const [result] = await pool.query(
            'DELETE FROM proveedores WHERE id_proveedor = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return errorResponse(res, 404, 'Proveedor no encontrado');
        }

        res.json({ mensaje: 'Proveedor eliminado correctamente' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
            return errorResponse(res, 409, 'No se puede eliminar el proveedor porque tiene pedidos asociados');
        }
        return errorResponse(res, 500, 'Error al eliminar proveedor', error.message);
    }
}
