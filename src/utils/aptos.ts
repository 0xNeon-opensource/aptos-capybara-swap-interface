/* eslint-disable */
import { firstNft } from './first_nft'
import { RestClient, TESTNET_URL, FaucetClient, FAUCET_URL, Account, firstTransaction } from './first_transaction';

export const aptosSwap = async () => {
  console.log('Swapping on Aptos')
  // Gets the address of the account signed into the wallet
  const accountAddress = await (window as any).aptos.account()

  const restClient = new RestClient(TESTNET_URL);
  const faucetClient = new FaucetClient(FAUCET_URL, restClient);

  const alice = new Account()
  console.log('alice :>> ', alice.address());
  await delay(1000);
  await faucetClient.fundAccount(alice.address(), 10_000_000)
  await delay(1000);
  
  const result = await createPool(restClient, alice, '20', '10', '2')

  console.log('result :>> ', result);

  // firstTransaction();
}

async function createPool(
  client: RestClient,
  account: Account,
  amountCoin1: string,
  amountCoin2: string,
  share: string,
  ) {
  const payload: { function: string; arguments: string[]; type: string; type_arguments: any[] } = {
    type: "script_function_payload",
    function: "0x8bf9fee83e950babdd8b5eae3066f3cb57c18a27f5fe92556b189c0f30232535::CoinSwap::create_pool",
    type_arguments: [],
    arguments: [
      amountCoin1,
      amountCoin2,
      share,
    ]
  }
  return await submitTransactionHelper(client, account, payload)
}


/** Returns the test coin balance associated with the account */
export async function accountBalance(this: any, accountAddress: string): Promise<number | null> {
  const resource = await this.accountResource(accountAddress, '0x1::TestCoin::Balance')
  if (resource == null) {
    return null
  }
  return parseInt(resource['data']['coin']['value'])
}

async function submitTransactionHelper(restClient: RestClient, account: Account, payload: Record<string, any>) {
  const txn_request = await restClient.generateTransaction(account.address(), payload)
  const signed_txn = await restClient.signTransaction(account, txn_request)
  const res = await restClient.submitTransaction(signed_txn)
  await restClient.waitForTransaction(res["hash"])
  return res["hash"]
}

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}