use aiken/transaction.{ScriptContext}

validator {
  fn fortyTwo(_d: Data, redeemer: Int, _ctx: ScriptContext) -> Bool {
    redeemer == 42
  }
}
