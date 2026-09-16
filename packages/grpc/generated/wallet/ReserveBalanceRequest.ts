// Original file: proto/wallet.proto


export interface ReserveBalanceRequest {
  'userId'?: (string);
  'assetSymbol'?: (string);
  'amount'?: (string);
  'referenceId'?: (string);
}

export interface ReserveBalanceRequest__Output {
  'userId': (string);
  'assetSymbol': (string);
  'amount': (string);
  'referenceId': (string);
}
