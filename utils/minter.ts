import fetch from "node-fetch";
import { MongoClient } from "mongodb";
import { ImmutableXClient, MintableERC721TokenType } from "@imtbl/imx-sdk";
import { Wallet } from "@ethersproject/wallet";
import { InfuraProvider } from "@ethersproject/providers";

const mongoClient = new MongoClient(process.env.MONGO_URI);

const provider = new InfuraProvider(process.env.NETWORK, process.env.INFURA_ID);
const signer = new Wallet(process.env.PRIVATE_KEY).connect(provider);

const apiAddress =
  process.env.NETWORK === "ropsten"
    ? "https://api.ropsten.x.immutable.com/v1"
    : "https://api.x.immutable.com/v1";
const infuraUri = `https://${process.env.NETWORK}.infura.io/v3/${process.env.INFURA_ID}`;
const starkAddress =
  process.env.NETWORK === "ropsten"
    ? "0x4527BE8f31E2ebFbEF4fCADDb5a17447B27d2aef"
    : "0x5FDCCA53617f4d2b9134B29090C87D01058e27e9";
const registrationAddress =
  process.env.NETWORK === "ropsten"
    ? "0x6C21EC8DE44AE44D0992ec3e2d9f1aBb6207D864"
    : "0x72a06bf2a1CE5e39cBA06c0CAb824960B587d64c";

async function mint() {
  const immutableXClient = await ImmutableXClient.build({
    publicApiUrl: apiAddress,
    signer,
    starkContractAddress: starkAddress,
    registrationContractAddress: registrationAddress,
  });
  await mongoClient.connect();
  const collection = mongoClient.db("db").collection("transactions");
  const filter = {
    $and: [{ status: "pending" }],
  };
  const pendingTransactions = await collection.find(filter).toArray();
  console.log("pendingTransactions", pendingTransactions.length);
  if (!pendingTransactions.length) return;
  for (let pendingTransaction of pendingTransactions) {
    console.log(pendingTransaction);
    let transactionReceiptResult;
    try {
      const response = await fetch(infuraUri, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getTransactionReceipt",
          params: [pendingTransaction.hash],
          id: 1,
        }),
      });
      transactionReceiptResult = (await response.json()).result;
      console.log("transactionReceiptResult", transactionReceiptResult);
    } catch (error) {
      console.log("eth_getTransactionReceipt", error);
      // TODO: if error occures should we only skip this transaction?
      return;
    }
    if (transactionReceiptResult === null) {
      const filter = { hash: pendingTransaction.hash };
      const update = { $set: { status: "pending", updatedAt: +new Date() } };
      await collection.updateOne(filter, update);
    } else if (parseInt(transactionReceiptResult.status) === 1) {
      //1 = submission success

      let transactionByHashResult;
      try {
        const response = await fetch(infuraUri, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getTransactionByHash",
            params: [pendingTransaction.hash],
            id: 1,
          }),
        });
        const json = await response.json();
        transactionByHashResult = json.result;
        console.log("transactionByHashResult", transactionByHashResult);
      } catch (error) {
        console.log("eth_getTransactionByHash", error);
        continue;
      }

      const transactionDataValid =
        transactionByHashResult.from.toLowerCase() ===
          pendingTransaction.address.toLowerCase() &&
        transactionByHashResult.to.toLowerCase() ==
          process.env.DEPOSIT_ADDRESS.toLowerCase() &&
        parseInt(transactionByHashResult.value).toString() ==
          pendingTransaction.value.toString() &&
        parseInt(transactionByHashResult.value).toString() ==
          (
            pendingTransaction.amount *
            parseFloat(process.env.MINT_PRICE) *
            10 ** 18
          ).toString();

      if (!transactionDataValid) {
        const filter = { hash: pendingTransaction.hash };
        const update = { $set: { status: "invalid", updatedAt: +new Date() } };
        await collection.updateOne(filter, update);
      } else {
        const filter = { status: "success" };
        const successfulTransactions = await collection.find(filter).toArray();
        let counter = 0;
        successfulTransactions.forEach((x) => {
          x.amount ? (counter += Number(x.amount)) : null;
        });

        let result;
        try {
          result = await immutableXClient.mint({
            mints: [
              {
                etherKey: pendingTransaction.imxAddress.toLowerCase(), //user address
                // list of tokens to be minted
                tokens: [
                  ...Array(parseInt(pendingTransaction.amount)).keys(),
                ].map((idx) => {
                  return {
                    type: MintableERC721TokenType.MINTABLE_ERC721,
                    data: {
                      tokenAddress: process.env.CONTRACT_ADDRESS.toLowerCase(),
                      id: (counter + idx).toString(),
                      blueprint: "0",
                    },
                  };
                }),
                nonce: "" + Math.floor(Math.random() * 10000),
                authSignature: "",
              },
            ],
          });
          console.log("immutableXClient.mint", result);

          if (result.length !== parseInt(pendingTransaction.amount))
            throw `Invalid mint: ${JSON.stringify(result)}`;
          const filter = { hash: pendingTransaction.hash };
          const update = {
            $set: { status: "success", updatedAt: +new Date() },
          };
          await collection.updateOne(filter, update);
        } catch (error) {
          const filter = { hash: pendingTransaction.hash };
          const update = {
            $set: {
              status: "manual",
              updatedAt: +new Date(),
              error: error.message || error,
            },
          };
          await collection.updateOne(filter, update);
        }
      }
    } else {
      //0 = error
      const filter = { hash: pendingTransaction.hash };
      const update = { $set: { status: "failed", updatedAt: +new Date() } };
      await collection.updateOne(filter, update);
    }
  }
}

mint();
