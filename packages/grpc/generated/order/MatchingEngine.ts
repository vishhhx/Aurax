// Original file: proto/order.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { GetEngineStatusRequest as _order_GetEngineStatusRequest, GetEngineStatusRequest__Output as _order_GetEngineStatusRequest__Output } from '../order/GetEngineStatusRequest';
import type { GetEngineStatusResponse as _order_GetEngineStatusResponse, GetEngineStatusResponse__Output as _order_GetEngineStatusResponse__Output } from '../order/GetEngineStatusResponse';
import type { GetOrderBookRequest as _order_GetOrderBookRequest, GetOrderBookRequest__Output as _order_GetOrderBookRequest__Output } from '../order/GetOrderBookRequest';
import type { GetOrderBookResponse as _order_GetOrderBookResponse, GetOrderBookResponse__Output as _order_GetOrderBookResponse__Output } from '../order/GetOrderBookResponse';

export interface MatchingEngineClient extends grpc.Client {
  GetEngineStatus(argument: _order_GetEngineStatusRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_order_GetEngineStatusResponse__Output>): grpc.ClientUnaryCall;
  GetEngineStatus(argument: _order_GetEngineStatusRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_order_GetEngineStatusResponse__Output>): grpc.ClientUnaryCall;
  GetEngineStatus(argument: _order_GetEngineStatusRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_order_GetEngineStatusResponse__Output>): grpc.ClientUnaryCall;
  GetEngineStatus(argument: _order_GetEngineStatusRequest, callback: grpc.requestCallback<_order_GetEngineStatusResponse__Output>): grpc.ClientUnaryCall;
  getEngineStatus(argument: _order_GetEngineStatusRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_order_GetEngineStatusResponse__Output>): grpc.ClientUnaryCall;
  getEngineStatus(argument: _order_GetEngineStatusRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_order_GetEngineStatusResponse__Output>): grpc.ClientUnaryCall;
  getEngineStatus(argument: _order_GetEngineStatusRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_order_GetEngineStatusResponse__Output>): grpc.ClientUnaryCall;
  getEngineStatus(argument: _order_GetEngineStatusRequest, callback: grpc.requestCallback<_order_GetEngineStatusResponse__Output>): grpc.ClientUnaryCall;
  
  GetOrderBook(argument: _order_GetOrderBookRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_order_GetOrderBookResponse__Output>): grpc.ClientUnaryCall;
  GetOrderBook(argument: _order_GetOrderBookRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_order_GetOrderBookResponse__Output>): grpc.ClientUnaryCall;
  GetOrderBook(argument: _order_GetOrderBookRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_order_GetOrderBookResponse__Output>): grpc.ClientUnaryCall;
  GetOrderBook(argument: _order_GetOrderBookRequest, callback: grpc.requestCallback<_order_GetOrderBookResponse__Output>): grpc.ClientUnaryCall;
  getOrderBook(argument: _order_GetOrderBookRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_order_GetOrderBookResponse__Output>): grpc.ClientUnaryCall;
  getOrderBook(argument: _order_GetOrderBookRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_order_GetOrderBookResponse__Output>): grpc.ClientUnaryCall;
  getOrderBook(argument: _order_GetOrderBookRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_order_GetOrderBookResponse__Output>): grpc.ClientUnaryCall;
  getOrderBook(argument: _order_GetOrderBookRequest, callback: grpc.requestCallback<_order_GetOrderBookResponse__Output>): grpc.ClientUnaryCall;
  
}

export interface MatchingEngineHandlers extends grpc.UntypedServiceImplementation {
  GetEngineStatus: grpc.handleUnaryCall<_order_GetEngineStatusRequest__Output, _order_GetEngineStatusResponse>;
  
  GetOrderBook: grpc.handleUnaryCall<_order_GetOrderBookRequest__Output, _order_GetOrderBookResponse>;
  
}

export interface MatchingEngineDefinition extends grpc.ServiceDefinition {
  GetEngineStatus: MethodDefinition<_order_GetEngineStatusRequest, _order_GetEngineStatusResponse, _order_GetEngineStatusRequest__Output, _order_GetEngineStatusResponse__Output>
  GetOrderBook: MethodDefinition<_order_GetOrderBookRequest, _order_GetOrderBookResponse, _order_GetOrderBookRequest__Output, _order_GetOrderBookResponse__Output>
}
