const algosdk = require("algosdk");

const algodClient = new algosdk.Algodv2(process.env.ALGOD_TOKEN, process.env.ALGOD_SERVER, process.env.ALGOD_PORT);

const creator = algosdk.mnemonicToSecretKey(process.env.MNEMONIC_CREATOR);

const submitToNetwork = async (signedTxn) => {
    // send txn
    let tx = await algodClient.sendRawTransaction(signedTxn).do();
    console.log("Transaction : " + tx.txId);

    // Wait for transaction to be confirmed
    confirmedTxn = await algosdk.waitForConfirmation(algodClient, tx.txId, 4);

    //Get the completed Transaction
    console.log("Transaction " + tx.txId + " confirmed in round " + confirmedTxn["confirmed-round"]);

    return confirmedTxn;
};

const createNFT = async () => {
    const from = creator.addr;
    const defaultFrozen = false;
    const unitName = "AFNFT"; //8 characters max
    const assetName = "Algo Foundry NFT";
    const assetURL = "https://path/to/my/nft/asset/metadata.json";
    const manager = creator.addr;
    const reserve = undefined;
    const freeze = undefined;
    const clawback = undefined;
    const total = 1; // NFTs have totalIssuance of exactly 1
    const decimals = 0; // NFTs have decimals of exactly 0

    // create suggested parameters
    const suggestedParams = await algodClient.getTransactionParams().do();

    // Create the asset creation transaction
    // For mutable params, set undefined instead of empty string so that no one can control it
    const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
        from,
        total,
        decimals,
        assetName,
        unitName,
        assetURL,
        defaultFrozen,
        suggestedParams,
        freeze,
        manager,
        clawback,
        reserve,
    });

    // Sign the transaction
    const signedTxn = txn.signTxn(creator.sk);

    const confirmedTxn = await submitToNetwork(signedTxn);

    return confirmedTxn["asset-index"];
};

const getCreatedAsset = async (account, assetId) => {
    let accountInfo = await algodClient.accountInformation(account.addr).do();

    const asset = accountInfo["created-assets"].find((asset) => {
        return asset["index"] === assetId;
    });

    return asset;
};

(async () => {
    console.log("Creating NFT...");
    const assetId = await createNFT().catch(console.error);
    let asset = await getCreatedAsset(creator, assetId);
    console.log("NFT Created");
    console.log(asset);
})();
