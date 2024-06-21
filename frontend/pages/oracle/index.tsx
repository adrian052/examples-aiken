import Head from "next/head";
import { CardanoWallet, useWallet } from "@meshsdk/react";
import {
    resolvePlutusScriptAddress,
    Transaction,
    resolvePaymentKeyHash,
    BlockfrostProvider,
    readPlutusData,
    MeshTxBuilder
} from "@meshsdk/core";
import { applyParamsToScript, getV2ScriptHash } from '@meshsdk/core-csl'
import { useState, useEffect } from "react";
import plutusScript from "../../../onchain/plutus.json"
import { hexToString, mConStr0, stringToHex } from "@meshsdk/common";
import { fetchAdaPrice } from "../../lib/api";
import { formatTime } from "../../lib/utils";


const blockchainProvider = new BlockfrostProvider(process.env.NEXT_PUBLIC_BLOCKFROST as string);

const mesh = new MeshTxBuilder({
    fetcher: blockchainProvider,
    submitter: blockchainProvider,
    evaluator: blockchainProvider,
});

enum States {
    init,
    deploying,
    deployConfirming,
    deployed,
    updating,
    updatingConfirming
}

export default function Home() {
    const { wallet } = useWallet();
    const [state, setState] = useState(States.init);
    const [time, setTime] = useState(10);
    const [oracleAddress, setOracleAddress] = useState("");
    const [policyId, setPolicyId] = useState();
    const [oracleScript, setOracleScript] = useState({ code: "", version: "" });
    var { connected } = useWallet()

    useEffect(() => {
        let timerId;
        if (state === States.deployed && time > 0) {
            timerId = setInterval(() => {
                setTime(prevTime => prevTime - 1);
            }, 1000);
        }

        return () => {
            clearInterval(timerId);
        }
    }, [state, time]);

    useEffect(() => {
        if (time === 0) {
            updateOracle();
        }
    }, [time]);


    const updateOracle = async () => {
        setState(States.updating);
        const address = (await wallet.getUsedAddresses())[0];
        const asset = policyId + stringToHex("OracleNFT");
        const utxos = await blockchainProvider.fetchAddressUTxOs(oracleAddress, asset);
        const oracleUtxo = utxos[0];
        const ownerUtxo = (await blockchainProvider.fetchAddressUTxOs(address))[0];
        const adaPrice = await fetchAdaPrice();
        const datum = adaPrice.toString();


        mesh
            .spendingPlutusScriptV2()
            .txIn(
                oracleUtxo.input.txHash,
                oracleUtxo.input.outputIndex,
                oracleUtxo.output.amount,
                address
            )
            .txInRedeemerValue(mConStr0([]))
            .txInInlineDatumPresent()
            .txInScript(oracleScript.code)
            .txIn(
                ownerUtxo.input.txHash,
                ownerUtxo.input.outputIndex,
                ownerUtxo.output.amount,
                address
            )
            .txInCollateral(
                ownerUtxo.input.txHash,
                ownerUtxo.input.outputIndex,
                ownerUtxo.output.amount,
                address)
            .requiredSignerHash(resolvePaymentKeyHash(address))
            .txOut(oracleAddress, oracleUtxo.output.amount)
            .txOutInlineDatumValue(stringToHex(datum))
            .changeAddress(address)
            .completeSync();



        const signedTx = await wallet.signTx(mesh.txHex, true);
        const txHash = await wallet.submitTx(signedTx);
        console.log(txHash);
        if (txHash) {
            setState(States.deployConfirming);
            blockchainProvider.onTxConfirmed(
                txHash,
                async () => {
                    setState(States.deployed);
                    setTime(10);
                },
                100
            );
        }
    }

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
                    </>
                )}
                <div className="grid">
                    {(state == States.init || state == States.deploying || state == States.deployConfirming) && (<a className="card">
                        <h2>Deploy Oracle</h2>
                        <p>
                            Deploy Oracle and update it automatically:<br />
                            {<DeployButton setState={setState} state={state} setOracleAddress={setOracleAddress} setPolicyId={setPolicyId} setOracleScript={setOracleScript} />}
                        </p>
                    </a>)}

                    {(state == States.deployed || state == States.updatingConfirming) && (<a className="card">
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

function DeployButton({ setState, state, setOracleAddress, setPolicyId, setOracleScript }) {
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
        const nftPolicy = getV2ScriptHash(policy.code);
        const pkh = resolvePaymentKeyHash(address);
        const oNft = { alternative: 0, fields: [nftPolicy, stringToHex("OracleNFT")] };

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
        setPolicyId(getV2ScriptHash(policy.code));
        setOracleScript(getOracleScript(policy, address));

        ///Making the transaction 
        const tx = new Transaction({ initiator: wallet })
            .mintAsset(policy, mintAsset, redeemer)
            .setTxInputs(utxos).setCollateral(utxos);

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
    const { connected } = useWallet();

    async function queryOracle() {
        const asset = policyId + stringToHex("OracleNFT");
        const utxo = (await blockchainProvider.fetchAddressUTxOs(oracleAddress, asset))[0];
        let value = hexToString(readPlutusData(utxo.output.plutusData));
        alert("ADA's oracle price: " + value);
    }

    return (
        <button type="button" onClick={() => queryOracle()} className="demo button" disabled={!connected || state !== States.deployed}>
            Query Oracle
        </button>
    );
}
