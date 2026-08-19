// Demo helper: create a Privy Stellar "user" wallet on testnet, fund it
// via friendbot, and send XLM with the owner's deposit memo to the pool
// — a real on-chain deposit, signed by Privy.
//
// Usage: npx tsx scripts/demo-user-wallet.ts <pool-address> <memo> [amountXlm]

import { PrivyClient } from '@privy-io/node';

import { loadConfig } from '../src/config.js';
import { privySigner, sendPayment } from '../src/chain/treasury.js';

const [poolAddress, memo, amountArg] = process.argv.slice(2);
if (!poolAddress || !memo) {
  console.error('usage: demo-user-wallet.ts <pool-address> <memo> [amountXlm]');
  process.exit(1);
}

const config = loadConfig();
if (!config.PRIVY_APP_ID || !config.PRIVY_APP_SECRET) throw new Error('Privy credentials missing.');
const privy = new PrivyClient({ appId: config.PRIVY_APP_ID, appSecret: config.PRIVY_APP_SECRET });

console.log('creating user wallet via Privy…');
const wallet = await privy.wallets().create({ chain_type: 'stellar', display_name: 'fastcards-demo-user' });
console.log('user wallet:', wallet.address, `(privy id ${wallet.id})`);

console.log('funding via friendbot…');
const fb = await fetch(`https://friendbot.stellar.org/?addr=${wallet.address}`);
if (!fb.ok) throw new Error(`friendbot failed: ${fb.status}`);
console.log('funded.');

const amount = amountArg ?? '100';
console.log(`sending ${amount} XLM → ${poolAddress} memo "${memo}" (signed via Privy raw_sign)…`);
const { hash } = await sendPayment(privySigner(privy, wallet.id, wallet.address), {
  to: poolAddress,
  amount: Number(amount).toFixed(7),
  memoText: memo,
});
console.log('on-chain tx:', hash);
console.log('user wallet address for withdrawals:', wallet.address);
