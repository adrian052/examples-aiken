import Head from "next/head";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";
import {
    resolvePlutusScriptAddress,
    Transaction,
    resolveDataHash,
    resolvePaymentKeyHash,
    BlockfrostProvider

} from "@meshsdk/core";
import { useState } from "react";
import plutusScript from "../../../onchain/plutus.json"
import cbor from "cbor";


// Getting always true script
const script = {
    code: cbor
        .encode(Buffer.from(plutusScript.validators.filter((val: any) => val.title == "lesson01/always_true.gift")[0].compiledCode, "hex"))
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
    var { connected } = useWallet()

    return (
        <div className="container">
            <Head>
                <title>Always true on Cardano</title>
                <meta name="description" content="Always True dApp powered my Mesh" />
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
                    <a style={{ color: 'orange', textDecoration: 'none' }}>Always true</a>
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
                        <h2>Lock</h2>
                        <p>
                            Lock 50 ADA:<br />
                            {<LockButton setState={setState} state={state} />}
                        </p>
                    </a>

                    <a className="card">
                        <h2>Unlock</h2>
                        <p>
                            Unlock 50 ADA:<br />
                            {<UnlockButton setState={setState} state={state} />}
                        </p>
                    </a>

                </div>
            </main>
        </div>
    );
}


///Transaction functions
function LockButton({ setState, state }) {
    const { wallet, connected } = useWallet();

    async function lockAiken() {
        setState(States.locking);
        const hash = resolvePaymentKeyHash((await wallet.getUsedAddresses())[0]);
        const tx = new Transaction({ initiator: wallet }).sendLovelace(
            {
                address: scriptAddress,
                datum: {
                    value: "secret1",
                }
            },
            '50000000',

        );
        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        console.log("txHash", txHash);
        if (txHash) {
            setState(States.lockingConfirming);
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


function UnlockButton({ setState, state }) {
    const { wallet } = useWallet();

    async function _getAssetUtxo({ scriptAddress, asset }) {

        const utxos = await blockchainProvider.fetchAddressUTxOs(scriptAddress, asset);


        const hash = resolveDataHash("secret1")
        let utxo = utxos.find((utxo: any) => {
            return utxo.output.dataHash == hash;
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
            asset: "lovelace",
        });
        console.log("assetUtxo", assetUtxo);

        // create the unlock asset transaction
        const tx = new Transaction({ initiator: wallet })
            .redeemValue({
                value: assetUtxo,
                script: script,
                datum: 'secret1'
            })
            .sendValue(address, assetUtxo)
            .setRequiredSigners([address]);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        const txHash = await wallet.submitTx(signedTx);
        console.log("txHash", txHash);

        if (txHash) {

            setState(States.unlockingConfirming);
            blockchainProvider.onTxConfirmed(txHash, () => {
                setState(States.unlocked);
            });
        }
    }

    return (
        <button type="button" onClick={() => unlockAiken()} className="demo button" disabled={state !== States.locked}>
            Unlock
        </button>
    );
} 