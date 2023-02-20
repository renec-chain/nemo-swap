import * as anchor from "@project-serum/anchor";
import * as assert from "assert";
import { toTx, WhirlpoolContext, WhirlpoolIx, WhirlpoolsConfigData } from "../../src";
import { generateDefaultConfigParams } from "../utils/test-builders";

describe("set_pool_creator_authority", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Whirlpool;
  const ctx = WhirlpoolContext.fromWorkspace(provider, program);
  const fetcher = ctx.fetcher;

  it("successfully set_pool_creator_authority", async () => {
    const {
      configInitInfo,
    } = generateDefaultConfigParams(ctx);
    const defaultPoolCreatorWallet = ctx.wallet
    await toTx(ctx, WhirlpoolIx.initializeConfigIx(ctx.program, configInitInfo)).buildAndExecute();
    const newAuthorityKeypair = anchor.web3.Keypair.generate();
    await toTx(
      ctx,
      WhirlpoolIx.setPoolCreatorAuthorityIx(ctx.program, {
        whirlpoolsConfig: configInitInfo.whirlpoolsConfigKeypair.publicKey,
        poolCreatorAuthority: defaultPoolCreatorWallet.publicKey,
        newPoolCreatorAuthority: newAuthorityKeypair.publicKey,
      })
    )
      .buildAndExecute();
      
    const config = (await fetcher.getConfig(
      configInitInfo.whirlpoolsConfigKeypair.publicKey
    )) as WhirlpoolsConfigData;
    assert.ok(config.poolCreatorAuthority.equals(newAuthorityKeypair.publicKey));
  });

  it("fails if invalid pool_creator_authority provided", async () => {
    const { configInitInfo } = generateDefaultConfigParams(ctx);
    await toTx(ctx, WhirlpoolIx.initializeConfigIx(ctx.program, configInitInfo)).buildAndExecute();
    const otherAuthorityKeypair = anchor.web3.Keypair.generate();

    await assert.rejects(
      toTx(
        ctx,
        WhirlpoolIx.setPoolCreatorAuthorityIx(ctx.program, {
          whirlpoolsConfig: configInitInfo.whirlpoolsConfigKeypair.publicKey,
          poolCreatorAuthority: otherAuthorityKeypair.publicKey,
          newPoolCreatorAuthority: provider.wallet.publicKey,
        })
      )
      .addSigner(otherAuthorityKeypair)
      .buildAndExecute(),
      /0x7dc/ // An address constraint was violated
    );
  });
});
