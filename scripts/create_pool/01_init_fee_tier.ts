import { PublicKey, Keypair } from '@solana/web3.js'
import {
  WhirlpoolsConfigData, WhirlpoolIx, InitFeeTierParams, toTx, PDAUtil, FeeTierData
} from '@renec/redex-sdk'
import { loadProvider, delay } from './utils'
import config from './config.json'
import deployed from './deployed.json'
const fs = require('fs')
const deployedPath = './create_pool/deployed.json'

async function main() {
  const { ctx, wallets } = await loadProvider()

  if (deployed.REDEX_CONFIG_PUB === '') {
    console.log('ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` .')
    return
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB)
  const configAccount = (await ctx.fetcher.getConfig(
    REDEX_CONFIG_PUB
  )) as WhirlpoolsConfigData

  if (configAccount) {
    for (let i = 0; i < config.FEE_TIERS.length; i++) {
      const feeTier = config.FEE_TIERS[i]
      const feeTierPda = PDAUtil.getFeeTier(
        ctx.program.programId,
        REDEX_CONFIG_PUB,
        feeTier.TICK_SPACING
      )
      let feeTierAccount = (await ctx.fetcher.getFeeTier(feeTierPda.publicKey)) as FeeTierData
      if (feeTierAccount) {
        printFeeTier(feeTierPda.publicKey, feeTierAccount)
        continue
      }
      console.log('deploying fee tier account...')
      const params: InitFeeTierParams = {
        feeTierPda,
        whirlpoolsConfig: REDEX_CONFIG_PUB,
        tickSpacing: feeTier.TICK_SPACING,
        defaultFeeRate: feeTier.DEFAULT_FEE_RATE,
        feeAuthority: configAccount.feeAuthority,
        funder: ctx.wallet.publicKey,
      }
      const tx = toTx(ctx, WhirlpoolIx.initializeFeeTierIx(ctx.program, params)).addSigner(
        wallets.feeAuthKeypair
      )
      const txid = await tx.buildAndExecute()
      console.log('fee tier account deployed at txid:', txid)
    }
  }
}

function printFeeTier(publicKey: PublicKey, feeTierAccount: FeeTierData) {
  console.log('===================================================')
  console.log('Fee Tier Account Info:')
  console.log('public_key:', publicKey.toBase58())
  console.log('tick_spacing:', feeTierAccount.tickSpacing)
  console.log('default_fee_rate:', feeTierAccount.defaultFeeRate)
  console.log('===================================================')
}

main().catch((reason) => {
  console.log('ERROR:', reason)
}) 