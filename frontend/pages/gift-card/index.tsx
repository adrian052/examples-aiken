import Head from "next/head";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";
import plutusScript from "../../../onchain/plutus.json"
import { useState } from "react";
import {
    Data,
    resolvePlutusScriptAddress,
    Transaction,
    resolveDataHash,
    resolvePaymentKeyHash,
    resolvePlutusScriptHash,
    BlockfrostProvider
} from "@meshsdk/core";
import {
    applyParamsToScript
} from '@meshsdk/core-csl'
import {
    txOutRef,
    builtinByteString
} from '@meshsdk/common';
import cbor from "cbor";



const blockchainProvider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST);

enum States {
    init,
    minting,
    mintingConfirming,
    minted,
    burning,
    burningConfirming,
    burned,
}


export default function Home() {
    const [state, setState] = useState(States.init);
    var { connected } = useWallet();
    const [policy, setPolicy] = useState();
    const [policyId, setPolicyId] = useState();
    const [tokenName, setTokenName] = useState("");
    const [transactionHash, setTransactionHash] = useState();
    const [script, setScript] = useState();


    const handleToken = (event) => {
        const value = event.target.value;
        setTokenName(value);
    };

    return (
        <div className="container">
            <Head>
                <title>Gift card on Cardano</title>
                <meta name="description" content="Gift card dApp powered my Mesh" />
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
                    <a style={{ color: 'orange', textDecoration: 'none' }}>NFT for free</a>
                </h1>

                <div className="demo">
                    <CardanoWallet />
                </div>
                {connected && (
                    <>
                        {(state == States.minting || state == States.burning) && (
                            <>Creating transaction...</>
                        )}
                        {(state == States.mintingConfirming ||
                            state == States.burningConfirming) && (
                                <>Awaiting transaction confirm...</>
                            )}
                        {(state == States.burned) && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                <>
                                    Gift card burned and ADAs unlocked. <br />
                                    Tx Hash: {transactionHash}
                                </>
                            </div>
                        )}
                        {(state == States.minted) && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                <>
                                    Gift card minted and ADAs locked. <br />
                                    Tx Hash: {transactionHash}<br />
                                    You can burn it now and unlock the ADAs.
                                </>
                            </div>
                        )}
                    </>
                )}
                <div className="grid">
                    <a className="card">
                        <h2>Mint</h2>
                        <p>
                            Mint gift card and lock 50 ADAs.<br /><br />
                            Token Name:
                            <br /><input disabled={state !== States.init || !connected} onChange={handleToken} /><br />
                            {<MintButton setState={setState}
                                state={state}
                                setPolicy={setPolicy}
                                setPolicyId={setPolicyId}
                                tokenName={tokenName}
                                setTransactionHash={setTransactionHash}
                                setScript={setScript} />}
                        </p>
                    </a>

                    <a className="card">
                        <h2>Burn</h2>
                        <p>
                            Burn Gift card and get ADAs:<br /><br /><br /><br />
                            {<BurnButton
                                setState={setState}
                                state={state}
                                policy={policy}
                                policyId={policyId}
                                tokenName={tokenName}
                                setTransactionHash={setTransactionHash}
                                script={script} />}
                        </p>
                    </a>
                </div>
            </main>
        </div>
    );
}

function getScript() {
    const script = {
        code: cbor
            .encode(Buffer.from(plutusScript.validators.filter((val: any) => val.title == "lesson01/always_true.gift")[0].compiledCode, "hex"))
            .toString("hex"),
        version: "V2",
    };
    return script;
}

function MintButton({ setState, state, setPolicy, setPolicyId, tokenName, setTransactionHash, setScript }) {
    const { wallet, connected } = useWallet();

    async function getPolicy(utxo) {
        const outRef = { alternative: 0, fields: [{ alternative: 0, fields: [utxo.input.txHash] }, utxo.input.outputIndex] }
        const cborPolicy = applyParamsToScript(plutusScript.validators.filter((val: any) => val.title == "lesson02/nft.nft")[0].compiledCode, [outRef, tokenName])
        return {
            code: cborPolicy,
            version: "V2"
        }
    }
    function getAsset(address) {
        return {
            assetName: tokenName,
            assetQuantity: "1",
            label: "721",
            recipient: address,
        };
    }

    function getRedeemer() {
        return {
            data: { alternative: 0, fields: [] },
            tag: 'MINT'
        };
    }

    async function mintAiken() {
        setState(States.minting);
        const utxos = await wallet.getUtxos();
        const address = (await wallet.getUsedAddresses())[0];
        const policy = await getPolicy(utxos[0]);
        const asset = getAsset(address);
        const redeemer = getRedeemer()
        console.log(policy, asset, redeemer);

        const tx = new Transaction({ initiator: wallet }).sendLovelace(
            {
                address: resolvePlutusScriptAddress(getScript(), 0),
            },
            '50000000',
        ).mintAsset(policy, asset, redeemer).setTxInputs(utxos);
        setPolicy(policy);
        const policyAddress = resolvePlutusScriptAddress(policy, 0);
        const policyId = resolvePlutusScriptHash(policyAddress);
        setPolicyId(policyId);
        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        console.log("txHash", txHash);
        setTransactionHash(txHash);
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
        <button type="button" onClick={() => mintAiken()} className="demo button" disabled={!connected || state !== States.init}>
            Mint
        </button>
    );
}


function BurnButton({ setState, state, policy, policyId, tokenName, setTransactionHash, script }) {
    const { wallet } = useWallet();

    function utf8_to_hexa(str) {
        let hex = '';
        for (let i = 0; i < str.length; i++) {
            let codePoint = str.codePointAt(i);
            let utf8Bytes = [];

            if (codePoint < 0x80) {
                utf8Bytes.push(codePoint);
            } else if (codePoint < 0x800) {
                utf8Bytes.push(0xC0 | (codePoint >> 6));
                utf8Bytes.push(0x80 | (codePoint & 0x3F));
            } else if (codePoint < 0x10000) {
                utf8Bytes.push(0xE0 | (codePoint >> 12));
                utf8Bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
                utf8Bytes.push(0x80 | (codePoint & 0x3F));
            } else {
                utf8Bytes.push(0xF0 | (codePoint >> 18));
                utf8Bytes.push(0x80 | ((codePoint >> 12) & 0x3F));
                utf8Bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
                utf8Bytes.push(0x80 | (codePoint & 0x3F));
                i++;
            }

            for (let byte of utf8Bytes) {
                hex += ('00' + byte.toString(16)).slice(-2);
            }
        }
        return hex;
    }

    async function burnAiken() {
        const address = (await wallet.getUsedAddresses())[0];
        console.log(address);
        const script = getScript();
        const scriptAddress = resolvePlutusScriptAddress(script, 0);
        const utxo = (await blockchainProvider.fetchAddressUTxOs(scriptAddress, ''))[0];
        console.log(script, scriptAddress, utxo);
        const asset = {
            unit: policyId + utf8_to_hexa(tokenName),
            quantity: "1",
        };
        console.log(asset);

        const redeemer = {
            data: { alternative: 1, fields: [] },
            tag: 'MINT'
        };

        const tx = new Transaction({ initiator: wallet })
            .redeemValue({
                value: utxo,
                script: script,
                datum: 'secret1',
            })
            .sendValue(address, utxo)
            .setRequiredSigners([address]);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        console.log("txHash", txHash);
        setTransactionHash(txHash);
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
        <button type="button" onClick={() => burnAiken()} className="demo button" disabled={state !== States.minted}>
            Burn
        </button>
    );
}