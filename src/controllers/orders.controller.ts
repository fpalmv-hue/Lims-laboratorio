import { Request, Response } from "express";

// Obtener todas las órdenes
export const getOrders = (req: Request, res: Response) => {
    res.json({
        message: "Listando órdenes...",
        data: [
            { id: 1, producto: "Reactivo A", cantidad: 10 },
            { id: 2, producto: "Reactivo B", cantidad: 5 }
        ]
    });
};

// Crear una nueva orden
export const postOrder = (req: Request, res: Response) => {
    const nuevaOrden = req.body;

    res.status(201).json({
        message: "Orden creada correctamente",
        data: nuevaOrden
    });
};

