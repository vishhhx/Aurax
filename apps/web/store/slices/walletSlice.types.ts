export interface WalletAsset {
  assetId: string
  symbol: string
  name: string
  imageUrl: string
  decimals: number
  network?: string
  depositEnabled: boolean
  withdrawalEnabled: boolean
  minDeposit: string
  minWithdrawal: string
  createdAt: string
  updatedAt: string
  availableBalance: string | number
  lockedBalance: string | number
}

export interface WalletState {
  assets: WalletAsset[]
  isLoading: boolean
  error: string | null
}
