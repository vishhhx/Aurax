// Original file: proto/order.proto

import type { PriceLevel as _order_PriceLevel, PriceLevel__Output as _order_PriceLevel__Output } from '../order/PriceLevel';

export interface GetOrderBookResponse {
  'symbol'?: (string);
  'sequenceNumber'?: (string);
  'bids'?: (_order_PriceLevel)[];
  'asks'?: (_order_PriceLevel)[];
}

export interface GetOrderBookResponse__Output {
  'symbol': (string);
  'sequenceNumber': (string);
  'bids': (_order_PriceLevel__Output)[];
  'asks': (_order_PriceLevel__Output)[];
}
