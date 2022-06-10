const algosdk = require('algosdk');

const algodClient = new algosdk.Algodv2(
  process.env.ALGOD_TOKEN,
  process.env.ALGOD_SERVER,
  process.env.ALGOD_PORT,
);

const creator = algosdk.mnemonicToSecretKey(process.env.MNEMONIC_CREATOR);

/**
 * Atomic Transfer Example
 * 1. Transaction 1 - send 100000 microAlgos from A to C
 * 2. Transaction 2 - send 200000 microAlgos from B to A
 * 3. Group these transactions and submit them to the network
 */

const submitToNetwork = async (signedTxn) => {
  // send txn
  let tx = await algodClient.sendRawTransaction(signedTxn).do();
  console.log("Transaction : " + tx.txId);

  // Wait for transaction to be confirmed
  confirmedTxn = await algosdk.waitForConfirmation(algodClient, tx.txId, 4);

  //Get the completed Transaction
  console.log(
    "Transaction " +
      tx.txId +
      " confirmed in round " +
      confirmedTxn["confirmed-round"]
  );

  return confirmedTxn;
};

const sendPayment = async (sender, receiver, amount) => {
  // create suggested parameters
  const suggestedParams = await algodClient.getTransactionParams().do();

  let txn = algosdk.makePaymentTxnWithSuggestedParams(
    sender.addr,
    receiver.addr,
    amount,
    undefined,
    undefined,
    suggestedParams
  );

  // sign the transaction
  const signedTxn = txn.signTxn(sender.sk);

  return await submitToNetwork(signedTxn);
};

async function submitAtomicTransfer() {
  try {
    // create 3 accounts
    let accountA = algosdk.generateAccount();
    let accountB = algosdk.generateAccount();
    let accountC = algosdk.generateAccount();

    // fund 3 accounts with 1 Algos each
    await sendPayment(creator, accountA, 1000000);
    await sendPayment(creator, accountB, 1000000);
    await sendPayment(creator, accountC, 1000000);

    // get suggested params from the network
    let params = await algodClient.getTransactionParams().do();

    // Transaction - send 100000 microAlgos from A to C
    let transaction1 = algosdk.makePaymentTxnWithSuggestedParams(
      accountA.addr,
      accountC.addr,
      100000,
      undefined,
      undefined,
      params
    );

    // Transaction - send 200000 microAlgos from B to A
    let transaction2 = algosdk.makePaymentTxnWithSuggestedParams(
      accountB.addr,
      accountA.addr,
      200000,
      undefined,
      undefined,
      params
    );

    // Store both transactions
    let txns = [transaction1, transaction2];

    // Group both transactions
    let txgroup = algosdk.assignGroupID(txns);

    // Sign each transaction in the group
    let signedTx1 = transaction1.signTxn(accountA.sk);
    let signedTx2 = transaction2.signTxn(accountB.sk);

    // Combine the signed transactions
    let signed = [];
    signed.push(signedTx1);
    signed.push(signedTx2);

    // Submit Txn
    await submitToNetwork(signed);

    // Get balances
    console.log("A should have 1000000 - 100000 (txn 1) - 1000 (txn 1 fees) + 200000 (receive from B) = 1099000 microAlgos");
    console.log("Account A balance: ", (await algodClient.accountInformation(accountA.addr).do()).amount);

    console.log("B should have 1000000 - 200000 (txn 2) - 1000 (txn 2 fees) = 799000 microAlgos");
    console.log("Account B balance: ", (await algodClient.accountInformation(accountB.addr).do()).amount);

    console.log("C should have 1000000 + 100000 (receive from A) = 1100000 microAlgos");
    console.log("Account C balance: ", (await algodClient.accountInformation(accountC.addr).do()).amount);

  } catch (err) {
    console.log('err', err);
  }
}

submitAtomicTransfer();
