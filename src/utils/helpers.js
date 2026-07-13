// ======================================================
// Helpers comunes para formateo de fechas y respuestas
// ======================================================

/**
 * Convierte un string de fecha/hora de MySQL ("YYYY-MM-DD HH:mm:ss")
 * al formato ISO 8601 ("YYYY-MM-DDTHH:mm:ss") que espera el frontend.
 * Si el valor es null/undefined, lo devuelve tal cual.
 */
export function toISOStringLocal(value) {
    if (value === null || value === undefined) return value;
    const str = String(value);
    if (str.includes('T')) return str; // ya está en ISO
    return str.replace(' ', 'T');
}

/**
 * Formatea un objeto de proveedor para la respuesta.
 */
export function formatProveedor(row) {
    return {
        id_proveedor: row.id_proveedor,
        nombre: row.nombre,
        ruc: row.ruc,
        rubro: row.rubro,
        telefono: row.telefono,
        fecha_creacion: toISOStringLocal(row.fecha_creacion)
    };
}

/**
 * Calcula si una línea de detalle tiene discrepancia.
 * Solo aplica cuando la línea ya fue entregada.
 */
export function calcularDiscrepancia(detalle) {
    if (detalle.estado !== 'ENTREGADO') return false;
    const recibida = Number(detalle.cantidad_recibida ?? 0);
    const bonifRecibida = Number(detalle.cantidad_bonificada_recibida ?? 0);
    const pedida = Number(detalle.cantidad_pedida);
    const bonifPedida = Number(detalle.cantidad_bonificada ?? 0);
    return recibida < pedida || bonifRecibida < bonifPedida;
}

/**
 * Calcula el estado general de un pedido a partir de sus detalles.
 * Estados posibles: PENDIENTE, PARCIAL, COMPLETO, RECHAZADO.
 */
export function calcularEstadoGeneral(detalles) {
    if (!detalles || detalles.length === 0) return 'PENDIENTE';

    const estados = detalles.map(d => d.estado);

    const todosEntregado = estados.every(e => e === 'ENTREGADO');
    const todosRechazado = estados.every(e => e === 'RECHAZADO');
    const todosPendiente = estados.every(e => e === 'PENDIENTE');

    if (todosEntregado) return 'COMPLETO';
    if (todosRechazado) return 'RECHAZADO';
    if (todosPendiente) return 'PENDIENTE';

    return 'PARCIAL';
}

/**
 * Formatea una línea de detalle para la respuesta.
 */
export function formatDetalle(row) {
    return {
        id_pedido_detalle: row.id_pedido_detalle,
        producto: row.producto,
        cantidad_pedida: Number(row.cantidad_pedida),
        precio_unitario: Number(row.precio_unitario),
        cantidad_bonificada: Number(row.cantidad_bonificada ?? 0),
        descripcion_promocion: row.descripcion_promocion,
        estado: row.estado,
        cantidad_recibida: row.cantidad_recibida !== null ? Number(row.cantidad_recibida) : null,
        cantidad_bonificada_recibida: row.cantidad_bonificada_recibida !== null ? Number(row.cantidad_bonificada_recibida) : null,
        fecha_recepcion: toISOStringLocal(row.fecha_recepcion),
        observaciones: row.observaciones,
        tiene_discrepancia: calcularDiscrepancia(row)
    };
}

/**
 * Formatea una cabecera de pedido para listados (GET /api/pedidos).
 * El contrato solo incluye estos campos.
 */
export function formatPedidoHeader(row) {
    const total = Number(row.total_pedido);
    const pagado = Number(row.monto_pagado ?? 0);
    return {
        id_pedido: row.id_pedido,
        proveedor: row.proveedor,
        fecha_pedido: toISOStringLocal(row.fecha_pedido),
        fecha_entrega_estimada: row.fecha_entrega_estimada,
        total_pedido: total,
        monto_pagado: pagado,
        saldo_pendiente: Number((total - pagado).toFixed(2)),
        estado_pago: row.estado_pago,
        estado_general: row.estado_general
    };
}

/**
 * Formatea una línea de detalle para la respuesta de recepción (PATCH).
 * El contrato solo incluye estos campos.
 */
export function formatRecepcionDetalle(row) {
    return {
        id_pedido_detalle: row.id_pedido_detalle,
        estado: row.estado,
        cantidad_recibida: row.cantidad_recibida !== null ? Number(row.cantidad_recibida) : null,
        cantidad_bonificada_recibida: row.cantidad_bonificada_recibida !== null ? Number(row.cantidad_bonificada_recibida) : null,
        fecha_recepcion: toISOStringLocal(row.fecha_recepcion),
        observaciones: row.observaciones,
        tiene_discrepancia: calcularDiscrepancia(row)
    };
}

/**
 * Formatea un pedido completo para la respuesta (con detalle).
 */
export function formatPedidoCompleto(row, detalles) {
    const total = Number(row.total_pedido);
    const pagado = Number(row.monto_pagado ?? 0);
    return {
        id_pedido: row.id_pedido,
        id_proveedor: row.id_proveedor,
        fecha_pedido: toISOStringLocal(row.fecha_pedido),
        fecha_entrega_estimada: row.fecha_entrega_estimada,
        total_pedido: total,
        monto_pagado: pagado,
        saldo_pendiente: Number((total - pagado).toFixed(2)),
        estado_pago: row.estado_pago,
        observaciones: row.observaciones,
        estado_general: calcularEstadoGeneral(detalles),
        detalle: detalles.map(formatDetalle)
    };
}

/**
 * Helper para respuestas de error consistentes con el resto del proyecto.
 */
export function errorResponse(res, status, message, details) {
    const payload = { error: message };
    if (details !== undefined) payload.details = details;
    return res.status(status).json(payload);
}
