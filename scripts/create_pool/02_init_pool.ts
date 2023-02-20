import { PublicKey, Keypair } from '@solana/web3.js'
import {
  PDAUtil, FeeTierData,
  buildWhirlpoolClient, PriceMath
} from '@renec/redex-sdk'
import { loadProvider, getTokenMintInfo } from './utils'
import Decimal from 'decimal.js'
import config from './config.json'
import deployed from './deployed.json'

async function main() {
  const { ctx } = await loadProvider()
  if (deployed.REDEX_CONFIG_PUB === '') {
    console.log('ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` .')
    return 
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB)
  const client = buildWhirlpoolClient(ctx)

  for (let i = 0; i < config.POOLS.length; i++) {
    const pool = config.POOLS[i]
    const mintAPub = new PublicKey(pool.TOKEN_MINT_A)
    const mintBPub = new PublicKey(pool.TOKEN_MINT_B)
    const tokenMintA = await getTokenMintInfo(ctx, mintAPub)
    const tokenMintB = await getTokenMintInfo(ctx, mintBPub)

    if (tokenMintA && tokenMintB) {
      console.log('===================================================')
      console.log('token_a:', mintAPub.toBase58())
      console.log('token_b:', mintBPub.toBase58())
      console.log('tick_spacing:', pool.TICK_SPACING)
      
      const whirlpoolPda = PDAUtil.getWhirlpool(
        ctx.program.programId,
        REDEX_CONFIG_PUB,
        mintAPub,
        mintBPub,
        pool.TICK_SPACING
      )

      try {
        const whirlpool = await client.getPool(whirlpoolPda.publicKey)
        if (whirlpool) {
          const price = PriceMath.sqrtPriceX64ToPrice(whirlpool.getData().sqrtPrice, tokenMintA.decimals, tokenMintB.decimals)
          console.log('price_b_per_a:', price.toFixed(6))
          console.log('pool_pub:', whirlpoolPda.publicKey.toBase58())
          return
        }
      } catch(e) {
        // This pool not existed
      }
      console.log('deploying new pool...')

      const currentA2BPrice = new Decimal(pool.INIT_AMOUNT_B_PER_A)
      const tickIndex = PriceMath.priceToInitializableTickIndex(
        currentA2BPrice, 
        tokenMintA.decimals,
        tokenMintB.decimals,
        pool.TICK_SPACING
      )
      const {poolKey, tx} = await client.createPool(
        REDEX_CONFIG_PUB,
        pool.TOKEN_MINT_A,
        pool.TOKEN_MINT_B,
        pool.TICK_SPACING,
        tickIndex,
        ctx.wallet.publicKey
      )
      const txid = await tx.buildAndExecute()
      console.log('new pool account deployed at txid:', txid)
    }
  }
}

main().catch((reason) => {
  console.log('ERROR:', reason)
}) 