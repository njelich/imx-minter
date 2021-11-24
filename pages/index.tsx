import { useState } from "react";
import Web3 from "web3";
import { Link } from "@imtbl/imx-sdk";

const linkAddress =
  process.env.NETWORK === "ropsten"
    ? "https://link.ropsten.x.immutable.com"
    : "https://link.ropsten.x.immutable.com";

export default function IndexPage() {
  // IMX SETUP
  const [imxAddress, setImxAddress] = useState(null);
  const [starkPublicKey, setStarkPublicKey] = useState(null);

  async function setupAccount() {
    const link = new Link(linkAddress);
    let address, starkPubKey;

    await link
      .setup({})
      .then((value) => {
        (address = value.address), (starkPubKey = value.starkPublicKey);
      })
      .catch(() => {
        alert("Please reopen the IMX Connect window");
      });

    console.log(address, starkPubKey);
    setImxAddress(address);
    setStarkPublicKey(starkPubKey);
  }

  // CONNECT WALLET
  const [signingIn, setSigningIn] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);

  async function signIn() {
    if (typeof (window as any).web3 !== "undefined") {
      // Use existing gateway
      (window as any).web3 = new Web3((window as any).ethereum);
    } else {
      alert("No Ethereum interface injected into browser. Read-only access");
    }

    setSigningIn(true);
    (window as any).ethereum
      .enable()
      .then(function (accounts) {
        (window as any).web3.eth.net
          .getNetworkType()
          // checks if connected network is mainnet (change this to rinkeby if you wanna test on testnet)
          .then((network) => {
            console.log(network);
            if (network != "main") {
              alert(
                "You are on " +
                  network +
                  " network. Change network to mainnet or you won't be able to do anything here"
              );
            }
          });
        console.log(accounts, accounts[0]);
        let wallet = accounts[0];
        setWalletAddress(wallet);
        setSigningIn(false);
      })
      .catch(function (error) {
        setSigningIn(false);
        // Handle error. Likely the user rejected the login
        console.error(error);
      });
  }

  // MINT INPUT
  const [howManyTokens, setHowManyTokens] = useState(1);
  const [minted, setMinted] = useState(0);

  const handleInput = (e) => {
    setHowManyTokens(e.target.value);
  };

  async function callMintData() {
    const mintCount = await fetch("/api/count");
    const result = await mintCount.json();
    setMinted(result);
  }

  async function mintTokens(howManyTokens) {
    // added .toString() because of Error: Please pass numbers as strings or BN objects to avoid precision errors.
    const value = (window as any).web3.utils.toWei(
      (parseFloat(process.env.MINT_PRICE) * howManyTokens).toFixed(2),
      "ether"
    );
    (window as any).web3.eth
      .sendTransaction({
        to: process.env.DEPOSIT_ADDRESS,
        from: walletAddress,
        value: value,
      })
      .on("transactionHash", async (hash) => {
        const rawResponse = await fetch("/api/mint", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hash: hash,
            amount: howManyTokens,
            imxAddress,
            starkPublicKey,
            value: value,
            address: walletAddress,
          }),
        });
        const content = await rawResponse.json();
        alert(
          `Minted tokens - they might take up to a few hours to show up in IMX. Transaction hash ${hash}`
        );
        console.log("transactionHash", hash, content);
      })
      .on("receipt", function (receipt) {
        console.log("receipt", receipt);
      })
      .on("confirmation", function (confirmationNumber, receipt) {
        console.log("confirmation", confirmationNumber, receipt);
      })
      .on("error", console.error);
  }

  if (parseInt(process.env.MAX_SUPPLY) - minted === 0)
    return <span className="text-center text-xl">SOLD OUT!</span>;

  return (
    <div className="h-screen w-screen flex justify-center items-center">
      <div className="text-white my-auto mx-auto bg-gradient-to-r from-blue-900 to-blue-500 p-12 pb-6 rounded-xl flex flex-col gap-5 justify-center items-center ">
        {imxAddress && walletAddress && (
          <>
            <input
              type="range"
              min="1"
              max="10"
              value={howManyTokens}
              onInput={handleInput}
            />

            <span className="text-white pb-4 text-md">
              Select how many to mint
            </span>
          </>
        )}

        <button
          className="text-white border-2 border-white rounded-xl p-5"
          onMouseOver={callMintData}
          onClick={
            !imxAddress
              ? setupAccount
              : !walletAddress && !signingIn
              ? signIn
              : !signingIn
              ? () => {
                  mintTokens(howManyTokens);
                }
              : () =>
                  alert(
                    "Please open MetaMask manually. The login was interrupted."
                  )
          }
        >
          {" "}
          {!imxAddress
            ? "Connect IMX"
            : !walletAddress && !signingIn
            ? "Connect wallet"
            : !signingIn
            ? `Mint ${howManyTokens} token${
                howManyTokens == 1 ? "" : "s"
              } for ${(
                parseFloat(process.env.MINT_PRICE) * howManyTokens
              ).toFixed(2)}`
            : "Logging in..."}
        </button>

        <span className="text-center text-lg">
          {parseInt(process.env.MAX_SUPPLY) - minted} remaining
        </span>
      </div>
    </div>
  );
}
