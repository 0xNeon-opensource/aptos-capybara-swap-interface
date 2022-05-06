export const aptosSwap = async () => {
  console.log('Swapping on Aptos')
  // Gets the address of the account signed into the wallet
  const accountAddress = await (window as any).aptos.account()
  // Create a transaction dictionary
  const transaction = {
    type: 'script_function_payload',
    function: '0x1::TestCoin::transfer',
    type_arguments: [],
    arguments: [accountAddress, 1],
  }
  // Send transaction to the extension to be signed and submitted to chain
  const response = await (window as any).aptos.signAndSubmitTransaction(transaction)
}

/** Returns the test coin balance associated with the account */
export async function accountBalance(this: any, accountAddress: string): Promise<number | null> {
  const resource = await this.accountResource(accountAddress, '0x1::TestCoin::Balance')
  if (resource == null) {
    return null
  }
  return parseInt(resource['data']['coin']['value'])
}
