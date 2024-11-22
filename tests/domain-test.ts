import * as anchor from "@coral-xyz/anchor";
import {BN, BorshEventCoder, Program} from "@coral-xyz/anchor";
import { Commitment, Connection, Message, PublicKey, Transaction } from "@solana/web3.js";
import { DomainTest } from "../target/types/domain_test";
import nacl from "tweetnacl";
import * as fs from "fs";
import { assert } from "chai";
import {program} from "@coral-xyz/anchor/dist/cjs/native/system";
import {base64, bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {parseCpiEvents} from "../utils/decoder";

let coder: any;

describe("domain-test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;

  console.log("payer: ", payer);

  const domainTest = anchor.workspace.DomainTest as Program<DomainTest>;

  it("Initialize", async () => {
    console.log("program id: ", domainTest.programId.toBase58());
    const [programInfoSingletonPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_info")],
      domainTest.programId,
    )

    await domainTest.methods
    .initialize()
    .accounts({
      programInfo: programInfoSingletonPDA,
      payer: payer.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

    const programInfoData = await domainTest.account.programInfo.fetch(programInfoSingletonPDA);

    assert.isTrue(programInfoData.initialized);
    assert.equal(programInfoData.id.toString(), "0");
  });

  it("general stuff", async () => {
    const [programInfoSingletonPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_info")],
      domainTest.programId,
    )

    const slot = await domainTest.provider.connection.getSlot();
    // const blockTime = await domainTest.provider.connection.getBlockTime(slot);

    // await domainTest.methods
    // .initialize()
    // .accounts({
    //   programInfo: programInfoSingletonPDA,
    //   payer: payer.publicKey,
    //   systemProgram: anchor.web3.SystemProgram.programId,
    // })
    // .rpc();

    const programInfoData = await domainTest.account.programInfo.fetch(programInfoSingletonPDA);
    console.log("program info data: ", programInfoData);

    const [domainPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(new Uint8Array(new anchor.BN(0).toArray("le", 8)))],
      domainTest.programId,
    )

    console.log("domain pda: ", domainPDA);

    const tx = await domainTest.methods
    .createDomain(1, "first-domain")
    .accounts({
      programInfo: programInfoSingletonPDA,
      domain: domainPDA,
      payer: payer.publicKey,
      owner: payer.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .transaction()

    let latestBlockhash = await provider.connection.getLatestBlockhash(
      "confirmed"
    );

    tx.recentBlockhash = latestBlockhash.blockhash;
    tx.feePayer = payer.publicKey;
    const serializedTx = tx.serializeMessage();
    console.log("serialized tx: ", serializedTx);

    let signature = nacl.sign.detached(serializedTx, payer.payer.secretKey);


    let recoverTx = Transaction.populate(Message.from(serializedTx));
    recoverTx.addSignature(payer.publicKey, Buffer.from(signature));

    const txHash = await provider.connection.sendRawTransaction(recoverTx.serialize());
    await provider.connection.confirmTransaction(txHash);

    // Add a delay to allow time for the transaction to be processed
    // await new Promise(resolve => setTimeout(resolve, 5000));

    const firstDomainData = await domainTest.account.domain.fetch(domainPDA);
    console.log("first domain data: ", firstDomainData);

    await provider.connection.confirmTransaction(txHash, "confirmed");
    const fullTx = await provider.connection.getTransaction(txHash, {
        commitment: "confirmed",
        });
    //events
    const events = await parseCpiEvents(
        fullTx,
        domainTest,
    );

    console.log("events=============================================", events);
    events.forEach((event) => {
    if (event.name === "domainCreated") {
      // Access event data
      console.log(event.data);
      // Add your assertions here
      // expect(event.data.someField).to.equal(expectedValue);
    }
  });
  });
});
