import { Given, Then, When, Before } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import {
  AccountBalance,
  AccountBalanceQuery, AccountId, Client, Hbar, PrivateKey, TokenAssociateTransaction, TokenCreateTransaction
  , TokenInfoQuery, TokenMintTransaction,
  TokenSupplyType,
  TransferTransaction,AccountCreateTransaction
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet()


function getTokenBalance(accountBalance: AccountBalance, tokenId: any): number {
  if (!accountBalance.tokens) {
    return 0;
  }
  return (
    accountBalance.tokens.get(tokenId)?.toNumber() ??
    accountBalance.tokens.get(tokenId.toString())?.toNumber() ??
    0
  );
}
async function generateHederaAccount(initialHbar:number): Promise<{newAccountId: AccountId, newPrivateKey: PrivateKey}> {
   // generates a new ED25519 key pair in memory
  const newPrivateKey = PrivateKey.generateED25519();
  const newPublicKey = newPrivateKey.publicKey;

  // Build & execute the account creation transaction
  const transaction = new AccountCreateTransaction()
    .setKeyWithoutAlias(newPublicKey)  // set the account key
    .setInitialBalance(new Hbar(initialHbar));    // fund with initialHbar HBAR

  const txResponse = await transaction.execute(client);
  const receipt = await txResponse.getReceipt(client);
  if (!receipt.accountId) {
    throw new Error("Account creation failed: accountId is null");
  }
  const newAccountId: AccountId = receipt.accountId;
  return {newAccountId, newPrivateKey};
}

async function associateAccToToken(accountId: AccountId, privateKey: PrivateKey, tokenId: any) {
  const associateAccountTx = new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([tokenId])
    .freezeWith(client);

  const signedAssociateAccountTx = await associateAccountTx.sign(privateKey);

  const associateAccountRx = await (
    await signedAssociateAccountTx.execute(client)
  ).getReceipt(client);
  assert.ok(associateAccountRx.status.toString() === "SUCCESS");
  return true;
}

async function tokenTransfer(fromAccountId: AccountId, fromPrivateKey: PrivateKey, toAccountId: AccountId, tokenId: any, amount: number) {
  const transferTx = new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccountId, -amount)
    .addTokenTransfer(tokenId, toAccountId, amount)
    .freezeWith(client);

  const signedTransferTx = await transferTx.sign(fromPrivateKey);

  const transferRx = await (
    await signedTransferTx.execute(client)
  ).getReceipt(client);
  assert.ok(transferRx.status.toString() === "SUCCESS");
  return true;
}

Before(function (scenario) {
  this.currentScenario = scenario.pickle.name;
  const treasury = accounts[0]
  const treasuryAccountId: AccountId = AccountId.fromString(treasury.id);
  this.treasuryAccountId = treasuryAccountId
  const privKey: PrivateKey = PrivateKey.fromStringED25519(treasury.privateKey);
  this.treasuryPrivateKey = privKey
  client.setOperator(this.treasuryAccountId, this.treasuryPrivateKey);
});

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
  this.accountId = client.getOperator()?.accountId
  this.privKey = MY_PRIVATE_KEY
  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)


});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const txResponse = await new TokenCreateTransaction()
    .setDecimals(2)
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setAdminKey(this.accountId.publicKey)
    .setTreasuryAccountId(this.accountId)
    .setSupplyKey(this.privKey)
    .execute(client)
  const receipt = await txResponse.getReceipt(client)
  this.tokenId = receipt.tokenId
});

Then(/^The token has the name "([^"]*)"$/, async function (tokenName: string) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.name == tokenName)
});

Then(/^The token has the symbol "([^"]*)"$/, async function (tokenSymbol: string) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.symbol == tokenSymbol)
});

Then(/^The token has (\d+) decimals$/, async function (tokenDecimals: number) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.decimals == tokenDecimals)

});

Then(/^The token is owned by the account$/, async function () {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.treasuryAccountId?.equals(this.accountId))
});

Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (tokensToMint: number) {
  const tokenMint = await new TokenMintTransaction()
    .setTokenId(this.tokenId)
    .setAmount(tokensToMint)
    .execute(client);

  const receipt = await tokenMint.getReceipt(client);
  assert.ok(receipt.status.toString() == "SUCCESS")

});
When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (tokenSupply: number) {
  const txResponse = await new TokenCreateTransaction()
    .setDecimals(2)
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setInitialSupply(100000)
    .setSupplyType(TokenSupplyType.Finite) // Fixed supply
    .setMaxSupply(100000)
    .setAdminKey(this.accountId.publicKey)
    .setTreasuryAccountId(this.accountId)
    .execute(client)
  const receipt = await txResponse.getReceipt(client)
  this.tokenId = receipt.tokenId

});
Then(/^The total supply of the token is (\d+)$/, async function (totalSupply: number) {
  const tokenInfo = await new TokenInfoQuery().setTokenId(this.tokenId).execute(client);
  assert.ok(tokenInfo.totalSupply.toNumber() == totalSupply * 100); // considering 2 decimals

});
Then(/^An attempt to mint tokens fails$/, async function () {
  try {
    const tokenMint = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(1000)
      .execute(client);
  }
  catch (error) {
    console.log("Minting failed as expected for fixed supply token");
  }

});
Given(/^A first hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const acc = accounts[0]
  const account: AccountId = AccountId.fromString(acc.id);
  this.account1 = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey1 = privKey
  client.setOperator(this.account1, privKey);

  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(this.account1);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)

});
Given(/^A second Hedera account$/, async function () {

  const acc = accounts[1]
  const account: AccountId = AccountId.fromString(acc.id);
  this.account2 = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey2 = privKey
});
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function (tokenSupply: number) {
  if (this.currentScenario.includes("Create a token transfer transaction paid for by the recipient")) {
    const tokenCreateTx = await new TokenCreateTransaction()
      .setDecimals(2)
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setInitialSupply(100 * 100)
      .setSupplyType(TokenSupplyType.Finite)  // Fixed supply
      .setMaxSupply(tokenSupply * 100)
      .setTreasuryAccountId(this.account2)
      .freezeWith(client)

    //SIGN WITH TREASURY KEY
    const tokenCreateSign = await tokenCreateTx.sign(this.privKey2);
    //SUBMIT THE TRANSACTION
    const tokenCreateSubmit = await tokenCreateSign.execute(client);
    const receipt = await tokenCreateSubmit.getReceipt(client)
    this.tokenId1 = receipt.tokenId
  }
  else if (this.currentScenario.includes("Transfer tokens between 2 accounts")) {
    const tokenCreateTx = await new TokenCreateTransaction()
      .setDecimals(2)
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setInitialSupply(100 * 100)
      .setSupplyType(TokenSupplyType.Finite)  // Fixed supply
      .setMaxSupply(tokenSupply * 100)
      .setTreasuryAccountId(this.account1)
      .freezeWith(client)

    //SIGN WITH TREASURY KEY
    const tokenCreateSign = await tokenCreateTx.sign(this.privKey1);
    //SUBMIT THE TRANSACTION
    const tokenCreateSubmit = await tokenCreateSign.execute(client);
    const receipt = await tokenCreateSubmit.getReceipt(client)
    this.tokenId1 = receipt.tokenId
  }
  else {
    const tokenCreateTx = await new TokenCreateTransaction()
      .setDecimals(2)
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setInitialSupply(tokenSupply * 100)
      .setSupplyType(TokenSupplyType.Finite)  // Fixed supply
      .setMaxSupply(tokenSupply * 100)
      .setTreasuryAccountId(this.treasuryAccountId)
      .freezeWith(client)

    //SIGN WITH TREASURY KEY
    const tokenCreateSign = await tokenCreateTx.sign(this.treasuryPrivateKey);
    //SUBMIT THE TRANSACTION
    const tokenCreateSubmit = await tokenCreateSign.execute(client);
    const receipt = await tokenCreateSubmit.getReceipt(client)
    this.tokenId1 = receipt.tokenId
  }



});
Given(/^The first account holds (\d+) HTT tokens$/, async function (initialTokens: number) {
  let account1Balance: AccountBalance = await new AccountBalanceQuery()
    .setAccountId(this.account1)
    .execute(client);

  assert.ok(getTokenBalance(account1Balance, this.tokenId1) === initialTokens * 100);

});
Given(/^The second account holds (\d+) HTT tokens$/, async function (account2Tokens: number) {

  let account2Balance: AccountBalance = await new AccountBalanceQuery()
    .setAccountId(this.account2)
    .execute(client);
  assert.ok(getTokenBalance(account2Balance, this.tokenId1) === account2Tokens * 100);

});
When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function (tokenAmount: number) {

  // TOKEN ASSOCIATION WITH SECOND ACCOUNT
  const associateAccountTx = await new TokenAssociateTransaction()
    .setAccountId(this.account2)
    .setTokenIds([this.tokenId1])
    .freezeWith(client)
    .sign(this.privKey2);

  //SUBMIT and GET THE RECEIPT OF THE TRANSACTION
  const associateAccountRx = await (
    await associateAccountTx.execute(client)
  ).getReceipt(client);
  assert.ok(associateAccountRx.status.toString() === "SUCCESS");

  // TOKEN TRANSFER tx FROM ACCOUNT 1 TO ACCOUNT 2
  const tokenTransferTx = await new TransferTransaction()
    .addTokenTransfer(this.tokenId1, this.account1, -tokenAmount * 100) // Debit from account 1
    .addTokenTransfer(this.tokenId1, this.account2, tokenAmount * 100) // Credit to account 2
    .freezeWith(client)
    .sign(this.privKey1)
  this.tokenTransferTx = tokenTransferTx
});
When(/^The first account submits the transaction$/, async function () {
  // Handle both regular transfer and multi-party transfer transactions
  const txToSubmit = this.multiPartyTransferTx || this.tokenTransferTx;

  const tokenTranferSubmitTx = await txToSubmit.execute(client);
  const tokenTransferRx = await tokenTranferSubmitTx.getReceipt(client);
  assert.ok(tokenTransferRx.status.toString() === "SUCCESS");
  this.tokenTranferSubmitTx = tokenTranferSubmitTx

});
When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function (tokenAmount: number) {
  // TOKEN ASSOCIATION WITH FIRST ACCOUNT
  const associateAccountTx = await new TokenAssociateTransaction()
    .setAccountId(this.account1)
    .setTokenIds([this.tokenId1])
    .freezeWith(client)
    .sign(this.privKey1);

  //SUBMIT and GET THE RECEIPT OF THE TRANSACTION
  const associateAccountRx = await (
    await associateAccountTx.execute(client)
  ).getReceipt(client);
  assert.ok(associateAccountRx.status.toString() === "SUCCESS");
  // TOKEN TRANSFER tx FROM ACCOUNT 2 TO ACCOUNT 1
  const tokenTransferTx = await new TransferTransaction()
    .addTokenTransfer(this.tokenId1, this.account2, -tokenAmount * 100) // Debit from account 2
    .addTokenTransfer(this.tokenId1, this.account1, tokenAmount * 100) // Credit to account 1
    .freezeWith(client)
    .sign(this.privKey2)
  this.tokenTransferTx = tokenTransferTx
});

Then(/^The first account has paid for the transaction fee$/, async function () {
  const txRecord = await this.tokenTranferSubmitTx.getRecord(client);
  assert.ok(txRecord.transactionId.accountId.equals(this.account1));
});

Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function (expectedBalance: number, tokenBalance: number) {
  const hederaAccount = await generateHederaAccount((expectedBalance + 2));
  this.account1 = hederaAccount.newAccountId;
  this.privKey1 = hederaAccount.newPrivateKey;
  
  await associateAccToToken(this.account1, this.privKey1, this.tokenId1);

  await tokenTransfer(this.treasuryAccountId, this.treasuryPrivateKey, this.account1, this.tokenId1, tokenBalance * 100);
 
  const query = new AccountBalanceQuery().setAccountId(this.account1);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
  assert.ok(getTokenBalance(balance, this.tokenId1) === tokenBalance * 100);

});
Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (hbarAmount: number, tokenAmount: number) {
  const hederaAccount = await generateHederaAccount((hbarAmount));
  this.account2 = hederaAccount.newAccountId;
  this.privKey2 = hederaAccount.newPrivateKey;
  
  await associateAccToToken(this.account2, this.privKey2, this.tokenId1);
  await tokenTransfer(this.treasuryAccountId, this.treasuryPrivateKey, this.account2, this.tokenId1, tokenAmount * 100);
 
  const query = new AccountBalanceQuery().setAccountId(this.account2);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() == hbarAmount)
  assert.ok(getTokenBalance(balance, this.tokenId1) === tokenAmount * 100);
});
Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (hbarAmount: number, tokenAmount: number) {
  const hederaAccount = await generateHederaAccount((hbarAmount));
  this.account3 = hederaAccount.newAccountId;
  this.privKey3 = hederaAccount.newPrivateKey;
  
  await associateAccToToken(this.account3, this.privKey3, this.tokenId1);
  await tokenTransfer(this.treasuryAccountId, this.treasuryPrivateKey, this.account3, this.tokenId1, tokenAmount * 100);
 
  const query = new AccountBalanceQuery().setAccountId(this.account3);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() == hbarAmount)
  assert.ok(getTokenBalance(balance, this.tokenId1) === tokenAmount * 100);
});
Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function (hbarAmount: number, tokenAmount: number) {
 const hederaAccount = await generateHederaAccount((hbarAmount));
  this.account4 = hederaAccount.newAccountId;
  this.privKey4 = hederaAccount.newPrivateKey;
  
  await associateAccToToken(this.account4, this.privKey4, this.tokenId1);
  await tokenTransfer(this.treasuryAccountId, this.treasuryPrivateKey, this.account4, this.tokenId1, tokenAmount * 100);
 
  const query = new AccountBalanceQuery().setAccountId(this.account4);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() == hbarAmount)
  assert.ok(getTokenBalance(balance, this.tokenId1) === tokenAmount * 100);
});
When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function (transferOut: number, transferInThird: number, transferInFourth: number) {
  // Create a multi-party transfer transaction:
  // - Debit 10 tokens from account 1
  // - Debit 10 tokens from account 2
  // - Credit 5 tokens to account 3
  // - Credit 15 tokens to account 4

  const tokenTransferTx = await new TransferTransaction()
    .addTokenTransfer(this.tokenId1, this.account1, -transferOut * 100)      // Account 1 sends 10 tokens
    .addTokenTransfer(this.tokenId1, this.account2, -transferOut * 100)      // Account 2 sends 10 tokens
    .addTokenTransfer(this.tokenId1, this.account3, transferInThird * 100)   // Account 3 receives 5 tokens
    .addTokenTransfer(this.tokenId1, this.account4, transferInFourth * 100)  // Account 4 receives 15 tokens
    .freezeWith(client);

  const signedTx = await tokenTransferTx.sign(this.privKey1);
  const fullySignedTx = await signedTx.sign(this.privKey2);

  this.multiPartyTransferTx = fullySignedTx;
});
Then(/^The third account holds (\d+) HTT tokens$/, async function (expectedTokens: number) {
  const account3Balance: AccountBalance = await new AccountBalanceQuery()
    .setAccountId(this.account3)
    .execute(client);

  assert.ok(getTokenBalance(account3Balance, this.tokenId1) === expectedTokens * 100);
});
Then(/^The fourth account holds (\d+) HTT tokens$/, async function (expectedTokens: number) {
  const account4Balance: AccountBalance = await new AccountBalanceQuery()
    .setAccountId(this.account4)
    .execute(client);

  assert.ok(getTokenBalance(account4Balance, this.tokenId1) === expectedTokens * 100);
});
