import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { PORT } from './config.js';
import proveedoresRoutes from './routes/proveedores.routes.js';
import pedidosRoutes from './routes/pedidos.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';

const app = express();

app.use(cors());
app.use(express.json());

// API de bienvenida: Verifica que el servidor está activo
app.get('/', (req, res) => {
    console.log({
    DB_HOST,
    DB_USER,
    DB_NAME,
    DB_PORT
    });
    res.send('Welcome to server');
    
});

// API de prueba de conexión: Verifica que la base de datos está conectada
app.get('/ping', async (req, res) => {
    const [result] = await pool.query(`SELECT "Hello word" as RESULT`);
    //console.log(result);
    res.json(result[0]);
});

// API de autenticación: Valida usuario y contraseña, retorna rol y nombre
// Parámetros: user (usuario), contrasena (contraseña)
app.get('/simple-role', async (req, res) => {
    const { user, contrasena } = req.query;
    if (!user || !contrasena) {
        return res.status(400).json({ error: 'user y contrasena requeridos' });
    }

    const [rows] = await pool.query(
        'SELECT rol, nombre FROM `usuarios` WHERE `usuario` = ? AND contrasena = ? LIMIT 1',
        [user, contrasena]
    );

    if (rows.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado o contrasena incorrecta' });
    }

    res.json({ rol: rows[0].rol, nombre: rows[0].nombre });
});

// API para obtener datos del usuario: Busca el nombre de un usuario por su usuario
// Parámetro: usuario (nombre de usuario en el body)
app.post('/user', async (req, res) => {
    const { usuario } = req.body;

    if (!usuario) {
        return res.status(400).json({ error: 'usuario es requerido en el body' });
    }

    const [rows] = await pool.query(
        'SELECT nombre FROM `usuarios` WHERE `usuario` = ? LIMIT 1',
        [usuario]
    );

    if (rows.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ nombre: rows[0].nombre });
});

// API para listar usuarios: Retorna todos los usuarios registrados en el sistema
app.get('/users', async (req, res) => {
    const [result] = await pool.query(`SELECT * FROM usuarios`);
    //console.log(result);
    res.json(result);
});

// API para abrir turno: Crea un nuevo registro de apertura de turno con monto inicial y observaciones
// Parámetros: usuario, montoInicial, montoInicialYape, cuenta_efectivo, cuenta_yape, observaciones (opcional)
// El frontend envía los valores iniciales de las cuentas.
app.post('/apertura-turno', async (req, res) => {
    const { usuario, montoInicial, montoInicialYape, cuenta_efectivo, cuenta_yape, observaciones } = req.body;

    if (!usuario || montoInicial === undefined || montoInicialYape === undefined || cuenta_efectivo === undefined || cuenta_yape === undefined) {
        return res.status(400).json({
            error: 'usuario, montoInicial, montoInicialYape, cuenta_efectivo y cuenta_yape son requeridos'
        });
    }

    const montoInicialNum = Number(montoInicial);
    const montoInicialYapeNum = Number(montoInicialYape);
    const cuentaEfectivoNum = Number(cuenta_efectivo);
    const cuentaYapeNum = Number(cuenta_yape);

    if (isNaN(montoInicialNum) || isNaN(montoInicialYapeNum) || isNaN(cuentaEfectivoNum) || isNaN(cuentaYapeNum)) {
        return res.status(400).json({ error: 'montoInicial, montoInicialYape, cuenta_efectivo y cuenta_yape deben ser numéricos' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO aperturas_turno
             (fecha, usuario, montoInicial, monto_inicial_yape, cuenta_efectivo, cuenta_yape, observaciones, estado)
             VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)`,
            [usuario, montoInicialNum, montoInicialYapeNum, cuentaEfectivoNum, cuentaYapeNum, observaciones, 'abierto']
        );

        res.status(201).json({
            id: result.insertId,
            fecha: new Date(),
            usuario,
            montoInicial: montoInicialNum,
            monto_inicial_yape: montoInicialYapeNum,
            cuenta_efectivo: cuentaEfectivoNum,
            cuenta_yape: cuentaYapeNum,
            observaciones,
            estado: 'abierto'
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear apertura de turno', details: error.message });
    }
});

// API para listar aperturas de turno: Retorna todos los registros de aperturas de turno
app.get('/aperturas', async (req, res) => {
    const [result] = await pool.query(`SELECT * FROM aperturas_turno`);
    //console.log(result);
    res.json(result);
});

// API para cerrar turno: Cambia el estado de la única caja abierta a "cerrado"
app.put('/cerrar-turno', async (req, res) => {
    try {

        // Buscar la caja que esté abierta
        const [cajaAbierta] = await pool.query(
            'SELECT * FROM aperturas_turno WHERE estado = ? LIMIT 1',
            ['abierto']
        );

        // Validar si existe una caja abierta
        if (cajaAbierta.length === 0) {
            return res.status(404).json({
                error: 'No existe ninguna caja abierta'
            });
        }

        const caja = cajaAbierta[0];

        // Actualizar el estado a cerrado
        await pool.query(
            'UPDATE aperturas_turno SET estado = ? WHERE id = ?',
            ['cerrado', caja.id]
        );

        res.json({
            mensaje: 'Caja cerrada correctamente',
            id: caja.id,
            estadoAnterior: 'abierto',
            estadoActual: 'cerrado'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Error al cerrar la caja',
            details: error.message
        });
    }
});


// API para registrar cierre de turno
app.post('/cierre-turno', async (req, res) => {
    const {usuario,efectivo,yape,tarjeta,transferencia,total,observaciones,aperturaId} = req.body;

    // Validación básica
    if (
        !usuario ||
        efectivo === undefined ||
        yape === undefined ||
        tarjeta === undefined ||
        transferencia === undefined ||
        total === undefined ||
        observaciones === undefined ||
        !aperturaId
    ) {
        return res.status(400).json({
            error: 'Todos los campos son requeridos'
        });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Obtener el monto inicial de la apertura
        const [aperturaRows] = await connection.query(
            'SELECT montoInicial FROM aperturas_turno WHERE id = ?',
            [aperturaId]
        );

        const montoInicial = aperturaRows.length > 0 ? Number(aperturaRows[0].montoInicial ?? 0) : 0;

        const [result] = await connection.query(
            `INSERT INTO cierre_turno
            (fecha_hora, usuario, monto_inicial, efectivo, yape, tarjeta,transferencia, total,observaciones,id_apertura)
            VALUES
            (NOW(),?, ?, ?, ?, ?, ?, ?, ?,?)`,
            [
                usuario,montoInicial,efectivo,yape,tarjeta,transferencia,total,observaciones,aperturaId
            ]
        );

        // Disparar contabilización automática del cierre de caja
        const resumenContable = await contabilizarCierreCaja(connection, aperturaId, usuario);

        await connection.commit();

        res.status(201).json({
            id: result.insertId,
            fecha_hora: new Date(),
            usuario,
            monto_inicial: montoInicial,
            efectivo,
            yape,
            tarjeta,
            transferencia,
            total,
            observaciones,
            aperturaId,
            contabilidad: resumenContable
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({
            error: 'Error al registrar cierre de turno',
            details: error.message
        });
    } finally {
        connection.release();
    }
});


// API para listar todos los cierres de turno
app.get('/cierres', async (req, res) => {
    try {

        const [result] = await pool.query(`
            SELECT * FROM cierre_turno ORDER BY fecha_hora DESC
        `); 
        res.json(result);

    } catch (error) {
        res.status(500).json({
            error: 'Error al listar cierres de turno',
            details: error.message
        });
    }
});


// ======================================================
// APIs para modificar cuentas de apertura de turno
// ======================================================

// API para incrementar o establecer la cuenta en efectivo de una apertura
// Body: { monto: number } para sumar al valor actual
// Body opcional: { cuenta_efectivo: number } para establecer un valor exacto
app.put('/actualizar-cuenta-efectivo/:id', async (req, res) => {
    const { id } = req.params;
    const { monto, cuenta_efectivo } = req.body;

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: 'ID de apertura inválido' });
    }

    try {
        const [aperturaRows] = await pool.query(
            'SELECT cuenta_efectivo FROM aperturas_turno WHERE id = ?',
            [id]
        );

        if (aperturaRows.length === 0) {
            return res.status(404).json({ error: 'Apertura no encontrada' });
        }

        let nuevoValor;
        if (cuenta_efectivo !== undefined) {
            if (isNaN(Number(cuenta_efectivo))) {
                return res.status(400).json({ error: 'cuenta_efectivo debe ser numérico' });
            }
            nuevoValor = Number(cuenta_efectivo);
        } else if (monto !== undefined) {
            if (isNaN(Number(monto))) {
                return res.status(400).json({ error: 'monto debe ser numérico' });
            }
            nuevoValor = Number(aperturaRows[0].cuenta_efectivo ?? 0) + Number(monto);
        } else {
            return res.status(400).json({ error: 'Debe enviar monto o cuenta_efectivo' });
        }

        await pool.query(
            'UPDATE aperturas_turno SET cuenta_efectivo = ? WHERE id = ?',
            [nuevoValor, id]
        );

        res.json({
            mensaje: 'Cuenta en efectivo actualizada correctamente',
            id_apertura: Number(id),
            cuenta_efectivo: nuevoValor
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar cuenta en efectivo', details: error.message });
    }
});

// API para incrementar o establecer la cuenta en yape de una apertura
// Body: { monto: number } para sumar al valor actual
// Body opcional: { cuenta_yape: number } para establecer un valor exacto
app.put('/actualizar-cuenta-yape/:id', async (req, res) => {
    const { id } = req.params;
    const { monto, cuenta_yape } = req.body;

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: 'ID de apertura inválido' });
    }

    try {
        const [aperturaRows] = await pool.query(
            'SELECT cuenta_yape FROM aperturas_turno WHERE id = ?',
            [id]
        );

        if (aperturaRows.length === 0) {
            return res.status(404).json({ error: 'Apertura no encontrada' });
        }

        let nuevoValor;
        if (cuenta_yape !== undefined) {
            if (isNaN(Number(cuenta_yape))) {
                return res.status(400).json({ error: 'cuenta_yape debe ser numérico' });
            }
            nuevoValor = Number(cuenta_yape);
        } else if (monto !== undefined) {
            if (isNaN(Number(monto))) {
                return res.status(400).json({ error: 'monto debe ser numérico' });
            }
            nuevoValor = Number(aperturaRows[0].cuenta_yape ?? 0) + Number(monto);
        } else {
            return res.status(400).json({ error: 'Debe enviar monto o cuenta_yape' });
        }

        await pool.query(
            'UPDATE aperturas_turno SET cuenta_yape = ? WHERE id = ?',
            [nuevoValor, id]
        );

        res.json({
            mensaje: 'Cuenta en yape actualizada correctamente',
            id_apertura: Number(id),
            cuenta_yape: nuevoValor
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar cuenta en yape', details: error.message });
    }
});

// ======================================================
// API: REGISTRAR MOVIMIENTO ENTRE CUENTAS
// ======================================================
// Registra un movimiento de dinero entre cuentas de una caja.
// Body:
// {
//   "id_apertura": 87,
//   "cuenta_origen": "EFECTIVO",
//   "cuenta_destino": "YAPE",
//   "monto": 50.00,
//   "comision": 2.50,
//   "cuenta_comision": "EFECTIVO",
//   "usuario": "Administrador 01",
//   "observaciones": "Cambio de efectivo a yape"
// }
// ======================================================

app.post('/movimientos-cuenta', async (req, res) => {
    const { id_apertura, cuenta_origen, cuenta_destino, monto, comision, cuenta_comision, usuario, observaciones } = req.body;

    if (!id_apertura || !cuenta_origen || !cuenta_destino || monto === undefined || !usuario) {
        return res.status(400).json({
            error: 'id_apertura, cuenta_origen, cuenta_destino, monto y usuario son requeridos'
        });
    }

    if (isNaN(Number(monto)) || Number(monto) <= 0) {
        return res.status(400).json({ error: 'El monto debe ser numérico mayor a 0' });
    }

    const comisionNum = comision !== undefined ? Number(comision) : 0;
    if (isNaN(comisionNum) || comisionNum < 0) {
        return res.status(400).json({ error: 'La comision debe ser numérica mayor o igual a 0' });
    }

    if (comisionNum > 0 && !cuenta_comision) {
        return res.status(400).json({ error: 'cuenta_comision es requerida cuando comision es mayor a 0' });
    }

    if (cuenta_comision && !['EFECTIVO', 'YAPE'].includes(cuenta_comision.toUpperCase())) {
        return res.status(400).json({ error: 'cuenta_comision debe ser EFECTIVO o YAPE' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verificar que la apertura exista
        const [aperturaRows] = await connection.query(
            'SELECT id FROM aperturas_turno WHERE id = ?',
            [id_apertura]
        );

        if (aperturaRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Apertura no encontrada' });
        }

        const [result] = await connection.query(
            `INSERT INTO movimientos_cuenta
             (id_apertura, cuenta_origen, cuenta_destino, monto, comision, cuenta_comision, usuario, observaciones, fecha_hora)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                id_apertura,
                cuenta_origen,
                cuenta_destino,
                Number(monto),
                comisionNum,
                cuenta_comision ? cuenta_comision.toUpperCase() : null,
                usuario,
                observaciones || null
            ]
        );

        await connection.commit();

        res.status(201).json({
            mensaje: 'Movimiento registrado correctamente',
            id_movimiento: result.insertId,
            id_apertura,
            cuenta_origen,
            cuenta_destino,
            monto: Number(monto),
            comision: comisionNum,
            cuenta_comision: cuenta_comision ? cuenta_comision.toUpperCase() : null,
            usuario,
            observaciones: observaciones || null
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: 'Error al registrar movimiento', details: error.message });
    } finally {
        connection.release();
    }
});

// ======================================================
// API: LISTAR MOVIMIENTOS ENTRE CUENTAS
// ======================================================
// Query params opcionales: ?id_apertura=87
// ======================================================

app.get('/movimientos-cuenta', async (req, res) => {
    const { id_apertura } = req.query;

    try {
        let query = 'SELECT * FROM movimientos_cuenta';
        const params = [];

        if (id_apertura) {
            query += ' WHERE id_apertura = ?';
            params.push(id_apertura);
        }

        query += ' ORDER BY fecha_hora DESC';

        const [result] = await pool.query(query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Error al listar movimientos', details: error.message });
    }
});

// Inventario

// API para agregar un nuevo producto al inventario
app.post('/agregar-producto', async (req, res) => {
    const {
        marca,
        nombre,
        categoria,
        stock_actual,
        stock_inicial,
        stock_minimo,
        vencimiento,
        precio_caja,
        precio_blister,
        costo_compra,
        precio_unitario,
        estante
    } = req.body;

    // Validación de datos requeridos
    if (
        !marca ||
        !nombre ||
        !categoria ||
        stock_actual === undefined ||
        stock_minimo === undefined ||
        costo_compra === undefined ||
        precio_unitario === undefined ||
        !estante
    ) {
        return res.status(400).json({
            error: 'Todos los campos son requeridos: marca, nombre, categoria, stock_actual, stock_minimo, costo_compra, precio_unitario, estante'
        });
    }

    // Si no se envian campos opcionales, se guardan como null
    const stockInicialFinal = stock_inicial !== undefined ? stock_inicial : stock_actual;
    const vencimientoFinal = vencimiento !== undefined && vencimiento !== '' ? vencimiento : null;
    const precioCajaFinal = precio_caja !== undefined && precio_caja !== '' ? precio_caja : null;
    const precioBlisterFinal = precio_blister !== undefined && precio_blister !== '' ? precio_blister : null;

    try {
        // Calcular ganancia: precio_unitario * stock_actual
        const ganancia = precio_unitario * stock_actual;

        const [result] = await pool.query(`
            INSERT INTO inventario_productos (
                marca,
                nombre,
                categoria,
                stock_actual,
                stock_inicial,
                stock_minimo,
                vencimiento,
                precio_caja,
                precio_blister,
                costo_compra,
                precio_unitario,
                estante,
                ganancia,
                compra
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            marca,
            nombre,
            categoria,
            stock_actual,
            stockInicialFinal,
            stock_minimo,
            vencimientoFinal,
            precioCajaFinal,
            precioBlisterFinal,
            costo_compra,
            precio_unitario,
            estante,
            ganancia,
            costo_compra
        ]);

        res.status(201).json({
            mensaje: 'Producto agregado correctamente',
            idproducto: result.insertId
        });

    } catch (error) {
        res.status(500).json({
            error: 'Error al agregar el producto',
            details: error.message
        });
    }
});

// API para listar todos los productos del inventario
app.get('/inventario-productos', async (req, res) => {
    try {

        const [result] = await pool.query(
            'SELECT * FROM inventario_productos ORDER BY nombre ASC'
        );

        res.json(result);

    } catch (error) {
        res.status(500).json({
            error: 'Error al obtener los productos del inventario',
            details: error.message
        });
    }
});



// Ventas

app.get('/ventas', async (req, res) => {
    try {
        const { incluirAnuladas } = req.query;

        let sql = `
            SELECT
                id,
                fecha,
                dateOnly,
                cliente,
                dni,
                subtotal,
                descuento,
                total,
                pago,
                vuelto,
                metodo,
                usuario,
                id_apertura,
                estado
            FROM ventas
        `;

        if (incluirAnuladas !== '1' && incluirAnuladas !== 'true') {
            sql += ` WHERE estado = 'activa' `;
        }

        sql += ` ORDER BY fecha DESC `;

        const [result] = await pool.query(sql);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: 'Error al obtener las ventas',
            details: error.message
        });

    }
});

// Detalle de venta

app.post('/detalle-venta', async (req, res) => {
    const { idventa } = req.body;
    // Validación
    if (!idventa) {
        return res.status(400).json({
            error: 'El idventa es requerido'
        });
    }

    try {
        // Verificar si existe la venta y que este activa
        const [venta] = await pool.query(
            "SELECT * FROM ventas WHERE id = ? AND estado = 'activa'",
            [idventa]
        );
        if (venta.length === 0) {
            return res.status(404).json({
                error: 'La venta no existe o fue anulada'
            });
        }
        // Obtener detalle de la venta
        const [detalle] = await pool.query(`
            SELECT
                dv.id,
                dv.idventa,
                dv.idproducto,
                dv.nombre,
                dv.precio,
                dv.costo_compra,
                dv.cantidad,
                dv.subtotal
            FROM detalle_venta dv
            WHERE dv.idventa = ?
        `, [idventa]);

        res.json({
            venta: venta[0],
            detalle
        });
    } catch (error) {
        res.status(500).json({
            error: 'Error al obtener el detalle de venta',
            details: error.message
        });
    }
});


// ======================================================
// API: ANULAR VENTA (EXTORNO)
// ======================================================
// Reversa una venta: marca la venta como anulada, registra
// la anulacion y devuelve los productos al inventario.
//
// Body esperado:
// {
//   "idventa": 123,
//   "motivo": "Cliente cancelo el pedido",
//   "usuario": "Administrador 01"
// }
//
// Respuesta exitosa:
// {
//   "mensaje": "Venta anulada correctamente",
//   "id_anulacion": 5,
//   "idventa": 123,
//   "totalExtornado": 45.50,
//   "metodo": "Efectivo",
//   "productosDevueltos": [...]
// }
// ======================================================

app.post('/anular-venta', async (req, res) => {
    const { idventa, motivo, usuario } = req.body;

    // Validacion basica
    if (!idventa) {
        return res.status(400).json({ error: 'El idventa es requerido' });
    }
    if (!usuario) {
        return res.status(400).json({ error: 'El usuario que anula es requerido' });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Verificar que la venta exista y no este ya anulada
        const [ventaRows] = await connection.query(
            'SELECT id, total, metodo, estado FROM ventas WHERE id = ? FOR UPDATE',
            [idventa]
        );

        if (ventaRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'La venta no existe' });
        }

        const venta = ventaRows[0];

        if (venta.estado === 'anulada') {
            await connection.rollback();
            return res.status(400).json({ error: 'La venta ya fue anulada anteriormente' });
        }

        // 2. Obtener el detalle de productos vendidos
        const [detalle] = await connection.query(
            'SELECT idproducto, nombre, precio, costo_compra, cantidad FROM detalle_venta WHERE idventa = ?',
            [idventa]
        );

        if (detalle.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'La venta no tiene productos asociados' });
        }

        // 3. Devolver stock producto por producto
        const productosDevueltos = [];
        for (const item of detalle) {
            // Verificar que el producto exista
            const [productoRows] = await connection.query(
                'SELECT id, nombre, stock_actual FROM inventario_productos WHERE id = ? FOR UPDATE',
                [item.idproducto]
            );

            if (productoRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    error: `Producto no encontrado en inventario: ${item.idproducto}`
                });
            }

            const producto = productoRows[0];

            // Restaurar stock sumando la cantidad vendida
            await connection.query(
                'UPDATE inventario_productos SET stock_actual = stock_actual + ? WHERE id = ?',
                [item.cantidad, item.idproducto]
            );

            productosDevueltos.push({
                idproducto: item.idproducto,
                nombre: item.nombre,
                precio: item.precio,
                costo_compra: item.costo_compra,
                cantidadDevuelta: item.cantidad,
                stockAnterior: producto.stock_actual,
                stockNuevo: producto.stock_actual + item.cantidad
            });
        }

        // 4. Marcar la venta como anulada
        await connection.query(
            "UPDATE ventas SET estado = 'anulada' WHERE id = ?",
            [idventa]
        );

        // 5. Registrar la anulacion
        const [anulacionResult] = await connection.query(
            `INSERT INTO ventas_anuladas (idventa, motivo, usuario, fecha_hora, total, metodo)
             VALUES (?, ?, ?, NOW(), ?, ?)`,
            [idventa, motivo || null, usuario, venta.total, venta.metodo]
        );

        await connection.commit();

        res.json({
            mensaje: 'Venta anulada correctamente',
            id_anulacion: anulacionResult.insertId,
            idventa: Number(idventa),
            totalExtornado: venta.total,
            metodo: venta.metodo,
            motivo: motivo || null,
            usuario,
            productosDevueltos
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({
            error: 'Error al anular la venta',
            details: error.message
        });
    } finally {
        connection.release();
    }
});


// ======================================================
// API: LISTAR VENTAS ANULADAS (HISTORIAL)
// ======================================================
// Retorna el historial de ventas anuladas con datos de la
// venta original y los productos que fueron devueltos.
//
// Query params opcionales:
//   ?fechaInicio=2026-07-01&fechaFin=2026-07-31
//   ?usuario=Administrador 01
// ======================================================

app.get('/ventas-anuladas', async (req, res) => {
    const { fechaInicio, fechaFin, usuario } = req.query;

    try {
        let where = 'WHERE 1=1';
        const params = [];

        if (fechaInicio) {
            where += ' AND DATE(va.fecha_hora) >= ?';
            params.push(fechaInicio);
        }
        if (fechaFin) {
            where += ' AND DATE(va.fecha_hora) <= ?';
            params.push(fechaFin);
        }
        if (usuario && usuario.trim() !== '') {
            where += ' AND va.usuario = ?';
            params.push(usuario.trim());
        }

        const [anulaciones] = await pool.query(
            `SELECT
                va.id_anulacion,
                va.idventa,
                va.motivo,
                va.usuario AS usuario_anulo,
                va.fecha_hora,
                va.total AS total_extornado,
                va.metodo,
                v.fecha AS fecha_venta,
                v.cliente,
                v.dni,
                v.usuario AS usuario_vendedor,
                v.id_apertura
            FROM ventas_anuladas va
            INNER JOIN ventas v ON v.id = va.idventa
            ${where}
            ORDER BY va.fecha_hora DESC`,
            params
        );

        // Obtener los productos devueltos de cada anulacion
        const resultado = [];
        for (const anulacion of anulaciones) {
            const [productos] = await pool.query(
                `SELECT
                    dv.idproducto,
                    dv.nombre,
                    dv.precio,
                    dv.costo_compra,
                    dv.cantidad,
                    dv.subtotal
                FROM detalle_venta dv
                WHERE dv.idventa = ?`,
                [anulacion.idventa]
            );

            resultado.push({
                ...anulacion,
                productosDevueltos: productos
            });
        }

        res.json(resultado);
    } catch (error) {
        res.status(500).json({
            error: 'Error al obtener el historial de ventas anuladas',
            details: error.message
        });
    }
});


// Actualizar stock de un producto

app.post('/actualizar-stock-venta', async (req, res) => {

    const { idventa } = req.body;

    if (!idventa) {
        return res.status(400).json({
            error: 'El idventa es requerido'
        });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verificar que la venta exista y este activa
        const [venta] = await connection.query(
            "SELECT id FROM ventas WHERE id = ? AND estado = 'activa'",
            [idventa]
        );

        if (venta.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                error: 'La venta no existe o fue anulada'
            });
        }

        // Obtener detalle de productos vendidos
        const [detalle] = await connection.query(`
            SELECT
                idproducto,
                cantidad
            FROM detalle_venta
            WHERE idventa = ?
        `, [idventa]);

        if (detalle.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                error: 'No se encontraron productos para esta venta'
            });
        }
        // Actualizar stock producto por producto
        for (const item of detalle) {

            // Verificar stock actual
            const [producto] = await connection.query(`
                SELECT stock_actual
                FROM inventario_productos
                WHERE id = ?
            `, [item.idproducto]);

            if (producto.length === 0) {

                await connection.rollback();

                return res.status(404).json({
                    error: `Producto no encontrado: ${item.idproducto}`
                });
            }
            const stockActual = producto[0].stock_actual;
            // Validar stock suficiente
            if (stockActual < item.cantidad) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Stock insuficiente para el producto ${item.idproducto}`
                });
            }
            // Descontar stock
            await connection.query(`
                UPDATE inventario_productos
                SET stock_actual = stock_actual - ?
                WHERE id = ?
            `, [item.cantidad, item.idproducto]);
        }
        await connection.commit();
        res.json({
            mensaje: 'Stock actualizado correctamente',
            idventa
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({
            error: 'Error al actualizar stock',
            details: error.message
        });
    } finally {
        connection.release();
    }

});

app.put('/actualizar-producto', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id, nombre, marca, categoria, estante, stock_actual, stock_inicial, stock_minimo,
            costo_compra, precio_unitario, precio_blister, precio_caja,
            unidades_blister, blisters_caja, vencimiento, ubicacion } = req.body;

    if (!id) return res.status(400).json({ error: 'ID de producto requerido' });

    const query = `
      UPDATE inventario_productos SET
        nombre = ?, marca = ?, categoria = ?, estante = ?,
        stock_actual = ?, stock_inicial = ?, stock_minimo = ?, costo_compra = ?,
        precio_unitario = ?, precio_blister = ?, precio_caja = ?,
        unidades_blister = ?, blisters_caja = ?, vencimiento = ?,
        ubicacion = ?
      WHERE id = ?
    `;
    const values = [nombre, marca, categoria, estante, stock_actual, stock_inicial, stock_minimo,
                    costo_compra, precio_unitario, precio_blister, precio_caja,
                    unidades_blister, blisters_caja, vencimiento, ubicacion, id];

    await connection.query(query, values);
    res.json({ success: true, message: 'Producto actualizado correctamente' });
  } catch (err) {
    console.error('Error actualizando producto:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// API para eliminar un producto del inventario
// Solo elimina de la tabla inventario_productos, no afecta otras tablas.
app.delete('/eliminar-producto/:id', async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({ error: 'ID de producto inválido' });
  }

  try {
    const [result] = await pool.query(
      'DELETE FROM inventario_productos WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ success: true, message: 'Producto eliminado correctamente' });
  } catch (err) {
    console.error('Error eliminando producto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ======================================================
// API 1: REGISTRAR VENTA
// ======================================================

app.post('/registrar-venta', async (req, res) => {

    const {
        cliente,
        dni,
        subtotal,
        descuento,
        total,
        pago,
        vuelto,
        metodo,
        usuario,
        id_apertura
    } = req.body;

    // Validación
    if (
        !cliente ||
        subtotal === undefined ||
        total === undefined ||
        pago === undefined ||
        vuelto === undefined ||
        !metodo ||
        !usuario ||
        !id_apertura
    ) {
        return res.status(400).json({
            error: 'Faltan datos requeridos'
        });
    }

    try {

        const [result] = await pool.query(`
            INSERT INTO ventas (
                fecha,
                dateOnly,
                cliente,
                dni,
                subtotal,
                descuento,
                total,
                pago,
                vuelto,
                metodo,
                usuario,
                id_apertura,
                estado
            )
            VALUES (
                NOW(),
                CURDATE(),
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'activa'
            )
        `, [
            cliente,
            dni,
            subtotal,
            descuento,
            total,
            pago,
            vuelto,
            metodo,
            usuario,
            id_apertura
        ]);
        res.status(201).json({
            mensaje: 'Venta registrada correctamente',
            idventa: result.insertId,
            id_apertura: id_apertura
        });

    } catch (error) {
        res.status(500).json({
            error: 'Error al registrar venta',
            details: error.message
        });
    }
});



// ======================================================
// API 2: REGISTRAR DETALLE DE VENTA
// ======================================================

app.post('/registrar-detalle-venta', async (req, res) => {

    const {
        idventa,
        detalle
    } = req.body;

    // Validaciones
    if (
        !idventa ||
        !detalle ||
        !Array.isArray(detalle) ||
        detalle.length === 0
    ) {
        return res.status(400).json({
            error: 'Datos inválidos'
        });
    }

    const connection = await pool.getConnection();

    try {

        await connection.beginTransaction();

        // Verificar venta activa
        const [venta] = await connection.query(
            "SELECT id FROM ventas WHERE id = ? AND estado = 'activa'",
            [idventa]
        );

        if (venta.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                error: 'La venta no existe o fue anulada'
            });
        }

        // Insertar detalle
        for (const item of detalle) {

            if (
                !item.idproducto ||
                !item.nombre ||
                item.precio === undefined ||
                item.cantidad === undefined
            ) {

                await connection.rollback();

                return res.status(400).json({
                    error: 'Datos inválidos en detalle'
                });
            }

            // Obtener costo de compra si no viene en el item
            let costoCompra = item.costo_compra;
            if (costoCompra === undefined || costoCompra === null || costoCompra === '') {
                const [productoRows] = await connection.query(
                    'SELECT costo_compra FROM inventario_productos WHERE id = ?',
                    [item.idproducto]
                );
                costoCompra = productoRows.length > 0 ? productoRows[0].costo_compra : null;
            }

            await connection.query(`
                INSERT INTO detalle_venta (
                    idventa,
                    idproducto,
                    nombre,
                    precio,
                    costo_compra,
                    cantidad
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                idventa,
                item.idproducto,
                item.nombre,
                item.precio,
                costoCompra,
                item.cantidad
            ]);

        }
        await connection.commit();
        res.status(201).json({
            mensaje: 'Detalle de venta registrado correctamente'
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({
            error: 'Error al registrar detalle de venta',
            details: error.message
        });
    } finally {
        connection.release();
    }
});


// 1. Agregar servicio a lista_servicios

app.post('/agregar-servicio', async (req, res) => {

    const {
        descripcion,
        precio_de_aplicacion,
        duracion,
        productos,
        total
    } = req.body;

    if (!descripcion) {
        return res.status(400).json({
            error: 'descripcion es requerida'
        });
    }

    try {

        const [result] = await pool.query(`
            INSERT INTO lista_servicios (
                descripcion,
                precio_de_aplicacion,
                duracion,
                productos,
                precio
            )
            VALUES (?, ?, ?, ?, ?)
        `, [
            descripcion,
            precio_de_aplicacion || 0,
            duracion || "",
            productos ? JSON.stringify(productos) : null,
            total || 0
        ]);

        res.status(201).json({
            mensaje: 'Servicio agregado correctamente',
            idservicio: result.insertId
        });

    } catch (error) {

        res.status(500).json({
            error: 'Error al agregar servicio',
            details: error.message
        });

    }

});


//2. Obtener lista de servicios

app.get('/lista-servicios', async (req, res) => {

    try {

        const [result] = await pool.query(`
            SELECT *
            FROM lista_servicios
            ORDER BY descripcion
        `);

        res.json(result);

    } catch (error) {

        res.status(500).json({
            error: 'Error al obtener servicios',
            details: error.message
        });

    }

});


// 3. Editar servicio

app.put('/editar-servicio/:id', async (req, res) => {

    const { id } = req.params;

    const {
        descripcion,
        precio,
        duracion,
        productos,
        precio_de_aplicacion,
        estado
    } = req.body;

    if (!descripcion) {
        return res.status(400).json({
            error: 'descripcion requerida'
        });
    }

    try {

        const [result] = await pool.query(`
            UPDATE lista_servicios
            SET
                descripcion = ?,
                precio = ?,
                duracion = ?,
                productos = ?,
                precio_de_aplicacion = ?,
                estado = ?
            WHERE idservicio = ?
        `, [
            descripcion,
            precio,
            duracion,
            productos ? JSON.stringify(productos) : null,
            precio_de_aplicacion,
            estado,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Servicio no encontrado'
            });
        }

        res.json({
            mensaje: 'Servicio actualizado correctamente'
        });

    } catch (error) {

        res.status(500).json({
            error: 'Error al actualizar servicio',
            details: error.message
        });

    }

});


// 4. Registrar servicio dado


app.post('/registrar-servicio', async (req, res) => {

    const {
        idservicio,
        subtotal,
        vendedor,
        pago,
        vuelto,
        metodo,
        usuario,
        idapertura
    } = req.body;

    if (
        !idservicio ||
        subtotal === undefined ||
        !vendedor ||
        pago === undefined ||
        vuelto === undefined ||
        !metodo ||
        !usuario ||
        !idapertura
    ) {
        return res.status(400).json({
            error: 'Faltan datos requeridos'
        });
    }

    try {

        const [result] = await pool.query(`
            INSERT INTO servicio (
                idservicio,
                subtotal,
                vendedor,
                hora,
                pago,
                vuelto,
                metodo,
                usuario,
                idapertura
            )
            VALUES (
                ?,
                ?,
                ?,
                NOW(),
                ?,
                ?,
                ?,
                ?,
                ?
            )
        `, [
            idservicio,
            subtotal,
            vendedor,
            pago,
            vuelto,
            metodo,
            usuario,
            idapertura
        ]);

        res.status(201).json({
            mensaje: 'Servicio registrado correctamente',
            idserviciodado: result.insertId
        });

    } catch (error) {

        res.status(500).json({
            error: 'Error al registrar servicio',
            details: error.message
        });

    }

});



// 5. Registrar detalle servicio

app.post('/registrar-detalle-servicio', async (req, res) => {

    const {
        idserviciodado,
        detalle
    } = req.body;

    if (
        !idserviciodado ||
        !Array.isArray(detalle) ||
        detalle.length === 0
    ) {
        return res.status(400).json({
            error: 'Datos inválidos'
        });
    }

    const connection = await pool.getConnection();

    try {

        await connection.beginTransaction();

        for (const item of detalle) {

            await connection.query(`
                INSERT INTO detalleservicio (
                    idserviciodado,
                    idproducto,
                    nombre,
                    precio,
                    cantidad
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                idserviciodado,
                item.idproducto,
                item.nombre,
                item.precio,
                item.cantidad
            ]);

        }

        await connection.commit();

        res.status(201).json({
            mensaje: 'Detalle registrado correctamente'
        });

    } catch (error) {

        await connection.rollback();

        res.status(500).json({
            error: 'Error al registrar detalle',
            details: error.message
        });

    } finally {

        connection.release();

    }

}); 



//6. Listar todos los servicios dados

app.get('/servicios', async (req, res) => {

    try {

        const [result] = await pool.query(`
            SELECT
                s.idserviciodado,
                s.idservicio,
                ls.descripcion,
                ls.duracion,
                s.subtotal,
                s.vendedor,
                s.hora,
                s.pago,
                s.vuelto,
                s.metodo,
                s.usuario,
                s.idapertura
            FROM servicio s
            INNER JOIN lista_servicios ls
                ON ls.idservicio = s.idservicio
            ORDER BY s.hora DESC
        `);

        res.json(result);

    } catch (error) {

        res.status(500).json({
            error: 'Error al obtener servicios',
            details: error.message
        });

    }

});


// 7. Obtener detalle completo de un servicio dado

app.post('/detalle-servicio', async (req, res) => {

    const { idserviciodado } = req.body;

    if (!idserviciodado) {
        return res.status(400).json({
            error: 'idserviciodado requerido'
        });
    }

    try {

        const [servicio] = await pool.query(`
            SELECT
                s.*,
                ls.descripcion,
                ls.duracion
            FROM servicio s
            INNER JOIN lista_servicios ls
                ON ls.idservicio = s.idservicio
            WHERE s.idserviciodado = ?
        `, [idserviciodado]);

        if (servicio.length === 0) {

            return res.status(404).json({
                error: 'Servicio no encontrado'
            });

        }

        const [detalle] = await pool.query(`
            SELECT *
            FROM detalleservicio
            WHERE idserviciodado = ?
        `, [idserviciodado]);

        res.json({
            servicio: servicio[0],
            detalle
        });

    } catch (error) {

        res.status(500).json({
            error: 'Error al obtener detalle',
            details: error.message
        });

    }

});



// ======================================================
// Helpers contables
// ======================================================

async function obtenerIdCuentaPorCodigo(connection, codigo) {
    const [rows] = await connection.query(
        'SELECT id_cuenta FROM cuentas_contables WHERE codigo = ?',
        [codigo]
    );
    return rows.length > 0 ? rows[0].id_cuenta : null;
}

async function actualizarSaldoCuenta(connection, idCuenta, monto, tipo) {
    const factor = (tipo === 'INGRESO' || tipo === 'ACTIVO') ? 1 : -1;
    await connection.query(
        'UPDATE cuentas_contables SET saldo = saldo + ? WHERE id_cuenta = ?',
        [monto * factor, idCuenta]
    );

    // Actualizar saldo de la cuenta padre si existe
    const [padreRows] = await connection.query(
        'SELECT cuenta_padre_id FROM cuentas_contables WHERE id_cuenta = ?',
        [idCuenta]
    );

    if (padreRows.length > 0 && padreRows[0].cuenta_padre_id) {
        await actualizarSaldoCuenta(connection, padreRows[0].cuenta_padre_id, monto, tipo);
    }
}

async function insertarMovimientoContable(connection, { id_cuenta, id_apertura, monto, tipo, concepto, usuario, origen }) {
    await connection.query(
        `INSERT INTO movimientos_contables
         (id_cuenta, id_apertura, monto, tipo, concepto, usuario, origen, fecha_hora)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [id_cuenta, id_apertura || null, monto, tipo, concepto, usuario, origen]
    );

    await actualizarSaldoCuenta(connection, id_cuenta, monto, tipo);
}

async function contabilizarCierreCaja(connection, idApertura, usuario) {
    // Ventas activas de la apertura
    const [ventasRows] = await connection.query(
        `SELECT COALESCE(SUM(total), 0) AS total_ventas
         FROM ventas
         WHERE estado = 'activa' AND id_apertura = ?`,
        [idApertura]
    );
    const totalVentas = Number(ventasRows[0].total_ventas);

    // Ganancia y costo de ventas
    const [ventasDetalleRows] = await connection.query(
        `SELECT
            COALESCE(SUM(dv.cantidad * (dv.precio - dv.costo_compra)), 0) AS ganancia_ventas,
            COALESCE(SUM(dv.cantidad * dv.costo_compra), 0) AS costo_ventas
         FROM detalle_venta dv
         JOIN ventas v ON v.id = dv.idventa
         WHERE v.estado = 'activa' AND v.id_apertura = ?`,
        [idApertura]
    );
    const gananciaVentas = Number(ventasDetalleRows[0].ganancia_ventas);
    const costoVentas = Number(ventasDetalleRows[0].costo_ventas);

    // Ingresos por servicios
    const [serviciosRows] = await connection.query(
        `SELECT COALESCE(SUM(subtotal), 0) AS total_servicios
         FROM servicio
         WHERE idapertura = ?`,
        [idApertura]
    );
    const totalServicios = Number(serviciosRows[0].total_servicios);

    // Costo de productos usados en servicios
    const [serviciosCostoRows] = await connection.query(
        `SELECT COALESCE(SUM(ds.cantidad * ip.costo_compra), 0) AS costo_servicios
         FROM detalleservicio ds
         JOIN servicio s ON s.idserviciodado = ds.idserviciodado
         JOIN inventario_productos ip ON ip.id = ds.idproducto
         WHERE s.idapertura = ?`,
        [idApertura]
    );
    const costoServicios = Number(serviciosCostoRows[0].costo_servicios);

    const totalIngresos = totalVentas + totalServicios;
    const gananciaServicios = totalServicios - costoServicios;
    const gananciaNeta = gananciaVentas + gananciaServicios;
    const costoTotal = costoVentas + costoServicios;

    // Validar que 1010 + 1020 = total de ingresos
    //const diferencia = Number((totalIngresos - (gananciaNeta + costoTotal)).toFixed(2));
    //if (Math.abs(diferencia) > 0.01) {
    //    throw new Error(`Descuadre contable: ingresos (${totalIngresos}) != ganancia (${gananciaNeta}) + costo (${costoTotal}). Diferencia: ${diferencia}`);
    //}

    const idCuenta1010 = await obtenerIdCuentaPorCodigo(connection, '1010');
    const idCuenta1020 = await obtenerIdCuentaPorCodigo(connection, '1020');

    if (!idCuenta1010 || !idCuenta1020) {
        throw new Error('No se encontraron las cuentas contables base (1010, 1020)');
    }

    // Nota: la cuenta 10 (Ingresos) es totalizadora, no se registra movimiento directo.
    // Su saldo se actualiza automaticamente al actualizar las cuentas hijas 1010 y 1020.

    if (gananciaNeta > 0) {
        await insertarMovimientoContable(connection, {
            id_cuenta: idCuenta1010,
            id_apertura: idApertura,
            monto: gananciaNeta,
            tipo: 'INGRESO',
            concepto: `Ganancia neta - caja ${idApertura}`,
            usuario,
            origen: 'CIERRE_CAJA'
        });
    }

    if (costoTotal > 0) {
        await insertarMovimientoContable(connection, {
            id_cuenta: idCuenta1020,
            id_apertura: idApertura,
            monto: costoTotal,
            tipo: 'INGRESO',
            concepto: `Costo de productos - caja ${idApertura}`,
            usuario,
            origen: 'CIERRE_CAJA'
        });
    }

    return {
        total_ingresos: totalIngresos,
        ganancia_neta: gananciaNeta,
        costo_total: costoTotal
    };
}

// ======================================================
// API: CUENTAS CONTABLES
// ======================================================

// Crear cuenta contable
app.post('/cuentas-contables', async (req, res) => {
    const { codigo, nombre, tipo, cuenta_padre_id } = req.body;

    if (!codigo || !nombre || !tipo) {
        return res.status(400).json({ error: 'codigo, nombre y tipo son requeridos' });
    }

    if (!['INGRESO', 'EGRESO', 'ACTIVO'].includes(tipo)) {
        return res.status(400).json({ error: "El tipo debe ser 'INGRESO', 'EGRESO' o 'ACTIVO'" });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO cuentas_contables (codigo, nombre, tipo, saldo, es_totalizadora, cuenta_padre_id)
             VALUES (?, ?, ?, 0, ?, ?)`,
            [codigo, nombre, tipo, cuenta_padre_id ? 0 : 1, cuenta_padre_id || null]
        );

        res.status(201).json({
            mensaje: 'Cuenta contable creada correctamente',
            id_cuenta: result.insertId,
            codigo,
            nombre,
            tipo,
            saldo: 0,
            cuenta_padre_id: cuenta_padre_id || null
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear cuenta contable', details: error.message });
    }
});

// Listar cuentas contables
app.get('/cuentas-contables', async (req, res) => {
    try {
        const [result] = await pool.query(`
            SELECT
                cc.id_cuenta,
                cc.codigo,
                cc.nombre,
                cc.tipo,
                cc.saldo,
                cc.es_totalizadora,
                cc.cuenta_padre_id,
                cp.nombre AS cuenta_padre
            FROM cuentas_contables cc
            LEFT JOIN cuentas_contables cp ON cp.id_cuenta = cc.cuenta_padre_id
            ORDER BY cc.codigo ASC
        `);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Error al listar cuentas contables', details: error.message });
    }
});

// ======================================================
// API: MOVIMIENTOS CONTABLES
// ======================================================

// Registrar movimiento contable manual
app.post('/movimientos-contables', async (req, res) => {
    const { id_cuenta, id_apertura, monto, tipo, concepto, usuario } = req.body;

    if (!id_cuenta || monto === undefined || !tipo || !concepto || !usuario) {
        return res.status(400).json({
            error: 'id_cuenta, monto, tipo, concepto y usuario son requeridos'
        });
    }

    if (!['INGRESO', 'EGRESO'].includes(tipo)) {
        return res.status(400).json({ error: "El tipo debe ser 'INGRESO' o 'EGRESO'" });
    }

    if (isNaN(Number(monto)) || Number(monto) <= 0) {
        return res.status(400).json({ error: 'El monto debe ser numérico mayor a 0' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verificar que la cuenta exista
        const [cuentaRows] = await connection.query(
            'SELECT id_cuenta FROM cuentas_contables WHERE id_cuenta = ?',
            [id_cuenta]
        );

        if (cuentaRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Cuenta contable no encontrada' });
        }

        await insertarMovimientoContable(connection, {
            id_cuenta,
            id_apertura,
            monto: Number(monto),
            tipo,
            concepto,
            usuario,
            origen: 'MANUAL'
        });

        await connection.commit();

        res.status(201).json({
            mensaje: 'Movimiento contable registrado correctamente',
            id_cuenta,
            id_apertura: id_apertura || null,
            monto: Number(monto),
            tipo,
            concepto,
            usuario
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: 'Error al registrar movimiento contable', details: error.message });
    } finally {
        connection.release();
    }
});

// Listar movimientos contables
app.get('/movimientos-contables', async (req, res) => {
    const { id_cuenta, id_apertura, origen } = req.query;

    try {
        let query = `
            SELECT
                mc.id_movimiento,
                mc.id_cuenta,
                cc.codigo AS codigo_cuenta,
                cc.nombre AS nombre_cuenta,
                mc.id_apertura,
                mc.monto,
                mc.tipo,
                mc.concepto,
                mc.usuario,
                mc.origen,
                mc.fecha_hora
            FROM movimientos_contables mc
            JOIN cuentas_contables cc ON cc.id_cuenta = mc.id_cuenta
            WHERE 1=1
        `;
        const params = [];

        if (id_cuenta) {
            query += ' AND mc.id_cuenta = ?';
            params.push(id_cuenta);
        }

        if (id_apertura) {
            query += ' AND mc.id_apertura = ?';
            params.push(id_apertura);
        }

        if (origen) {
            query += ' AND mc.origen = ?';
            params.push(origen);
        }

        query += ' ORDER BY mc.fecha_hora DESC';

        const [result] = await pool.query(query, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Error al listar movimientos contables', details: error.message });
    }
});

// ======================================================
// Módulos de proveedores, pedidos y usuarios
// ======================================================
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/usuarios', usuariosRoutes);

app.listen(PORT)
//console.log('Server is running on port 9000');


