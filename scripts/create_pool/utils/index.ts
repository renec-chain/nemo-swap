import { PublicKey, Connection, Keypair } from '@solana/web3.js'
import { AnchorProvider, Wallet, BN, Address } from '@project-serum/anchor'
import { WhirlpoolContext, TokenInfo, WhirlpoolClient, buildWhirlpoolClient } from '@renec/redex-sdk'
import { NATIVE_MINT, u64 } from '@solana/spl-token'
import config from '../config.json'
import payerWallet from '../wallets/payer.json'
import collectProtocolFeesAuthWallet from '../wallets/collect_protocol_fees_authority_wallet.json'
import feeAuthWallet from '../wallets/fee_authority_wallet.json'
import rewardEmissionSupperAuthWallet from '../wallets/reward_emissions_supper_authority_wallet.json'

export const ZERO_BN = new BN(0)
export const ONE_SOL = 1000000000

export const loadProvider = async function () {
  const wallets = await loadWallets()
  const connection = new Connection(config.RPC_ENDPOINT_URL)
  const wallet = new Wallet(wallets.payerKeypair)
  const provider = new AnchorProvider(connection, wallet, {})
  const ctx = WhirlpoolContext.withProvider(provider, new PublicKey(config.REDEX_PROGRAM_ID))
  console.log('endpoint:', ctx.connection.rpcEndpoint)
  console.log('wallet pubkey:', ctx.wallet.publicKey.toBase58())

  return {
    provider,
    ctx,
    wallets
  }
}

export const loadWallets = async function () {
  return {
    payerKeypair: Keypair.fromSecretKey(Uint8Array.from(payerWallet)),
    collectProtocolFeesAuthKeypair: Keypair.fromSecretKey(Uint8Array.from(collectProtocolFeesAuthWallet)),
    feeAuthKeypair: Keypair.fromSecretKey(Uint8Array.from(feeAuthWallet)),
    rewardEmissionSupperAuthKeypair: Keypair.fromSecretKey(Uint8Array.from(rewardEmissionSupperAuthWallet))
  }
}

export const getNativeMintInfo = async function () {
  const nativeMint: TokenInfo = {
    mintAuthority: null,
    supply: ZERO_BN,
    decimals: 9,
    isInitialized: true,
    freezeAuthority: null,
    mint: NATIVE_MINT
  }
  return nativeMint
}

export const getTokenMintInfo = async function (ctx: WhirlpoolContext, address: PublicKey) {
  if (address.equals(NATIVE_MINT)) {
    const nativeMint = await getNativeMintInfo()
    return nativeMint
  }
  const mint = await ctx.fetcher.getMintInfo(address)
  return mint
}

export const delay = async function (milliseconds : number) {
  return new Promise(resolve => setTimeout( resolve, milliseconds))
}

export const mapTickSpacing = {
  1: 'One',
  8: 'Stable',
  32: 'ThirtyTwo',
  64: 'SixtyFour',
  128: 'Standard'
}

export enum TickSpacing {
    One = 1,
    Stable = 8,
    ThirtyTwo = 32,
    SixtyFour = 64,
    Standard = 128,
}