import { Router } from 'express';
import {
    crearProveedor,
    listarProveedores,
    obtenerProveedor,
    actualizarProveedor,
    eliminarProveedor
} from '../controllers/proveedores.controller.js';
import { verificarUsuario } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/', verificarUsuario, crearProveedor);
router.get('/', verificarUsuario, listarProveedores);
router.get('/:id', verificarUsuario, obtenerProveedor);
router.put('/:id', verificarUsuario, actualizarProveedor);
router.delete('/:id', verificarUsuario, eliminarProveedor);

export default router;
