CREATE TABLE user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE proveedores (
    id_proveedor   INT AUTO_INCREMENT PRIMARY KEY,
    nombre         VARCHAR(150) NOT NULL,
    ruc            VARCHAR(20)  NULL,
    rubro          VARCHAR(100) NULL,
    telefono       VARCHAR(20)  NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pedidos (
    id_pedido              INT AUTO_INCREMENT PRIMARY KEY,
    id_proveedor           INT NOT NULL,
    fecha_pedido           DATETIME NOT NULL,
    fecha_entrega_estimada DATE NOT NULL,
    total_pedido           DECIMAL(10,2) NOT NULL DEFAULT 0,
    observaciones          TEXT NULL,
    fecha_creacion         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pedido_proveedor FOREIGN KEY (id_proveedor) REFERENCES proveedores(id_proveedor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pedido_detalle (
    id_pedido_detalle            INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido                    INT NOT NULL,
    producto                      VARCHAR(150) NOT NULL,
    cantidad_pedida               DECIMAL(10,2) NOT NULL,
    precio_unitario               DECIMAL(10,2) NOT NULL,
    cantidad_bonificada           DECIMAL(10,2) NOT NULL DEFAULT 0,
    descripcion_promocion         VARCHAR(200) NULL,
    cantidad_recibida             DECIMAL(10,2) NULL,
    cantidad_bonificada_recibida  DECIMAL(10,2) NULL,
    estado                        ENUM('PENDIENTE','ENTREGADO') NOT NULL DEFAULT 'PENDIENTE',
    fecha_recepcion               DATETIME NULL,
    observaciones                 VARCHAR(255) NULL,
    CONSTRAINT fk_detalle_pedido FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;