export const ORDER_TAX_RATE = 0.05;
export const ORDER_DELIVERY_FEE = 5;

export interface OrderFees {
  tax: number;
  deliveryFee: number;
  total: number;
}

export function roundMoney(value: number): number {
  return Number(Number(value).toFixed(2));
}

export function computeOrderFees(subtotal: number): OrderFees {
  const tax = roundMoney(subtotal * ORDER_TAX_RATE);
  const deliveryFee = ORDER_DELIVERY_FEE;
  const total = roundMoney(subtotal + tax + deliveryFee);
  return { tax, deliveryFee, total };
}
