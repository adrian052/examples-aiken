import Head from "next/head";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";
import {
    resolvePlutusScriptAddress,
    Transaction,
    resolvePaymentKeyHash,
    BlockfrostProvider,
    resolvePlutusScriptHash,
    readPlutusData
} from "@meshsdk/core";
import { applyParamsToScript } from '@meshsdk/core-csl'
import { useState, useEffect } from "react";
import plutusScript from "../../../onchain/plutus.json"


const blockchainProvider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST as string);

enum States {
    init,
    deploying,
    deployConfirming,
    deployed,
    updating,
    updatingConfirming
}

export default function Home() {
    const [state, setState] = useState(States.init);
    const [time, setTime] = useState(60);
    const [oracleAddress, setOracleAddress] = useState();
    const [policyId, setPolicyId] = useState();
    var { connected } = useWallet()

    useEffect(() => {
        let timerId;
        if (state === States.deployed && time > 0) {
            timerId = setInterval(() => {
                setTime(prevTime => prevTime - 1);
            }, 1000);
        }

        return () => clearInterval(timerId);
    }, [state, time]);

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

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
                        {state == States.deployed && (
                            <>Oracle deployed successfully.
                            </>
                        )}
                        {(state == States.deployConfirming) && (
                            <>Awaiting transaction confirm...</>
                        )}
                        {(state == States.unlocked) && (
                            <>Unlocked.</>
                        )}
                    </>
                )}
                <div className="grid">
                    {(state == States.init || state == States.deploying || state == States.deployConfirming) && (<a className="card">
                        <h2>Deploy Oracle</h2>
                        <p>
                            Deploy Oracle to get ADA price every 5 minutes:<br />
                            {<DeployButton setState={setState} state={state} setOracleAddress={setOracleAddress} setPolicyId={setPolicyId} />}
                        </p>
                    </a>)}

                    {state == States.deployed && (<a className="card">
                        <h2>Oracle deployed data</h2>
                        <p>
                            Tx Hash:<br />
                            Next update: {formatTime(time)}<br />
                            {<QueryButton setState={setState} state={state} oracleAddress={oracleAddress} policyId={policyId} />}
                        </p>
                    </a>)}
                </div>
            </main>
        </div>
    );
}

function DeployButton({ setState, state, setOracleAddress, setPolicyId }) {
    const { wallet, connected } = useWallet();

    async function getPolicy(utxo: any) {
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

    async function getAsset(oracleAddress: string) {
        const adaPrice = await fetchAdaPrice();
        console.log(adaPrice);
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

    function getOracleScript(policy: { code: string; version: string; }, address: string) {
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
        setState(States.deploying);
        //Getting all variables needed to deploy the oracle
        const utxos = (await wallet.getUtxos());
        const utxo = utxos[0];
        const address = (await wallet.getUsedAddresses())[0];
        const policy = await getPolicy(utxo);
        const redeemer = { data: { alternative: 0, fields: [] }, tag: 'MINT' };
        const oracleAddress = resolvePlutusScriptAddress(getOracleScript(policy, address));
        const mintAsset = await getAsset(oracleAddress);
        setOracleAddress(oracleAddress);
        setPolicyId(resolvePlutusScriptHash(resolvePlutusScriptAddress(policy)));
        ///Making the transaction 
        const tx = new Transaction({ initiator: wallet })
            .mintAsset(policy, mintAsset, redeemer)
            .setTxInputs(utxos);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        console.log(txHash);
        if (txHash) {
            setState(States.deployConfirming);
            blockchainProvider.onTxConfirmed(
                txHash,
                async () => {
                    setState(States.deployed);
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


function QueryButton({ setState, state, oracleAddress, policyId }) {
    const { wallet, connected } = useWallet();

    async function queryOracle() {
        const asset = policyId + ascii_to_hexa("OracleNFT");
        const utxo = (await blockchainProvider.fetchAddressUTxOs(oracleAddress, asset))[0];
        let value = hexToString(readPlutusData(utxo.output.plutusData));
        console.log(asset);
        alert("ADA's oracle price: " + value);
    }

    return (
        <button type="button" onClick={() => queryOracle()} className="demo button" disabled={!connected || state !== States.deployed}>
            Query Oracle
        </button>
    );
}

const fetchAdaPrice = async () => {
    const baseUrl = 'https://api.polygon.io/v2/aggs/ticker/X:ADAUSD/prev';
    const params = new URLSearchParams({
        adjusted: 'true',
        apiKey: process.env.NEXT_PUBLIC_POLYGON as string
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



function ascii_to_hexa(str: string): string {
    let hex = '';
    for (let i = 0; i < str.length; i++) {
        let hexChar = str.charCodeAt(i).toString(16);
        hex += ('00' + hexChar).slice(-2);
    }
    return hex;
}

function hexToString(hex: string): string {
    if (hex.length % 2 !== 0) {
        throw new Error("The hexadecimal string must have an even length.");
    }
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
        const hexPair = hex.substr(i, 2);
        const charCode = parseInt(hexPair, 16);
        str += String.fromCharCode(charCode);
    }
    return str;
}