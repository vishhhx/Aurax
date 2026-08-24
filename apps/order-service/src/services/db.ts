import { AssetRepository } from "../repositories/assets.repositorie";

export class AssetService {
  constructor(private readonly assetRepository = new AssetRepository()) {}

  async isAssetExist(symbol: string): Promise<boolean> {
    const asset = await this.assetRepository.getAssetById(symbol);
    return !!asset;
  }
}
