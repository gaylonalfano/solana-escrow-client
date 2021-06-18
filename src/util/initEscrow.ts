import { AccountLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Account,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { ESCROW_ACCOUNT_DATA_LAYOUT, EscrowLayout } from "./layout";

const connection = new Connection("http://localhost:8899", "singleGossip");

export const initEscrow = async (
  privateKeyByteArray: string,
  initializerXTokenAccountPubkeyString: string,
  amountXTokensToSendToEscrow: number,
  initializerReceivingTokenAccountPubkeyString: string,
  expectedAmount: number,
  escrowProgramIdString: string
) => {
  const initializerXTokenAccountPubkey = new PublicKey(
    initializerXTokenAccountPubkeyString
  );

  // Original code: @ts-expect-error
  // NOTE Had to break this up to isolate the TS error
  // const XTokenMintAccountPubkey = new PublicKey(
  //   (
  //     await connection.getParsedAccountInfo(
  //       initializerXTokenAccountPubkey,
  //       "singleGossip"
  //     )
  //   ).value!.data.parsed.info.mint
  // );
  const XTokenMintAccountInfo = await connection.getParsedAccountInfo(
    initializerXTokenAccountPubkey,
    "singleGossip"
  );
  const XTokenMintAccountPubkey = new PublicKey(
    // @ts-expect-error
    XTokenMintAccountInfo.value!.data.parsed.info.mint
  );

  const privateKeyDecoded = privateKeyByteArray
    .split(",")
    .map((s) => parseInt(s));
  const initializerAccount = new Account(privateKeyDecoded);

  // Create the new X token account that will be transferred to the
  // PDA eventually.
  // NOTE This is (I believe) ix1 in slideshow where Alice's main account asks
  // System Program to create a new acocunt that is owned by Token Program.
  const tempTokenAccount = new Account();
  // Build instructions (ix) for creating the new account
  const createTempTokenAccountIx = SystemProgram.createAccount({
    programId: TOKEN_PROGRAM_ID, // Which program this new account should belong to
    space: AccountLayout.span, // How much space the account should have
    lamports: await connection.getMinimumBalanceForRentExemption(
      AccountLayout.span,
      "singleGossip" // Commitment level
    ), // Initial balance
    fromPubkey: initializerAccount.publicKey, // Where to transfer balance from
    newAccountPubkey: tempTokenAccount.publicKey, // Address of the new account
  });

  // Use helper functions from spl-token-js library to create more instructions.
  // NOTE This is ix2 where Token Program inits Alice's temp X token account that
  // she asked System Program to create (above in createTempTokenAccountIx).
  const initTempAccountIx = Token.createInitAccountInstruction(
    TOKEN_PROGRAM_ID, // This temp X token account's owner (per Alice's ix1 instruction)
    XTokenMintAccountPubkey, // Q: This should be a Solana SPL Token pubkey for X, right?
    tempTokenAccount.publicKey, // Alice's temp X token account just created by SP
    initializerAccount.publicKey // Alice's main account pubkey
  );
  // NOTE I believe this is the part (ix3 in the slideshow) where Alice's main account
  // asks Token Program to transfer N amount of X tokens from her X token account
  // to her temporary X token account (that was just initialized by TP above!).
  const transferXTokensToTempAccIx = Token.createTransferInstruction(
    TOKEN_PROGRAM_ID,
    initializerXTokenAccountPubkey,
    tempTokenAccount.publicKey,
    initializerAccount.publicKey,
    [],
    amountXTokensToSendToEscrow
  );

  // NOTE This is ix4 in slideshow where Alice's main account (initializer) asks
  // System Program to create a new account (Escrow Account) owned by Escrow Program.
  const escrowAccount = new Account();
  const escrowProgramId = new PublicKey(escrowProgramIdString);

  const createEscrowAccountIx = SystemProgram.createAccount({
    space: ESCROW_ACCOUNT_DATA_LAYOUT.span,
    lamports: await connection.getMinimumBalanceForRentExemption(
      ESCROW_ACCOUNT_DATA_LAYOUT.span,
      "singleGossip"
    ),
    fromPubkey: initializerAccount.publicKey,
    newAccountPubkey: escrowAccount.publicKey,
    programId: escrowProgramId,
  });

  // Create another account but this time owned by Escrow Program
  // IMPORTANT This is EXACTLY what our program entrypoint expects!
  // Recall that our process_instruction() takes in the program_id, accounts,
  // and instruction_data and passes these into our Processor::process() fn.
  // NOTE This should be ix5-1 in slideshow where Alice's main account
  // asks Escrow Program to initialize the new (empty) escrow account System Program
  // just created (createEscrowAccountIx). Instructions include where the
  // tokens to be sold are stored (Alice's temp X token account), and which
  // account (this new empty Escrow Account) can be used by Escrow Program
  // to write state in to.
  const initEscrowIx = new TransactionInstruction({
    // The program_id needed (Escrow Program ID in this case) for entrypoint
    programId: escrowProgramId,
    // Accounts needed for the TX
    keys: [
      {
        pubkey: initializerAccount.publicKey,
        isSigner: true,
        isWritable: false,
      },
      { pubkey: tempTokenAccount.publicKey, isSigner: false, isWritable: true },
      {
        pubkey: new PublicKey(initializerReceivingTokenAccountPubkeyString),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: escrowAccount.publicKey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    // instruction_data passed to our entrypoint
    data: Buffer.from(
      // NOTE Start with 0 since the first byte is what we used in instruction.rs
      // as a 'tag' to determine how to decode the instruction.
      // 0 means InitEscrow. The next bytes will be the expected_amount.
      // NOTE We use the bn.js library to write our expected amount as an 8-byte
      // array of little-endian numbers. 8 bytes because inside instruction.rs we
      // decode a u64 and little-endian because we decode the slice with
      // u64::from_le_bytes (unpack_amount fn). We use u64 because that's
      // the max supply of a token (as defined in: pub struct Mint { pub supply: u64 }).
      Uint8Array.of(0, ...new BN(expectedAmount).toArray("le", 8))
    ),
  });

  // Finally create a new Transaction and add all these instructions.
  const tx = new Transaction().add(
    createTempTokenAccountIx,
    initTempAccountIx,
    transferXTokensToTempAccIx,
    createEscrowAccountIx,
    initEscrowIx
  );
  // Send Transaction with its signers Accounts, which includes their
  // private keys and can actually sign.
  // NOTE When System Program creates a new account, the tx needs to be
  // signed by that account.
  await connection.sendTransaction(
    tx,
    [initializerAccount, tempTokenAccount, escrowAccount], // signers
    { skipPreflight: false, preflightCommitment: "singleGossip" }
  );

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const encodedEscrowState = (await connection.getAccountInfo(
    escrowAccount.publicKey,
    "singleGossip"
  ))!.data;

  const decodedEscrowState = ESCROW_ACCOUNT_DATA_LAYOUT.decode(
    encodedEscrowState
  ) as EscrowLayout;

  // NOTE The final result after this, is that there's a new
  // Escrow (state) Account that holds relevant data to complete the trade.
  // We also have a new token account (XTokenTempAccountPubkey) that is owned
  // by a PDA of the Escrow Program. This token account's token balance is the
  // amount of X tokens Alice would like to trade in for the expected amount
  // (also saved in the Escrow (state) Account) of Y tokens.
  // NOTE Instructions don't have to all be inside the same transaction.
  // However, some ix must be in same tx because after an account has been
  // created by the System Program, it's just floating on the blockchain,
  // still unitialized, with no user space owner.
  // TODO More things should be added to this frontend for a REAL program.
  // 1. The maximum token amount is U64_MAX which is higher than JS's number value.
  // We need to find a way to handle this, either by limiting the allowed amount
  // of tokens that can be put in, or by accepting the token amount as a string
  // and then using a library like bn.js to convert the string.
  // 2. You should NEVER have your users put in a private key! Use an external
  // wallet like solong or sol-wallet-adapter library. You'd create the transaction,
  // add the instructions, and then ask whatever trusted service you're using to
  // sign the transaction and send it back to you. You can then add the other
  // two keypair accounts and send off the transaction to the network.
  return {
    escrowAccountPubkey: escrowAccount.publicKey.toBase58(),
    isInitialized: !!decodedEscrowState.isInitialized,
    initializerAccountPubkey: new PublicKey(
      decodedEscrowState.initializerPubkey
    ).toBase58(),
    XTokenTempAccountPubkey: new PublicKey(
      decodedEscrowState.initializerTempTokenAccountPubkey
    ).toBase58(),
    initializerYTokenAccount: new PublicKey(
      decodedEscrowState.initializerReceivingTokenAccountPubkey
    ).toBase58(),
    expectedAmount: new BN(
      decodedEscrowState.expectedAmount,
      10,
      "le"
    ).toNumber(),
  };
};
