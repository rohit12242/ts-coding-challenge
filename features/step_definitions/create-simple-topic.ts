import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey, RequestType,
  TopicCreateTransaction, TopicInfoQuery,
  TopicMessageQuery, TopicMessageSubmitTransaction,
  AccountCreateTransaction, Hbar, KeyList
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0]
  const MY_ACCOUNT_ID = AccountId.fromString(acc.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(acc.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
  this.accountId = client.getOperator()?.accountId
  this.privKey = MY_PRIVATE_KEY
  //Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const txResponse = await new TopicCreateTransaction()
    .setTopicMemo(memo)
    .setSubmitKey(this.privKey.publicKey)
    .execute(client);
  const topic = await txResponse.getReceipt(client)
  this.topic = topic
  assert.ok(topic.topicId)
  const topicInfo = await new TopicInfoQuery().setTopicId(topic.topicId).execute(client)
  assert.ok(topicInfo.topicMemo == memo)
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
  const messageTransaction = new TopicMessageSubmitTransaction().setTopicId(this.topic.topicId).setMessage(message)
  await messageTransaction.execute(client);
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {
  const mirrorNodeUrl = `https://testnet.mirrornode.hedera.com/api/v1/topics/${this.topic.topicId}/messages`;
  console.log("\nWaiting for Mirror Node to update...");
  await new Promise((resolve) => setTimeout(resolve, 4000));

  try {
    const response = await fetch(mirrorNodeUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();

    if (data.messages && data.messages.length > 0) {
      const latestMessage = data.messages[data.messages.length - 1];
      const messageContent = Buffer.from(latestMessage.message, "base64")
        .toString("utf8")
        .trim();

      console.log(`\nLatest message: ${messageContent}\n`);
    } else {
      console.log("No messages found yet in Mirror Node");
    }
  } catch (error) {
    console.error("Error fetching from Mirror Node:", error);
  } 
});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {

  const acc = accounts[1]
  const account: AccountId = AccountId.fromString(acc.id);
  this.newAccountId = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.newPrivateKey = privKey

  // //Create the query request
  const query = new AccountBalanceQuery().setAccountId(this.newAccountId);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)


});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold: number, total: number) {
  const keys = [this.privKey.publicKey, this.newPrivateKey.publicKey];
  this.thresholdKeys = new KeyList(keys, threshold);
  assert.ok(this.thresholdKeys.threshold === threshold);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const txResponse = await new TopicCreateTransaction().setTopicMemo(memo).setSubmitKey(this.thresholdKeys.publicKey).execute(client)
  const topic = await txResponse.getReceipt(client)
  this.topic = topic
  assert.ok(topic.topicId)
  const topicInfo = await new TopicInfoQuery().setTopicId(topic.topicId).execute(client)
  assert.ok(topicInfo.topicMemo == memo)

});
