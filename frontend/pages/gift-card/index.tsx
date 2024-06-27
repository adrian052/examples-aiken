import Head from "next/head";
import { CardanoWallet, MeshBadge, useWallet } from "@meshsdk/react";
import plutusScript from "../../../onchain/plutus.json"
import { useState } from "react";
import {
    BlockfrostProvider,
    MeshTxBuilder,
    Asset,
    resolvePlutusScriptAddress,
    resolvePaymentKeyHash
} from "@meshsdk/core";
import {
    applyParamsToScript,
    getV2ScriptHash
} from '@meshsdk/core-csl'
import {
    builtinByteString,
    mConStr0,
    mConStr1,
    stringToHex
} from '@meshsdk/common';


const blockchainProvider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST as string);

const mesh = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    evaluator: blockchainProvider,
});

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
    const [giftCardPolicy, setGiftCardPolicy] = useState();
    const [giftCardScript, setGiftCardScript] = useState();
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
                    <a style={{ color: 'orange', textDecoration: 'none' }}>Gift card</a>
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
                                setGiftCardScript={setGiftCardScript}
                                setGiftCardPolicy={setGiftCardPolicy}
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
                                giftCardScript={giftCardScript}
                                giftCardPolicy={giftCardPolicy}
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


function MintButton({ setState, state, setGiftCardScript, setGiftCardPolicy, tokenName, setTransactionHash, setScript }) {
    const { wallet, connected } = useWallet();

    function getPolicy(utxo) {
        const outRef = { alternative: 0, fields: [{ alternative: 0, fields: [utxo.input.txHash] }, utxo.input.outputIndex] }
        const cborPolicy = applyParamsToScript(plutusScript.validators.filter((val: any) => val.title == "lesson02/nft.nft")[0].compiledCode, [outRef, stringToHex(tokenName)])
        return {
            code: cborPolicy,
            version: "V2"
        }
    }

    async function mintAiken() {
        setState(States.minting);
        const allUtxos = await wallet.getUtxos();
        const collateral = (await wallet.getCollateral())[0];
        const firstUtxo = allUtxos[0];
        const tokenNameHex = stringToHex(tokenName);
        const remainingUtxos = allUtxos.slice(1);
        const giftValue: Asset[] = [
            {
                unit: 'lovelace',
                quantity: '20000000',
            },
        ];
        const giftCardScript = getPolicy(firstUtxo).code;
        const giftCardPolicy = getV2ScriptHash(giftCardScript);
        setGiftCardPolicy(giftCardPolicy);
        setGiftCardScript(giftCardScript)
        const walletAddress = (await wallet.getUsedAddresses())[0];
        const redeemScript = getRedeemScript(giftCardPolicy, tokenName);
        const redeemAddr = resolvePlutusScriptAddress(redeemScript, 0);
        mesh.txIn(
            firstUtxo.input.txHash,
            firstUtxo.input.outputIndex,
            firstUtxo.output.amount,
            firstUtxo.output.address
        )
            .mintPlutusScriptV2()
            .mint('1', giftCardPolicy, tokenNameHex)
            .mintingScript(giftCardScript)
            .mintRedeemerValue(mConStr0([]))
            .txOut(redeemAddr, [
                ...giftValue,
                { unit: giftCardPolicy + tokenNameHex, quantity: '1' },
            ])
            .txOutInlineDatumValue([
                firstUtxo.input.txHash,
                firstUtxo.input.outputIndex,
                tokenNameHex,
            ])
            .changeAddress(walletAddress)
            .txInCollateral(
                collateral.input.txHash,
                collateral.input.outputIndex,
                collateral.output.amount,
                collateral.output.address
            )
            .requiredSignerHash(resolvePaymentKeyHash(walletAddress))
            .selectUtxosFrom(remainingUtxos)
            .completeSync();

        const signedTx = await wallet.signTx(mesh.txHex, true);
        const txHash = await wallet.submitTx(signedTx);
        console.log("txHash", txHash);
        setTransactionHash(txHash);
        mesh.reset();
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


function BurnButton({ setState, state, giftCardScript, giftCardPolicy, tokenName, setTransactionHash, script }) {
    const { wallet } = useWallet();

    async function burnAiken() {
        const walletAddress = (await wallet.getUsedAddresses())[0];
        const redeemScript = getRedeemScript(giftCardPolicy, tokenName);
        const redeemAddr = resolvePlutusScriptAddress(redeemScript, 0);
        const utxos = await wallet.getUtxos();
        const giftCardUtxo = (await blockchainProvider.fetchAddressUTxOs(redeemAddr))[0];
        console.log(giftCardUtxo);
        const collateral = (await wallet.getCollateral())[0];
        const tokenNameHex = stringToHex(tokenName);

        console.log(giftCardScript);
        console.log(giftCardPolicy);

        mesh
            .spendingPlutusScriptV2()
            .txIn(
                giftCardUtxo.input.txHash,
                giftCardUtxo.input.outputIndex,
                giftCardUtxo.output.amount,
                giftCardUtxo.output.address
            )
            .spendingReferenceTxInInlineDatumPresent()
            .spendingReferenceTxInRedeemerValue("")
            .txInScript(redeemScript.code)
            .mintPlutusScriptV2()
            .mint('-1', giftCardPolicy, tokenNameHex)
            .mintingScript(giftCardScript, "V2")
            .mintRedeemerValue(mConStr1([]))
            .changeAddress(walletAddress)
            .txInCollateral(
                collateral.input.txHash,
                collateral.input.outputIndex,
                collateral.output.amount,
                collateral.output.address
            )
            .selectUtxosFrom(utxos)
            .requiredSignerHash(resolvePaymentKeyHash(walletAddress))
            .completeSync();

        const signedTx = await wallet.signTx(mesh.txHex, true);
        const txHash = await wallet.submitTx(signedTx);
        console.log("txHash", txHash);
        setTransactionHash(txHash);
        mesh.reset();
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

function getRedeemScript(policyId, tokenName) {
    const cborScript = applyParamsToScript(plutusScript.validators.filter((val: any) => val.title == "lesson02/redeem_gift.redeem")[0].compiledCode, [stringToHex(tokenName), policyId])
    return {
        code: cborScript,
        version: "V2"
    }
}