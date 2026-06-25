import { Router } from 'express';
import {
    crearPedido,
    listarPedidos,
    obtenerPedido,
    actualizarPedido,
    eliminarPedido,
    recepcionarDetalle,
    listarDiscrepancias
} from '../controllers/pedidos.controller.js';
import { verificarUsuario } from '../middlewares/auth.middleware.js';

const router = Router();

// Rutas de discrepancias antes que /:id para evitar conflicto de parámetros
router.get('/discrepancias', verificarUsuario, listarDiscrepancias);

router.post('/', verificarUsuario, crearPedido);
router.get('/', verificarUsuario, listarPedidos);
router.get('/:id', verificarUsuario, obtenerPedido);
router.put('/:id', verificarUsuario, actualizarPedido);
router.delete('/:id', verificarUsuario, eliminarPedido);
router.patch('/:idPedido/detalle/:idDetalle/recepcionar', verificarUsuario, recepcionarDetalle);

export default router;
