import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { PORT } from './config.js';

const app = express();

app.use(cors());
app.use(express.json());

// API de bienvenida: Verifica que el servidor está activo
app.get('/', (req, res) => {
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
// Parámetros: usuario, montoInicial, observaciones (opcional)
app.post('/apertura-turno', async (req, res) => {
    const { usuario, montoInicial, observaciones } = req.body;

    if (!usuario || montoInicial === undefined) {
        return res.status(400).json({ error: 'usuario y montoInicial son requeridos' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO aperturas_turno (fecha, usuario, montoInicial, observaciones, estado) VALUES (NOW(), ?, ?, ?, ?)',
            [usuario, montoInicial, observaciones, 'abierto']
        );

        res.status(201).json({
            id: result.insertId,
            fecha: new Date(),
            usuario,
            montoInicial,
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

    try {
        const [result] = await pool.query(
            `INSERT INTO cierre_turno
            (fecha_hora, usuario, efectivo, yape, tarjeta,transferencia, total,observaciones,id_apertura)
            VALUES
            (NOW(),?, ?, ?, ?, ?, ?, ?,?)`,
            [
                usuario,efectivo,yape,tarjeta,transferencia,total,observaciones,aperturaId
            ]
        );

        res.status(201).json({
            id: result.insertId,
            fecha_hora: new Date(),
            usuario,
            efectivo,
            yape,
            tarjeta,
            transferencia,
            total,
            observaciones,
            aperturaId       
        });

    } catch (error) {
        res.status(500).json({
            error: 'Error al registrar cierre de turno',
            details: error.message
        });
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


// Inventario

// API para agregar un nuevo producto al inventario
app.post('/agregar-producto', async (req, res) => {
    const {
        marca,
        nombre,
        categoria,
        stock_actual,
        stock_minimo,
        vencimiento,
        precio_caja,
        precio_compra,
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
        !vencimiento ||
        precio_caja === undefined ||
        precio_compra === undefined ||
        precio_unitario === undefined ||
        !estante
    ) {
        return res.status(400).json({
            error: 'Todos los campos son requeridos: marca, nombre, categoria, stock_actual, stock_minimo, vencimiento, precio_caja, precio_compra, precio_unitario, estante'
        });
    }

    try {
        // Calcular ganancia: precio_unitario * stock_actual
        const ganancia = precio_unitario * stock_actual;

        const [result] = await pool.query(`
            INSERT INTO inventario_productos (
                marca,
                nombre,
                categoria,
                stock_actual,
                stock_minimo,
                vencimiento,
                precio_caja,
                precio_compra,
                precio_unitario,
                estante,
                ganancia,
                compra
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            marca,
            nombre,
            categoria,
            stock_actual,
            stock_minimo,
            vencimiento,
            precio_caja,
            precio_compra,
            precio_unitario,
            estante,
            ganancia,
            precio_compra
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

        const [result] = await pool.query(`
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
                id_apertura
            FROM ventas
            ORDER BY fecha DESC
        `);
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
        // Verificar si existe la venta
        const [venta] = await pool.query(
            'SELECT * FROM ventas WHERE id = ?',
            [idventa]
        );
        if (venta.length === 0) {
            return res.status(404).json({
                error: 'La venta no existe'
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
    const { id, nombre, marca, categoria, estante, stock_actual, stock_minimo,
            precio_compra, precio_unitario, precio_blister, precio_caja,
            unidades_blister, blisters_caja, vencimiento, ubicacion } = req.body;

    if (!id) return res.status(400).json({ error: 'ID de producto requerido' });

    const query = `
      UPDATE inventario_productos SET
        nombre = ?, marca = ?, categoria = ?, estante = ?,
        stock_actual = ?, stock_minimo = ?, precio_compra = ?,
        precio_unitario = ?, precio_blister = ?, precio_caja = ?,
        unidades_blister = ?, blisters_caja = ?, vencimiento = ?,
        ubicacion = ?
      WHERE id = ?
    `;
    const values = [nombre, marca, categoria, estante, stock_actual, stock_minimo,
                    precio_compra, precio_unitario, precio_blister, precio_caja,
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
                id_apertura
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
                ?
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

        // Verificar venta
        const [venta] = await connection.query(
            'SELECT id FROM ventas WHERE id = ?',
            [idventa]
        );

        if (venta.length === 0) {

            await connection.rollback();

            return res.status(404).json({
                error: 'La venta no existe'
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

            await connection.query(`
                INSERT INTO detalle_venta (
                    idventa,
                    idproducto,
                    nombre,
                    precio,
                    cantidad
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                idventa,
                item.idproducto,
                item.nombre,
                item.precio,
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



app.listen(PORT)
//console.log('Server is running on port 9000');


