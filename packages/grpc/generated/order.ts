import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { GetEngineStatusRequest as _order_GetEngineStatusRequest, GetEngineStatusRequest__Output as _order_GetEngineStatusRequest__Output } from './order/GetEngineStatusRequest';
import type { GetEngineStatusResponse as _order_GetEngineStatusResponse, GetEngineStatusResponse__Output as _order_GetEngineStatusResponse__Output } from './order/GetEngineStatusResponse';
import type { GetOrderBookRequest as _order_GetOrderBookRequest, GetOrderBookRequest__Output as _order_GetOrderBookRequest__Output } from './order/GetOrderBookRequest';
import type { GetOrderBookResponse as _order_GetOrderBookResponse, GetOrderBookResponse__Output as _order_GetOrderBookResponse__Output } from './order/GetOrderBookResponse';
import type { MatchingEngineClient as _order_MatchingEngineClient, MatchingEngineDefinition as _order_MatchingEngineDefinition } from './order/MatchingEngine';
import type { PriceLevel as _order_PriceLevel, PriceLevel__Output as _order_PriceLevel__Output } from './order/PriceLevel';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  order: {
    GetEngineStatusRequest: MessageTypeDefinition<_order_GetEngineStatusRequest, _order_GetEngineStatusRequest__Output>
    GetEngineStatusResponse: MessageTypeDefinition<_order_GetEngineStatusResponse, _order_GetEngineStatusResponse__Output>
    GetOrderBookRequest: MessageTypeDefinition<_order_GetOrderBookRequest, _order_GetOrderBookRequest__Output>
    GetOrderBookResponse: MessageTypeDefinition<_order_GetOrderBookResponse, _order_GetOrderBookResponse__Output>
    MatchingEngine: SubtypeConstructor<typeof grpc.Client, _order_MatchingEngineClient> & { service: _order_MatchingEngineDefinition }
    PriceLevel: MessageTypeDefinition<_order_PriceLevel, _order_PriceLevel__Output>
  }
}

