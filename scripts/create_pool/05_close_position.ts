import { PublicKey, Keypair } from '@solana/web3.js'
import {
  PDAUtil, buildWhirlpoolClient, PriceMath, increaseLiquidityQuoteByInputTokenWithParams
} from '@renec/redex-sdk'
import { DecimalUtil, Percentage } from '@orca-so/common-sdk'
import { loadProvider, delay, getTokenMintInfo } from './utils'
import Decimal from 'decimal.js'
import config from './config.json'
import deployed from './deployed.json'

async function main() {
  const { ctx, wallets } = await loadProvider()
  if (deployed.REDEX_CONFIG_PUB === '') {
    console.log('ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` .')
    return 
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB)
  const client = buildWhirlpoolClient(ctx)
  const positions = await client.getAllPositionsOf(ctx.wallet.publicKey)

  for (let i = 0; i < config.POOLS.length; i++) {
    const pool = config.POOLS[i]
    const mintAPub = new PublicKey(pool.TOKEN_MINT_A)
    const mintBPub = new PublicKey(pool.TOKEN_MINT_B)
    const tokenMintA = await getTokenMintInfo(ctx, mintAPub)
    const tokenMintB = await getTokenMintInfo(ctx, mintBPub)

    if (tokenMintA && tokenMintB) {
      const whirlpoolPda = PDAUtil.getWhirlpool(
        ctx.program.programId,
        REDEX_CONFIG_PUB,
        mintAPub,
        mintBPub,
        pool.TICK_SPACING
      )
      const whirlpool = await client.getPool(whirlpoolPda.publicKey)
      const tx = await whirlpool.closePosition(positions[0].getAddress(), Percentage.fromDecimal(new Decimal(10)))

      const txid = await tx[0].buildAndExecute()
      console.log('open a new position at txid:', txid)
    }
  }
}

main().catch((reason) => {
  console.log('ERROR:', reason)
}) 