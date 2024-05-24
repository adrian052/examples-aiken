use aiken/transaction.{ScriptContext}

validator {
  fn eqDatumRedeem(datum: String, redeemer: String, _ctx: ScriptContext) -> Bool {
    redeemer == datum
  }
}
