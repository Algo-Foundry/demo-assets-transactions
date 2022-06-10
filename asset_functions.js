const algosdk = require("algosdk");

const algodClient = new algosdk.Algodv2(
  process.env.ALGOD_TOKEN,
  process.env.ALGOD_SERVER,
  process.env.ALGOD_PORT
);

const creator = algosdk.mnemonicToSecretKey(process.env.MNEMONIC_CREATOR);

const { addr: freezeAddr } = creator; // account that can freeze other accounts for this asset
const { addr: managerAddr } = creator; // account able to update asset configuration
const { addr: clawbackAddr } = creator; // account allowed to take this asset from any other account
const { addr: reserveAddr } = creator; // account that holds reserves for this asset

// we will modify the clawback address with a new one
const { addr: newClawbackAddr } = algosdk.generateAccount(); // account allowed to take this asset from any other account

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

const fundAccount = async (receiver, amount) => {
  // create suggested parameters
  const suggestedParams = await algodClient.getTransactionParams().do();

  let txn = algosdk.makePaymentTxnWithSuggestedParams(
    creator.addr,
    receiver.addr,
    amount,
    undefined,
    undefined,
    suggestedParams
  );

  // sign the transaction
  const signedTxn = txn.signTxn(creator.sk);

  const confirmedTxn = await submitToNetwork(signedTxn);
};

const createAsset = async () => {
  const total = 1000000; // how many of this asset there will be
  const decimals = 0; // units of this asset are whole-integer amounts
  const assetName = "TESTASSET";
  const unitName = "TA";
  const url = "website";
  const metadata = undefined;
  const defaultFrozen = false; // whether accounts should be frozen by default

  // create suggested parameters
  const suggestedParams = await algodClient.getTransactionParams().do();

  // create the asset creation transaction
  const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
    from: creator.addr,
    total,
    decimals,
    assetName,
    unitName,
    assetURL: url,
    assetMetadataHash: metadata,
    defaultFrozen,

    freeze: freezeAddr,
    manager: managerAddr,
    clawback: clawbackAddr,
    reserve: reserveAddr,

    suggestedParams,
  });

  // sign the transaction
  const signedTxn = txn.signTxn(creator.sk);

  return await submitToNetwork(signedTxn);
};

const modifyAsset = async (assetId) => {
  // create suggested parameters
  const suggestedParams = await algodClient.getTransactionParams().do();

  /**
   * Only manager, reserve, freeze and clawback addresses can be changed
   */
  let txn = algosdk.makeAssetConfigTxnWithSuggestedParams(
    managerAddr,
    undefined,
    assetId,
    managerAddr,
    reserveAddr,
    freezeAddr,
    newClawbackAddr,
    suggestedParams
  );

  // sign the transaction - manager is the creator, using creator's private key to sign the txn
  const signedTxn = txn.signTxn(creator.sk);

  return await submitToNetwork(signedTxn);
};

const assetOptIn = async (receiver, assetId) => {
  // create suggested parameters
  const suggestedParams = await algodClient.getTransactionParams().do();

  let txn = algosdk.makeAssetTransferTxnWithSuggestedParams(
    receiver.addr,
    receiver.addr,
    undefined,
    undefined,
    0,
    undefined,
    assetId,
    suggestedParams
  );

  // sign the transaction
  const signedTxn = txn.signTxn(receiver.sk);

  return await submitToNetwork(signedTxn);
};

const transferAsset = async (receiver, assetId, amount) => {
  // create suggested parameters
  const suggestedParams = await algodClient.getTransactionParams().do();
  
  let txn = algosdk.makeAssetTransferTxnWithSuggestedParams(
    creator.addr,
    receiver.addr,
    undefined,
    undefined,
    amount,
    undefined,
    assetId,
    suggestedParams
  );

  // sign the transaction
  const signedTxn = txn.signTxn(creator.sk);

  return await submitToNetwork(signedTxn);
};

const getCreatedAsset = async (account, assetId) => {
  let accountInfo = await algodClient.accountInformation(account.addr).do();

  const asset = accountInfo["created-assets"].find((asset) => {
    return asset["index"] === assetId;
  });

  return asset;
};

const getAssetHoldings = async (account, assetId) => {
  let accountInfo = await algodClient.accountInformation(account.addr).do();

  const asset = accountInfo["assets"].find((asset) => {
    return asset["asset-id"] === assetId;
  });

  return asset;
};

(async () => {
  console.log("Creating asset...");
  const createAssetTxn = await createAsset().catch(console.error);
  const assetId = createAssetTxn["asset-index"];
  let asset = await getCreatedAsset(creator, assetId);
  console.log("Asset Created");
  console.log(asset);

  console.log("Modify clawback address to %s", newClawbackAddr);
  await modifyAsset(assetId).catch(console.error);
  asset = await getCreatedAsset(creator, assetId);
  console.log("Clawback address modified to %s", asset["params"]["clawback"]);

  console.log("Receiver needs to do opt-in and maintain min balance. Fund receiver account...");
  const receiver = algosdk.generateAccount();
  await fundAccount(receiver, 300000);

  console.log("Receiver Opt In the asset...");
  await assetOptIn(receiver, assetId).catch(console.error);
  let receiverObj = await algodClient.accountInformation(receiver.addr).do();
  console.log(receiverObj);

  console.log("Transferring 100 new asset from creator to receiver...");
  await transferAsset(receiver, assetId, 100).catch(console.error);
  const assetHolding = await getAssetHoldings(receiver, assetId);
  console.log("Asset Transferred");
  console.log(assetHolding);
})();
