import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { ReleaseBalanceRequest as _wallet_ReleaseBalanceRequest, ReleaseBalanceRequest__Output as _wallet_ReleaseBalanceRequest__Output } from './wallet/ReleaseBalanceRequest';
import type { ReleaseBalanceResponse as _wallet_ReleaseBalanceResponse, ReleaseBalanceResponse__Output as _wallet_ReleaseBalanceResponse__Output } from './wallet/ReleaseBalanceResponse';
import type { ReserveBalanceRequest as _wallet_ReserveBalanceRequest, ReserveBalanceRequest__Output as _wallet_ReserveBalanceRequest__Output } from './wallet/ReserveBalanceRequest';
import type { ReserveBalanceResponse as _wallet_ReserveBalanceResponse, ReserveBalanceResponse__Output as _wallet_ReserveBalanceResponse__Output } from './wallet/ReserveBalanceResponse';
import type { WalletServiceClient as _wallet_WalletServiceClient, WalletServiceDefinition as _wallet_WalletServiceDefinition } from './wallet/WalletService';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  wallet: {
    ReleaseBalanceRequest: MessageTypeDefinition<_wallet_ReleaseBalanceRequest, _wallet_ReleaseBalanceRequest__Output>
    ReleaseBalanceResponse: MessageTypeDefinition<_wallet_ReleaseBalanceResponse, _wallet_ReleaseBalanceResponse__Output>
    ReserveBalanceRequest: MessageTypeDefinition<_wallet_ReserveBalanceRequest, _wallet_ReserveBalanceRequest__Output>
    ReserveBalanceResponse: MessageTypeDefinition<_wallet_ReserveBalanceResponse, _wallet_ReserveBalanceResponse__Output>
    WalletService: SubtypeConstructor<typeof grpc.Client, _wallet_WalletServiceClient> & { service: _wallet_WalletServiceDefinition }
  }
}

