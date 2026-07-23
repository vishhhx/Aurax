import { DepositRepository } from "../repositories/deposit.repository";
import { AssetRepository } from "../repositories/asset.repository";

export interface CreateDepositInput {
  amount: number;
  userId: string;
  assetId: string;
  network?: string;
}

export class DepositService {
  constructor(
    private readonly depositRepository = new DepositRepository(),
    private readonly assetRepository = new AssetRepository(),
  ) {}

  async createDeposit(data: CreateDepositInput) {
    //  for now phase 1 we will only support USDC deposits, so we will hardcode the assetId for USDC
    const asset = await this.assetRepository.getAssetIdBySymbol("USDC");
    if (!asset) {
      throw new Error("Asset not found");
    }
    return this.depositRepository.createDeposit({
      ...data,
    });
  }
  async updateOrderId(depositId: string, orderId: string) {
    return this.depositRepository.updateOrderId(depositId, orderId);
  }
}
