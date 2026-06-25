import { pool } from '../db.js';
import {
    formatPedidoCompleto,
    formatPedidoHeader,
    formatDetalle,
    formatRecepcionDetalle,
    calcularEstadoGeneral,
    calcularDiscrepancia,
    toISOStringLocal,
    errorResponse
} from '../utils/helpers.js';

function validarDetalle(detalle) {
    if (!Array.isArray(detalle) || detalle.length === 0) {
        return 'El detalle del pedido es requerido y debe ser un array no vacío';
    }

    for (const item of detalle) {
        if (!item.producto || String(item.producto).trim() === '') {
            return 'Cada línea de detalle debe tener un producto';
        }
        if (item.cantidad_pedida === undefined || isNaN(Number(item.cantidad_pedida)) || Number(item.cantidad_pedida) < 0) {
            return 'Cada línea de detalle debe tener una cantidad_pedida numérica mayor o igual a 0';
        }
        if (item.precio_unitario === undefined || isNaN(Number(item.precio_unitario)) || Number(item.precio_unitario) < 0) {
            return 'Cada línea de detalle debe tener un precio_unitario numérico mayor o igual a 0';
        }
    }

    return null;
}

async function existeProveedor(idProveedor, connection) {
    const conn = connection || pool;
    const [rows] = await conn.query(
        'SELECT id_proveedor FROM proveedores WHERE id_proveedor = ?',
        [idProveedor]
    );
    return rows.length > 0;
}

async function existePedido(idPedido, connection) {
    const conn = connection || pool;
    const [rows] = await conn.query(
        'SELECT * FROM pedidos WHERE id_pedido = ?',
        [idPedido]
    );
    return rows.length > 0 ? rows[0] : null;
}

async function obtenerDetallesPedido(idPedido, connection) {
    const conn = connection || pool;
    const [rows] = await conn.query(
        'SELECT * FROM pedido_detalle WHERE id_pedido = ? ORDER BY id_pedido_detalle ASC',
        [idPedido]
    );
    return rows;
}

function construirDetallesInsert(idPedido, detalle) {
    return detalle.map(item => ({
        id_pedido: idPedido,
        producto: item.producto,
        cantidad_pedida: Number(item.cantidad_pedida),
        precio_unitario: Number(item.precio_unitario),
        cantidad_bonificada: Number(item.cantidad_bonificada ?? 0),
        descripcion_promocion: item.descripcion_promocion || null,
        estado: 'PENDIENTE',
        cantidad_recibida: null,
        cantidad_bonificada_recibida: null,
        fecha_recepcion: null,
        observaciones: item.observaciones || null
    }));
}

async function insertarDetalles(connection, idPedido, detalle) {
    const detallesInsert = construirDetallesInsert(idPedido, detalle);

    for (const item of detallesInsert) {
        await connection.query(
            `INSERT INTO pedido_detalle
             (id_pedido, producto, cantidad_pedida, precio_unitario, cantidad_bonificada,
              descripcion_promocion, estado, cantidad_recibida, cantidad_bonificada_recibida,
              fecha_recepcion, observaciones)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.id_pedido, item.producto, item.cantidad_pedida, item.precio_unitario,
                item.cantidad_bonificada, item.descripcion_promocion, item.estado,
                item.cantidad_recibida, item.cantidad_bonificada_recibida, item.fecha_recepcion,
                item.observaciones
            ]
        );
    }

    return detallesInsert.map((item, index) => ({
        id_pedido_detalle: 'nuevo', // se reemplaza al leer de la BD
        ...item
    }));
}

function calcularTotalPedido(detalle) {
    return detalle.reduce((total, item) => {
        return total + (Number(item.cantidad_pedida) * Number(item.precio_unitario));
    }, 0);
}

// POST /api/pedidos
export async function crearPedido(req, res) {
    const { id_proveedor, fecha_pedido, fecha_entrega_estimada, observaciones, detalle } = req.body;

    if (!id_proveedor) {
        return errorResponse(res, 400, 'El campo id_proveedor es requerido');
    }
    if (!fecha_pedido) {
        return errorResponse(res, 400, 'El campo fecha_pedido es requerido');
    }
    if (!fecha_entrega_estimada) {
        return errorResponse(res, 400, 'El campo fecha_entrega_estimada es requerido');
    }

    const errorDetalle = validarDetalle(detalle);
    if (errorDetalle) {
        return errorResponse(res, 400, errorDetalle);
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        if (!(await existeProveedor(id_proveedor, connection))) {
            await connection.rollback();
            return errorResponse(res, 404, 'Proveedor no encontrado');
        }

        const total_pedido = calcularTotalPedido(detalle);

        const [result] = await connection.query(
            `INSERT INTO pedidos
             (id_proveedor, fecha_pedido, fecha_entrega_estimada, total_pedido, observaciones, fecha_creacion)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [id_proveedor, fecha_pedido, fecha_entrega_estimada, total_pedido, observaciones || null]
        );

        const idPedido = result.insertId;

        await insertarDetalles(connection, idPedido, detalle);

        const pedidoRow = await existePedido(idPedido, connection);
        const detallesRows = await obtenerDetallesPedido(idPedido, connection);

        await connection.commit();

        res.status(201).json(formatPedidoCompleto(pedidoRow, detallesRows));
    } catch (error) {
        await connection.rollback();
        return errorResponse(res, 500, 'Error al crear pedido', error.message);
    } finally {
        connection.release();
    }
}

// GET /api/pedidos?id_proveedor=&estado_general=&desde=&hasta=
export async function listarPedidos(req, res) {
    const { id_proveedor, estado_general, desde, hasta } = req.query;

    try {
        let query = `
            SELECT
                p.*,
                pr.nombre AS proveedor,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM pedido_detalle pd
                        WHERE pd.id_pedido = p.id_pedido AND pd.estado = 'PENDIENTE'
                    ) THEN 'PENDIENTE'
                    ELSE 'COMPLETO'
                END AS estado_general
            FROM pedidos p
            JOIN proveedores pr ON pr.id_proveedor = p.id_proveedor
            WHERE 1=1
        `;
        const params = [];
        const havingParams = [];
        let havingClause = '';

        if (id_proveedor) {
            query += ' AND p.id_proveedor = ?';
            params.push(id_proveedor);
        }

        if (desde) {
            query += ' AND DATE(p.fecha_pedido) >= ?';
            params.push(desde);
        }

        if (hasta) {
            query += ' AND DATE(p.fecha_pedido) <= ?';
            params.push(hasta);
        }

        if (estado_general) {
            havingClause = ' HAVING estado_general = ?';
            havingParams.push(estado_general);
        }

        query += havingClause;
        query += ' ORDER BY p.fecha_pedido DESC';

        const [rows] = await pool.query(query, [...params, ...havingParams]);
        res.json(rows.map(formatPedidoHeader));
    } catch (error) {
        return errorResponse(res, 500, 'Error al listar pedidos', error.message);
    }
}

// GET /api/pedidos/:id
export async function obtenerPedido(req, res) {
    const { id } = req.params;

    try {
        const pedidoRow = await existePedido(id);
        if (!pedidoRow) {
            return errorResponse(res, 404, 'Pedido no encontrado');
        }

        const detallesRows = await obtenerDetallesPedido(id);
        res.json(formatPedidoCompleto(pedidoRow, detallesRows));
    } catch (error) {
        return errorResponse(res, 500, 'Error al obtener pedido', error.message);
    }
}

// PUT /api/pedidos/:id
export async function actualizarPedido(req, res) {
    const { id } = req.params;
    const { id_proveedor, fecha_pedido, fecha_entrega_estimada, observaciones, detalle } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const pedidoActual = await existePedido(id, connection);
        if (!pedidoActual) {
            await connection.rollback();
            return errorResponse(res, 404, 'Pedido no encontrado');
        }

        // Regla de negocio 2: no se permite editar si alguna línea ya fue entregada
        const detallesActuales = await obtenerDetallesPedido(id, connection);
        const tieneEntregado = detallesActuales.some(d => d.estado === 'ENTREGADO');
        if (tieneEntregado) {
            await connection.rollback();
            return errorResponse(res, 409, 'No se puede editar el pedido porque tiene líneas ya recepcionadas');
        }

        const nuevoIdProveedor = id_proveedor !== undefined ? id_proveedor : pedidoActual.id_proveedor;
        const nuevaFechaPedido = fecha_pedido !== undefined ? fecha_pedido : pedidoActual.fecha_pedido;
        const nuevaFechaEntrega = fecha_entrega_estimada !== undefined ? fecha_entrega_estimada : pedidoActual.fecha_entrega_estimada;
        const nuevasObservaciones = observaciones !== undefined ? observaciones : pedidoActual.observaciones;

        if (!(await existeProveedor(nuevoIdProveedor, connection))) {
            await connection.rollback();
            return errorResponse(res, 404, 'Proveedor no encontrado');
        }

        let nuevoTotal = Number(pedidoActual.total_pedido);

        if (detalle !== undefined) {
            const errorDetalle = validarDetalle(detalle);
            if (errorDetalle) {
                await connection.rollback();
                return errorResponse(res, 400, errorDetalle);
            }

            await connection.query(
                'DELETE FROM pedido_detalle WHERE id_pedido = ?',
                [id]
            );

            await insertarDetalles(connection, id, detalle);
            nuevoTotal = calcularTotalPedido(detalle);
        }

        await connection.query(
            `UPDATE pedidos
             SET id_proveedor = ?, fecha_pedido = ?, fecha_entrega_estimada = ?,
                 total_pedido = ?, observaciones = ?
             WHERE id_pedido = ?`,
            [nuevoIdProveedor, nuevaFechaPedido, nuevaFechaEntrega, nuevoTotal, nuevasObservaciones, id]
        );

        const pedidoRow = await existePedido(id, connection);
        const detallesRows = await obtenerDetallesPedido(id, connection);

        await connection.commit();

        res.json(formatPedidoCompleto(pedidoRow, detallesRows));
    } catch (error) {
        await connection.rollback();
        return errorResponse(res, 500, 'Error al actualizar pedido', error.message);
    } finally {
        connection.release();
    }
}

// DELETE /api/pedidos/:id
export async function eliminarPedido(req, res) {
    const { id } = req.params;

    try {
        const [result] = await pool.query(
            'DELETE FROM pedidos WHERE id_pedido = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return errorResponse(res, 404, 'Pedido no encontrado');
        }

        res.json({ mensaje: 'Pedido eliminado correctamente' });
    } catch (error) {
        return errorResponse(res, 500, 'Error al eliminar pedido', error.message);
    }
}

// PATCH /api/pedidos/:idPedido/detalle/:idDetalle/recepcionar
export async function recepcionarDetalle(req, res) {
    const { idPedido, idDetalle } = req.params;
    const { cantidad_recibida, cantidad_bonificada_recibida, observaciones } = req.body;

    if (cantidad_recibida === undefined || isNaN(Number(cantidad_recibida)) || Number(cantidad_recibida) < 0) {
        return errorResponse(res, 400, 'El campo cantidad_recibida es requerido y debe ser numérico mayor o igual a 0');
    }
    if (cantidad_bonificada_recibida === undefined || isNaN(Number(cantidad_bonificada_recibida)) || Number(cantidad_bonificada_recibida) < 0) {
        return errorResponse(res, 400, 'El campo cantidad_bonificada_recibida es requerido y debe ser numérico mayor o igual a 0');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const pedido = await existePedido(idPedido, connection);
        if (!pedido) {
            await connection.rollback();
            return errorResponse(res, 404, 'Pedido no encontrado');
        }

        const [detalleRows] = await connection.query(
            'SELECT * FROM pedido_detalle WHERE id_pedido_detalle = ? AND id_pedido = ?',
            [idDetalle, idPedido]
        );

        if (detalleRows.length === 0) {
            await connection.rollback();
            return errorResponse(res, 404, 'Línea de detalle no encontrada para este pedido');
        }

        await connection.query(
            `UPDATE pedido_detalle
             SET cantidad_recibida = ?, cantidad_bonificada_recibida = ?,
                 observaciones = ?, estado = 'ENTREGADO', fecha_recepcion = NOW()
             WHERE id_pedido_detalle = ?`,
            [cantidad_recibida, cantidad_bonificada_recibida, observaciones || null, idDetalle]
        );

        const [updatedRows] = await connection.query(
            'SELECT * FROM pedido_detalle WHERE id_pedido_detalle = ?',
            [idDetalle]
        );

        await connection.commit();

        res.json(formatRecepcionDetalle(updatedRows[0]));
    } catch (error) {
        await connection.rollback();
        return errorResponse(res, 500, 'Error al recepcionar detalle', error.message);
    } finally {
        connection.release();
    }
}

// GET /api/pedidos/discrepancias?id_proveedor=&desde=&hasta=
export async function listarDiscrepancias(req, res) {
    const { id_proveedor, desde, hasta } = req.query;

    try {
        let query = `
            SELECT
                p.id_pedido,
                pr.nombre AS proveedor,
                pd.producto,
                pd.cantidad_pedida,
                pd.cantidad_recibida,
                pd.cantidad_bonificada,
                pd.cantidad_bonificada_recibida,
                pd.observaciones,
                pd.fecha_recepcion
            FROM pedido_detalle pd
            JOIN pedidos p ON p.id_pedido = pd.id_pedido
            JOIN proveedores pr ON pr.id_proveedor = p.id_proveedor
            WHERE pd.estado = 'ENTREGADO'
              AND (
                  pd.cantidad_recibida < pd.cantidad_pedida
                  OR pd.cantidad_bonificada_recibida < pd.cantidad_bonificada
              )
        `;
        const params = [];

        if (id_proveedor) {
            query += ' AND p.id_proveedor = ?';
            params.push(id_proveedor);
        }

        if (desde) {
            query += ' AND DATE(pd.fecha_recepcion) >= ?';
            params.push(desde);
        }

        if (hasta) {
            query += ' AND DATE(pd.fecha_recepcion) <= ?';
            params.push(hasta);
        }

        query += ' ORDER BY pd.fecha_recepcion DESC';

        const [rows] = await pool.query(query, params);

        res.json(rows.map(row => ({
            id_pedido: row.id_pedido,
            proveedor: row.proveedor,
            producto: row.producto,
            cantidad_pedida: Number(row.cantidad_pedida),
            cantidad_recibida: Number(row.cantidad_recibida),
            cantidad_bonificada: Number(row.cantidad_bonificada),
            cantidad_bonificada_recibida: Number(row.cantidad_bonificada_recibida),
            observaciones: row.observaciones,
            fecha_recepcion: toISOStringLocal(row.fecha_recepcion)
        })));
    } catch (error) {
        return errorResponse(res, 500, 'Error al listar discrepancias', error.message);
    }
}
