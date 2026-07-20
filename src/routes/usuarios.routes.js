import { Router } from 'express';
import {
    listarUsuarios,
    obtenerUsuario,
    crearUsuario,
    actualizarUsuario,
    cambiarContrasena,
    eliminarUsuario
} from '../controllers/usuarios.controller.js';
import { verificarUsuario } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', verificarUsuario, listarUsuarios);
router.get('/:id', verificarUsuario, obtenerUsuario);
router.post('/', verificarUsuario, crearUsuario);
router.put('/:id', verificarUsuario, actualizarUsuario);
router.put('/:id/contrasena', verificarUsuario, cambiarContrasena);
router.delete('/:id', verificarUsuario, eliminarUsuario);

export default router;
