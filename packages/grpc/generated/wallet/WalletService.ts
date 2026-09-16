// Original file: proto/wallet.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { ReleaseBalanceRequest as _wallet_ReleaseBalanceRequest, ReleaseBalanceRequest__Output as _wallet_ReleaseBalanceRequest__Output } from '../wallet/ReleaseBalanceRequest';
import type { ReleaseBalanceResponse as _wallet_ReleaseBalanceResponse, ReleaseBalanceResponse__Output as _wallet_ReleaseBalanceResponse__Output } from '../wallet/ReleaseBalanceResponse';
import type { ReserveBalanceRequest as _wallet_ReserveBalanceRequest, ReserveBalanceRequest__Output as _wallet_ReserveBalanceRequest__Output } from '../wallet/ReserveBalanceRequest';
import type { ReserveBalanceResponse as _wallet_ReserveBalanceResponse, ReserveBalanceResponse__Output as _wallet_ReserveBalanceResponse__Output } from '../wallet/ReserveBalanceResponse';

export interface WalletServiceClient extends grpc.Client {
  ReleaseBalance(argument: _wallet_ReleaseBalanceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_wallet_ReleaseBalanceResponse__Output>): grpc.ClientUnaryCall;
  ReleaseBalance(argument: _wallet_ReleaseBalanceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_wallet_ReleaseBalanceResponse__Output>): grpc.ClientUnaryCall;
  ReleaseBalance(argument: _wallet_ReleaseBalanceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_wallet_ReleaseBalanceResponse__Output>): grpc.ClientUnaryCall;
  ReleaseBalance(argument: _wallet_ReleaseBalanceRequest, callback: grpc.requestCallback<_wallet_ReleaseBalanceResponse__Output>): grpc.ClientUnaryCall;
  releaseBalance(argument: _wallet_ReleaseBalanceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_wallet_ReleaseBalanceResponse__Output>): grpc.ClientUnaryCall;
  releaseBalance(argument: _wallet_ReleaseBalanceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_wallet_ReleaseBalanceResponse__Output>): grpc.ClientUnaryCall;
  releaseBalance(argument: _wallet_ReleaseBalanceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_wallet_ReleaseBalanceResponse__Output>): grpc.ClientUnaryCall;
  releaseBalance(argument: _wallet_ReleaseBalanceRequest, callback: grpc.requestCallback<_wallet_ReleaseBalanceResponse__Output>): grpc.ClientUnaryCall;
  
  ReserveBalance(argument: _wallet_ReserveBalanceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_wallet_ReserveBalanceResponse__Output>): grpc.ClientUnaryCall;
  ReserveBalance(argument: _wallet_ReserveBalanceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_wallet_ReserveBalanceResponse__Output>): grpc.ClientUnaryCall;
  ReserveBalance(argument: _wallet_ReserveBalanceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_wallet_ReserveBalanceResponse__Output>): grpc.ClientUnaryCall;
  ReserveBalance(argument: _wallet_ReserveBalanceRequest, callback: grpc.requestCallback<_wallet_ReserveBalanceResponse__Output>): grpc.ClientUnaryCall;
  reserveBalance(argument: _wallet_ReserveBalanceRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_wallet_ReserveBalanceResponse__Output>): grpc.ClientUnaryCall;
  reserveBalance(argument: _wallet_ReserveBalanceRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_wallet_ReserveBalanceResponse__Output>): grpc.ClientUnaryCall;
  reserveBalance(argument: _wallet_ReserveBalanceRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_wallet_ReserveBalanceResponse__Output>): grpc.ClientUnaryCall;
  reserveBalance(argument: _wallet_ReserveBalanceRequest, callback: grpc.requestCallback<_wallet_ReserveBalanceResponse__Output>): grpc.ClientUnaryCall;
  
}

export interface WalletServiceHandlers extends grpc.UntypedServiceImplementation {
  ReleaseBalance: grpc.handleUnaryCall<_wallet_ReleaseBalanceRequest__Output, _wallet_ReleaseBalanceResponse>;
  
  ReserveBalance: grpc.handleUnaryCall<_wallet_ReserveBalanceRequest__Output, _wallet_ReserveBalanceResponse>;
  
}

export interface WalletServiceDefinition extends grpc.ServiceDefinition {
  ReleaseBalance: MethodDefinition<_wallet_ReleaseBalanceRequest, _wallet_ReleaseBalanceResponse, _wallet_ReleaseBalanceRequest__Output, _wallet_ReleaseBalanceResponse__Output>
  ReserveBalance: MethodDefinition<_wallet_ReserveBalanceRequest, _wallet_ReserveBalanceResponse, _wallet_ReserveBalanceRequest__Output, _wallet_ReserveBalanceResponse__Output>
}
