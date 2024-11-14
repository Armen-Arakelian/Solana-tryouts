import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Commitment, Connection, Message, PublicKey, Transaction } from "@solana/web3.js";
import { DomainTest } from "../target/types/domain_test";
import nacl from "tweetnacl";

describe("domain-test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;

  console.log("payer: ", payer);

  const domainTest = anchor.workspace.DomainTest as Program<DomainTest>;

  it("Is initialized!", async () => {
    const [programInfoSingletonPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_info")],
      domainTest.programId,
    )

    const slot = await domainTest.provider.connection.getSlot();
    const blockTime = await domainTest.provider.connection.getBlockTime(slot);

    await domainTest.methods
    .initialize()
    .accounts({
      programInfo: programInfoSingletonPDA,
      payer: payer.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

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
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const firstDomainData = await domainTest.account.domain.fetch(domainPDA);
    console.log("first domain data: ", firstDomainData);


    //events
    const events = await getPastCPIEvents(domainTest, "DomainCreated");

    console.log("events=============================================", events);
    events.forEach((event) => {
    if (event.name === "DomainCreated") {
      // Access event data
      console.log(event.data);
      // Add your assertions here
      // expect(event.data.someField).to.equal(expectedValue);
    }
  });
  });
});


async function getPastCPIEvents(
  program: Program<DomainTest>,
  eventName: string,
  fromSignature?: string
) {
  const connection = new Connection(
    program.provider.connection.rpcEndpoint,
    'confirmed' as Commitment
  );
  const programId = program.programId;

  const signatures = await connection.getSignaturesForAddress(
    programId,
    { until: fromSignature },
    'confirmed'
  );

  console.log(`Found ${signatures.length} signatures for program ${programId.toBase58()}`);

  const events = [];

  for (const { signature } of signatures) {
    console.log(`Processing signature: ${signature}`);
    const tx = await connection.getParsedTransaction(signature, 'confirmed');

    if (!tx?.meta?.innerInstructions) {
      console.log(`No inner instructions found for signature: ${signature}`);
      continue;
    }

    for (const innerInstructionSet of tx.meta.innerInstructions) {
      for (const innerIx of innerInstructionSet.instructions) {
        if (
          'programId' in innerIx &&
          new PublicKey(innerIx.programId).equals(programId)
        ) {
          console.log(`Found matching program ID: ${innerIx.programId}`);
          if ('data' in innerIx && innerIx.data) {
            try {
              console.log(`Attempting to decode data: ${innerIx.data}`);
              const event = program.coder.events.decode(innerIx.data);
              console.log(`Decoded event:`, event);
              if (event && (!eventName || event.name === eventName)) {
                events.push({
                  ...event.data,
                  name: event.name,
                  signature,
                  slot: tx.slot,
                });
              }
            } catch (e) {
              console.error(`Error decoding event for signature ${signature}:`, e);
            }
          } else {
            console.log(`No data found in instruction`);
          }
        }
      }
    }
  }

  return events;
}