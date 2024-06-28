import Head from "next/head";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";
import plutusScript from "../../../onchain/plutus.json"
import { useState } from "react";
import {
    resolvePlutusScriptAddress,
    Transaction,
    resolveDataHash,
    resolvePaymentKeyHash,
    BlockfrostProvider
} from "@meshsdk/core";

import cbor from "cbor";
import { SetState } from "../../lib/types";

const script = {
    code: cbor
        .encode(Buffer.from(plutusScript.validators.filter((val: any) => val.title == "lesson01/forty_two.fortyTwo")[0].compiledCode, "hex"))
        .toString("hex"),
    version: "V2",
};

const scriptAddress = resolvePlutusScriptAddress(script, 0);
const blockchainProvider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST as string);

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
    var { connected } = useWallet()
    type InputChangeEvent = React.ChangeEvent<HTMLInputElement>;

    const handleChange = (event: InputChangeEvent) => {
        const value = event.target.value;
        if (/^[0-9]*$/.test(value)) {
            setRedeemer(value);
        }
    };

    return (
        <div className="container">
            <Head>
                <title>Forty-two on Cardano</title>
                <meta name="description" content="Forty-two dApp powered my Mesh" />
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
                    <a style={{ color: 'orange', textDecoration: 'none' }}>Forty-two</a>
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
                        {(state == States.locked) && (
                            <>ADAs locked, you can unlock them now.</>
                        )}
                    </>
                )}
                <div className="grid">
                    <a className="card">
                        <h2>Lock</h2>
                        <p>
                            Lock 50 ADAs on 42 validator:<br /><br />
                            {<LockButton setState={setState} state={state} />}
                        </p>
                    </a>

                    <a className="card">
                        <h2>Unlock</h2>
                        <p>
                            Unlock ADAs from 42 validator:
                            Redemer: <input disabled={state !== States.locked} onChange={handleChange}
                                onKeyPress={(event) => { if (!/[0-9]/.test(event.key)) { event.preventDefault(); } }}
                            />
                            {<UnlockButton setState={setState} state={state} redeemerData={redeemer} />}
                        </p>
                    </a>
                </div>
            </main>
        </div>
    );
}


type LockParams = {
    setState: SetState<States>,
    state: States
}

function LockButton({ setState, state }: LockParams) {
    const { wallet, connected } = useWallet();

    async function lockAiken() {
        setState(States.locking);
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


type UnlockParams = {
    setState: SetState<States>,
    state: States,
    redeemerData: string
}

function UnlockButton({ setState, state, redeemerData }: UnlockParams) {
    const { wallet } = useWallet();

    async function _getAssetUtxo(scriptAddress: string, asset: string) {

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

        const assetUtxo = await _getAssetUtxo(scriptAddress, "lovelace");
        console.log("assetUtxo", assetUtxo);
        console.log(parseInt(redeemerData));
        const redeemer = { data: parseInt(redeemerData) };

        // create the unlock asset transaction
        const tx = new Transaction({ initiator: wallet })
            .redeemValue({
                value: assetUtxo,
                script: script,
                datum: 'secret1',
                redeemer: redeemer
            })
            .sendValue(address, assetUtxo)
            .setRequiredSigners([address]);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx, true);
        try {
            const txHash = await wallet.submitTx(signedTx);
            console.log("txHash", txHash);
            setState(States.unlockingConfirming);
            blockchainProvider.onTxConfirmed(txHash, () => {
                setState(States.unlocked);
            });
        } catch (error) {
            alert("Error: Transaction failed" + error);
            setState(States.locked)
            return;
        }
    }

    return (
        <button type="button" onClick={() => unlockAiken()} className="demo button" disabled={state !== States.locked}>
            Unlock
        </button>
    );
} 