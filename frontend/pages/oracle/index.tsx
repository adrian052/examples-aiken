import Head from "next/head";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";
import {
    resolvePlutusScriptAddress,
    Transaction,
    resolveDataHash,
    resolvePaymentKeyHash,
    BlockfrostProvider,
    resolvePlutusScriptHash
} from "@meshsdk/core";
import { applyParamsToScript } from '@meshsdk/core-csl'
import { useState } from "react";
import plutusScript from "../../../onchain/plutus.json"
import cbor from "cbor";


const blockchainProvider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST);

enum States {
    init,
    locking,
    lockingConfirming,
    locked,
    unlocking,
    unlockingConfirming,
    unlocked,
}

export default function Home() {
    const [state, setState] = useState(States.init);
    var { connected } = useWallet()

    return (
        <div className="container">
            <Head>
                <title>ADA's Oracle on cardano</title>
                <meta name="description" content="ADA's Oracle dApp powered my Mesh" />
                <link
                    rel="icon"
                    href="https://meshjs.dev/favicon/favicon-32x32.png"
                />
                <link
                    href="https://meshjs.dev/css/template.css"
                    rel="stylesheet"
                    key="mesh-demo"
                />
            </Head>

            <main className="main">
                <h1 style={{ margin: '0', lineHeight: '1.15', fontSize: '4rem', fontWeight: 200 }}>
                    <a style={{ color: 'orange', textDecoration: 'none' }}>ADA's Oracle</a>
                </h1>

                <div className="demo">
                    <CardanoWallet />
                </div>
                {connected && (
                    <>
                        {(state == States.locking || state == States.unlocking) && (
                            <>Creating transaction...</>
                        )}
                        {(state == States.lockingConfirming ||
                            state == States.unlockingConfirming) && (
                                <>Awaiting transaction confirm...</>
                            )}
                        {(state == States.unlocked) && (
                            <>Unlocked.</>
                        )}
                    </>
                )}
                <div className="grid">
                    <a className="card">
                        <h2>Deploy Oracle</h2>
                        <p>
                            Deploy Oracle to get ADA price every 10 minutes:<br />
                            {<DeployButton setState={setState} state={state} />}
                        </p>
                    </a>


                </div>
            </main>
        </div>
    );
}

function DeployButton({ setState, state }) {
    const { wallet, connected } = useWallet();

    async function getPolicy(utxo) {
        const outRef = {
            alternative: 0,
            fields: [{
                alternative: 0,
                fields: [utxo.input.txHash]
            },
            utxo.input.outputIndex]
        }
        const cborPolicy = applyParamsToScript(plutusScript.validators.filter((val: any) => val.title == "lesson02/nft.nft")[0].compiledCode, [outRef, "OracleNFT"])
        return {
            code: cborPolicy,
            version: "V2"
        }
    }

    async function getAsset(oracleAddress) {
        const adaPrice = await fetchAdaPrice();
        const datum = adaPrice.toString();
        return {
            assetName: "OracleNFT",
            assetQuantity: "1",
            label: "721",
            recipient: {
                address: oracleAddress,
                datum: {
                    value: datum,
                    inline: true
                }
            }
        };
    }

    function getOracleScript(policy, address) {
        const nftPolicy = resolvePlutusScriptAddress(policy);

        const pkh = resolvePaymentKeyHash(address);
        const oNft = { alternative: 0, fields: [nftPolicy, "OracleNFT"] };

        const parameter = {
            alternative: 0,
            fields: [oNft, pkh]
        }

        const cborScript = applyParamsToScript(plutusScript.validators.filter((val: any) => val.title == "lesson02/oracle.oracle")[0].compiledCode, [parameter])
        return {
            code: cborScript,
            version: "V2"
        }
    }

    async function deployOracle() {
        //Getting all variables needed to deploy the oracle
        const utxos = (await wallet.getUtxos());
        const utxo = utxos[0];
        const address = (await wallet.getUsedAddresses())[0];
        const policy = await getPolicy(utxo);
        const redeemer = { data: { alternative: 0, fields: [] }, tag: 'MINT' };
        const oracleAddress = resolvePlutusScriptAddress(getOracleScript(policy, address));
        const mintAsset = await getAsset(oracleAddress);

        ///Making the transaction 
        const tx = new Transaction({ initiator: wallet })
            .mintAsset(policy, mintAsset, redeemer)
            .setTxInputs(utxos);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        console.log(txHash);
        if (txHash) {
            setState(States.mintingConfirming);
            blockchainProvider.onTxConfirmed(
                txHash,
                async () => {
                    setState(States.minted);
                },
                100
            );
        }
    }
    return (
        <button type="button" onClick={() => deployOracle()} className="demo button" disabled={!connected || state !== States.init}>
            Deploy
        </button>
    );
}


const fetchAdaPrice = async () => {
    const baseUrl = 'https://api.polygon.io/v2/aggs/ticker/X:ADAUSD/prev';
    const params = new URLSearchParams({
        adjusted: 'true',
        apiKey: process.env.NEXT_PUBLIC_POLYGON
    });

    try {
        const response = await fetch(`${baseUrl}?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const price = data.results[0].c;
        return price;
    } catch (error) {
        return error.message;
    }
};