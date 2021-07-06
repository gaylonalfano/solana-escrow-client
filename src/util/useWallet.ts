/* eslint-disable */
// @ts-ignore
import Wallet from "@project-serum/sol-wallet-adapter";
/* eslint-enable */
import {
  Connection,
  SystemProgram,
  Transaction,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import EventEmitter from "eventemitter3";

export interface WalletAdapter extends EventEmitter {
  // This type is a Pub/Sub system, which means WalletAdapter
  // is a publisher that we can subscribe to for some hooks.
  // NOTE We're only doing ot use a handful of props available.
  publicKey: PublicKey | null; // main address
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  connect: () => any; // Must call this to make network connection
  disconnect: () => any;
}

// === Setup base fields we need
// const cluster = "https://devnet.solana.com";  // OLD
const cluster = "https://api.devnet.solana.com";
// const cluster = "http://localhost:8899";  // Must use CLI solana-test-validator
// NOTE "confirmed" is the confirmation level we're going to use
// when querying the blockchain. There are other levels (final for 2/3 nodes),
// but "confirmed" is confirmation by one node.
const connection = new Connection(cluster, "confirmed");
// Going to use Sollet.io as the wallet provider
const wallet: WalletAdapter = new Wallet("https://www.sollet.io", cluster);

// === Initialize our Wallet
export async function initWallet(): Promise<[Connection, WalletAdapter]> {
  try {
    // Returning a Tuple
    // 1. Make the connection
    await wallet.connect();
    console.log("wallet publicKey", wallet?.publicKey?.toBase58());
  } catch (error) {
    console.log("initWallet error: ", error);
  }
  // 2. Send appropriate fields
  console.log(connection);
  console.log(wallet);
  return [connection, wallet];
}

// === Send Money based on UI form input values
// NOTE We hardcode sending ~ .5 SOL
export async function sendMoney(
  destPubkeyStr: string, // NOTE We'll convert this to a PublicKey type
  lamports: number = 500 * 1000000
): Promise<void> {
  try {
    // 1. Create instance of PublicKey for destination
    const destPubkey = new PublicKey(destPubkeyStr);
    // 2. View amount of space in account
    // NOTE When a Wallet creates an account, by default account data space is 0!
    const walletAccountInfo = await connection.getAccountInfo(
      wallet!.publicKey!
    );
    console.log("walletAccountInfo data: ", walletAccountInfo?.data.length); // 0 by default
    // 3. View receiver's account info
    const receiverAccountInfo = await connection.getAccountInfo(destPubkey);
    console.log("receiverAccountInfo data: ", receiverAccountInfo?.data.length); // 0 by default

    // === Reuse some built-in Program functionality to send money.
    // NOTE We don't have to create our own smart contract/program!
    // 4. Create the TransactionInstruction
    const instruction: TransactionInstruction = SystemProgram.transfer({
      fromPubkey: wallet!.publicKey!,
      toPubkey: destPubkey,
      lamports,
    });
    // 5. Get a signature/sign for the debit of funds
    // NOTE Since we're requesting a transfer() we must SIGN!
    const transaction = await setWalletTransaction(instruction);
    // 6. Perform the signing per the user wallet
    // NOTE We must sign directly (can't sign within transfer() instruction)
    const signature = await signAndSendTransaction(wallet, transaction);
    // 7. Confirm that everything went smoothly for the transaction
    // NOTE "singleGossip" is the commitment level
    const result = await connection.confirmTransaction(
      signature,
      "singleGossip"
    );
    console.log("sendMoney:result: ", result);
  } catch (error) {
    console.log("Failed to send money!", error);
  }
}

export async function setWalletTransaction(
  instruction: TransactionInstruction
): Promise<Transaction> {
  // Take instuction, modify it, and return new Transaction object with this instruction
  // 1. Create new Transaction instance
  const transaction = new Transaction();
  // 2. Add our instruction to it
  transaction.add(instruction);
  // 3. Define the wallet as the Payer
  transaction.feePayer = wallet!.publicKey!;
  // 4. Get the prior block hash
  // NOTE Recall that all transactions when submitted in order to go through
  // certain Solana checks, we must provide a recent block hash
  const recentHash = await connection.getRecentBlockhash();
  // 5. Update the recentBlockhash property of the transaction
  transaction.recentBlockhash = recentHash.blockhash;
  // 6. Return our new updated transaction object with new instruction
  return transaction;
}

export async function signAndSendTransaction(
  wallet: WalletAdapter,
  transaction: Transaction
): Promise<string> {
  // 1. First make it a signed transaction (ie pass transaction and inject signature)
  const signedTransaction = await wallet.signTransaction(transaction);
  // 2. Send signed and serialized transaction to get string signature back
  const signature = await connection.sendRawTransaction(
    signedTransaction.serialize()
  );
  // 3. Return the string signature
  return signature;
}
