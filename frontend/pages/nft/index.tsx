import Head from "next/head";
import { CardanoWallet, useWallet, } from "@meshsdk/react";
import plutusScript from "../../../onchain/plutus.json"
import { useState } from "react";
import {
    resolvePlutusScriptAddress,
    Transaction,
    resolvePlutusScriptHash,
    BlockfrostProvider,
} from "@meshsdk/core";
import {
    applyParamsToScript
} from '@meshsdk/core-csl'
import { stringToHex } from "@meshsdk/common";
import { SetState } from "../../lib/types";

const blockchainProvider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST as string);

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
    const [policy, setPolicy] = useState({ code: "", version: "" });
    const [policyId, setPolicyId] = useState("");
    const [tokenName, setTokenName] = useState("");
    const [transactionHash, setTransactionHash] = useState("");
    type InputChangeEvent = React.ChangeEvent<HTMLInputElement>;

    const handleToken = (event: InputChangeEvent) => {
        const value = event.target.value;
        setTokenName(value);
    };

    return (
        <div className="container">
            <Head>
                <title>NFT for free on Cardano</title>
                <meta name="description" content="NFT for free dApp powered my Mesh" />
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
                                    NFT burned. <br />
                                    Tx Hash: {transactionHash}
                                </>
                            </div>
                        )}
                        {(state == States.minted) && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                                <>
                                    NFT minted. <br />
                                    Tx Hash: {transactionHash}<br />
                                    You can burn it now.
                                </>
                            </div>
                        )}
                    </>
                )}
                <div className="grid">
                    <a className="card">
                        <h2>Mint</h2>
                        <p>
                            Mint asset using an NFT policy, using collateral:<br /><br />
                            Token Name:
                            <br /><input disabled={state !== States.init || !connected} onChange={handleToken} /><br />
                            {<MintButton setState={setState}
                                state={state}
                                setPolicy={setPolicy}
                                setPolicyId={setPolicyId}
                                tokenName={tokenName}
                                setTransactionHash={setTransactionHash} />}
                        </p>
                    </a>

                    <a className="card">
                        <h2>Burn</h2>
                        <p>
                            Burn asset from NFT policy, using collateral:<br /><br /><br /><br />
                            {<BurnButton
                                setState={setState}
                                state={state}
                                policy={policy}
                                policyId={policyId}
                                tokenName={tokenName}
                                setTransactionHash={setTransactionHash} />}
                        </p>
                    </a>
                </div>
            </main>
        </div>
    );
}


type MintParams = {
    setState: SetState<States>,
    state: States,
    setPolicy: SetState<any>,
    setPolicyId: SetState<string>,
    tokenName: string,
    setTransactionHash: SetState<string>
}

function MintButton({ setState, state, setPolicy, setPolicyId, tokenName, setTransactionHash }: MintParams) {
    const { wallet, connected } = useWallet();

    async function mintAiken() {
        setState(States.minting);

        const address = (await wallet.getUsedAddresses())[0];
        //Getting collateral from wallet (make sure you enable collateral for transaction fees)
        const collateral = await wallet.getCollateral();
        //Getting nft policy
        const utxos = await wallet.getUtxos();
        const utxo = utxos[0];
        const outRef = { alternative: 0, fields: [{ alternative: 0, fields: [utxo.input.txHash] }, utxo.input.outputIndex] }
        const cborPolicy = applyParamsToScript(plutusScript.validators.filter((val: any) => val.title == "lesson02/nft.nft")[0].compiledCode, [outRef, tokenName])
        const policy = {
            code: cborPolicy,
            version: "V2"
        }
        const policyAddress = resolvePlutusScriptAddress(policy, 0);
        const policyId = resolvePlutusScriptHash(policyAddress);
        setPolicyId(policyId);
        setPolicy(policy);

        const asset = {
            assetName: tokenName,
            assetQuantity: "1",
            label: "721",
            recipient: address,
        };

        const redeemer = {
            data: { alternative: 0, fields: [] },
            tag: 'MINT'
        };

        const tx = new Transaction({ initiator: wallet }).mintAsset(policy, asset, redeemer).setTxInputs(utxos).setCollateral(collateral);

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


type BurnParams = {
    setState: SetState<States>,
    state: States,
    policy: {
        code: string,
        version: string
    },
    policyId: string,
    tokenName: string,
    setTransactionHash: SetState<string>
}

function BurnButton({ setState, state, policy, policyId, tokenName, setTransactionHash }: BurnParams) {
    const { wallet } = useWallet();

    async function burnAiken() {
        setState(States.burning);

        //Getting collateral from wallet (make sure you enable collateral for transaction fees)
        const collateral = await wallet.getCollateral();
        //Asset to burn
        const asset = {
            unit: policyId + stringToHex(tokenName),
            quantity: "1",
        };

        const redeemer = {
            data: { alternative: 1, fields: [] },
            tag: 'MINT'
        };

        // create the burn asset transaction
        const tx = new Transaction({ initiator: wallet }).burnAsset(policy, asset, redeemer).setCollateral(collateral);

        const unsignedTx = await tx.build();
        const signedTx = await wallet.signTx(unsignedTx);
        const txHash = await wallet.submitTx(signedTx);
        console.log("txHash", txHash);
        setTransactionHash(txHash);
        setState(States.burningConfirming);
        blockchainProvider.onTxConfirmed(txHash, () => {
            setState(States.burned);
        });

    }

    return (
        <button type="button" onClick={() => burnAiken()} className="demo button" disabled={state !== States.minted}>
            Burn
        </button>
    );
}