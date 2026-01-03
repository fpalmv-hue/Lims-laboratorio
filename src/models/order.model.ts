// Representa una orden de muestra en el LIMS
export interface Order {
  id: number;
  client: string;          // Nombre de la empresa / obra
  sampleType: string;      // Tipo de muestra: suelo, hormigón, asfalto, áridos, etc.
  testRequested: string;   // Ensayo solicitado (ej: NCh 170, NCh 1444, etc.)
  createdAt: Date;
}

// Por ahora almacenamos en memoria (luego lo cambiaremos por BD)
const orders: Order[] = [];
let currentId = 1;

// Crear una orden nueva
export function createOrder(data: Omit<Order, "id" | "createdAt">): Order {
  const newOrder: Order = {
    id: currentId++,
    createdAt: new Date(),
    ...data
  };
  orders.push(newOrder);
  return newOrder;
}

// Listar todas las órdenes
export function getAllOrders(): Order[] {
  return orders;
}
