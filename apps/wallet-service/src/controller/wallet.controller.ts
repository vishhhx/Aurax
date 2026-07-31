import { ApiReponse, asyncHandler, ApiError } from "@repo/core/rest";
import type { Request, Response } from "express";
import { AssetRepository } from "../repositories/asset.repository";
import { WalletRepository } from "../repositories/wallet.repository";

export const getAssetsAndWalletDetails = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ApiError(401, "User not authenticated");
    }

    const assetRepo = new AssetRepository();
    const walletRepo = new WalletRepository();
    const [allAssets, userWallets] = await Promise.all([
      assetRepo.getAllAssets(),

      walletRepo.getUserWallets(userId),
    ]);
  
    const walletMap = new Map(
      userWallets.map((wallet) => [wallet.assetId, wallet]),
    );
    const assetsWithBalances = allAssets.map((asset) => {
      const wallet = walletMap.get(asset.assetId);
      return {
        ...asset,
        availableBalance: wallet ? wallet.availableBalance : 0,
        lockedBalance: wallet ? wallet.lockedBalance : 0,
      };
    });
    return res
      .status(200)
      .json(
        new ApiReponse(
          true,
          assetsWithBalances,
          "Assets and wallet details retrieved successfully",
          200,
        ),
      );
  },
);
