import Head from "next/head";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";
import plutusScript from "../../../onchain/plutus.json"
import { useState } from "react";
import {
    Data,
    resolvePlutusScriptAddress,
    Transaction,
    resolveDataHash,
    readPlutusData,
    resolvePaymentKeyHash,
    BlockfrostProvider
} from "@meshsdk/core";
import cbor from "cbor";


const script = {
    code: cbor
        .encode(Buffer.from(plutusScript.validators.filter((val: any) => val.title == "lesson01/redeemer_equals_datum.eqDatumRedeem")[0].compiledCode, "hex"))
        .toString("hex"),
    version: "V2",
};

const scriptAddress = resolvePlutusScriptAddress(script, 0);
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
    const [redeemer, setRedeemer] = useState("");
    const [datum, setDatum] = useState("")
    const [transactionHash, setTransactionHash] = useState("");
    var { connected } = useWallet()

    const handleRedeemer = (event) => {
        const value = event.target.value;
        setRedeemer(value);
    };

    const handleDatum = (event) => {
        const value = event.target.value;
        setDatum(value);
    };

    return (
        <div className="container">
            <Head>
                <title>Redeemer equals datum on Cardano</title>
                <meta name="description" content="Redeemer equals datum dApp powered my Mesh" />
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
                    <a style={{ color: 'orange', textDecoration: 'none' }}>Redeemer equals datum</a>
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
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                <>
                                    Unlocked. <br />
                                    Tx Hash: {transactionHash}
                                </>
                            </div>
                        )}
                        {(state == States.locked) && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                <>
                                    Locked. <br />
                                    Tx Hash: {transactionHash}<br />
                                    You can unlock them now.
                                </>
                            </div>
                        )}
                    </>
                )}
                <div className="grid">
                    <a className="card">
                        <h2>Lock</h2>
                        <p>
                            Lock 50 ADAs on redeemer equals datum validator:<br /><br />
                            Datum: <input disabled={state !== States.init || !connected} onChange={handleDatum} />
                            {<LockButton setState={setState}
                                state={state}
                                datumData={datum}
                                setTransactionHash={setTransactionHash}
                            />}
                        </p>
                    </a>

                    <a className="card">
                        <h2>Unlock</h2>
                        <p>
                            Unlock ADAs from redeemer equals datum validator:<br /><br />
                            Redeemer: <input disabled={state !== States.locked} onChange={handleRedeemer} />
                            {<UnlockButton setState={setState}
                                state={state}
                                redeemerData={redeemer}
                                datumData={datum}
                                setTransactionHash={setTransactionHash} />}
                        </p>
                    </a>
                </div>
            </main>
        </div>
    );
}

function LockButton({ setState, state, datumData, setTransactionHash }) {
    const { wallet, connected } = useWallet();

    async function lockAiken() {
        setState(States.locking);
        const hash = resolvePaymentKeyHash((await wallet.getUsedAddresses())[0]);
        const tx = new Transaction({ initiator: wallet }).sendLovelace(
            {
                address: scriptAddress,
                datum: {
                    value: datumData,
                    inline: true
                }
            },
            '50000000',

        );
        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);

        if (txHash) {
            setState(States.lockingConfirming);
            setTransactionHash(txHash)
            console.log("txHash", txHash);
            blockchainProvider.onTxConfirmed(
                txHash,
                () => {
                    setState(States.locked);
                },
                100
            );
        }
    }

    return (
        <button type="button" onClick={() => lockAiken()} className="demo button" disabled={!connected || state !== States.init}>
            Lock
        </button>
    );
}


function UnlockButton({ setState, state, redeemerData, datumData, setTransactionHash }) {
    const { wallet } = useWallet();

    function ascii_to_hexa(str: string): string {
        let hex = '';
        for (let i = 0; i < str.length; i++) {
            let hexChar = str.charCodeAt(i).toString(16);
            hex += ('00' + hexChar).slice(-2);
        }
        return hex;
    }

    async function _getAssetUtxo({ scriptAddress, asset }) {

        const utxos = await blockchainProvider.fetchAddressUTxOs(scriptAddress, asset);

        let utxo = utxos.find((utxo: any) => {
            if (utxo.output.plutusData) {
                return readPlutusData(utxo.output.plutusData) == ascii_to_hexa(datumData);
            }
        });

        return utxo;
    }

    async function unlockAiken() {
        setState(States.unlocking);
        const scriptAddress = resolvePlutusScriptAddress(script, 0);

        const address = (await wallet.getUsedAddresses())[0];
        const hash = resolvePaymentKeyHash(address);

        const assetUtxo = await _getAssetUtxo({
            scriptAddress: scriptAddress,
            asset: "lovelace"
        });

        const redeemer: Data = { data: redeemerData };

        // create the unlock asset transaction
        const tx = new Transaction({ initiator: wallet })
            .redeemValue({
                value: assetUtxo,
                script: script,
                datum: assetUtxo,
                redeemer: redeemer
            })
            .sendValue(address, assetUtxo)
            .setRequiredSigners([address]);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        var txHash = undefined;

        try {
            txHash = await wallet.submitTx(signedTx);
            setTransactionHash(txHash)
            console.log("txHash", txHash);
        } catch (error) {
            alert("Error: Transaction failed", error);
            setState(States.locked)
            return;
        }

        setState(States.unlockingConfirming);
        blockchainProvider.onTxConfirmed(
            txHash,
            () => {
                setState(States.unlocked);
            },
            100
        );

    }

    return (
        <button type="button" onClick={() => unlockAiken()} className="demo button" disabled={state !== States.locked}>
            Unlock
        </button>
    );
} 