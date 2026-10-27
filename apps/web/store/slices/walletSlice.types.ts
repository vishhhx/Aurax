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
  /** Latest applied balance.updated version per assetId */
  versions: Record<string, number>
  isLoading: boolean
  error: string | null
}
