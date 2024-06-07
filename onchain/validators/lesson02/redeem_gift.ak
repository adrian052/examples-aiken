use aiken/dict.{to_list}
use aiken/transaction.{ScriptContext, Transaction}
use aiken/transaction/value.{AssetName, from_minted_value, tokens}

validator(token_name: AssetName, policy_id: ByteArray) {
  fn redeem(_d: Data, _r: Data, ctx: ScriptContext) -> Bool {
    let ScriptContext { transaction, .. } = ctx
    let Transaction { mint, .. } = transaction
    expect [(asset_name, amount)] =
      mint |> from_minted_value |> tokens(policy_id) |> to_list()
    amount == -1 && asset_name == token_name
  }
}
