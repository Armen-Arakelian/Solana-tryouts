import {PublicKey} from "@solana/web3.js";
import {BN, Program} from "@coral-xyz/anchor";
import type {TransactionResponse} from "@solana/web3.js";
import {base64, bs58} from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {EventCoder} from "@coral-xyz/anchor/dist/cjs/coder";

export function parseCpiEvents(
    transactionResponse: TransactionResponse,
    program: Program<any>,
): { name: string; data: any }[] {
    const events: any[] = [];
    const inner: any[] =
        transactionResponse?.meta?.innerInstructions ?? [];
    const idlProgramId = program.programId;
    for (let i = 0; i < inner.length; i++) {
        for (let j = 0; j < inner[i].instructions.length; j++) {
            const ix = inner[i].instructions[j];
            const programPubkey =
                transactionResponse?.transaction.message.staticAccountKeys[
                    ix.programIdIndex
                    ];
            if (
                programPubkey === undefined ||
                !programPubkey.equals(idlProgramId)
            ) {
                // we are at instructions that does not match the linked program
                continue;
            }
            const event = decode(program, ix.data);
            if (event) {
                events.push(event);
            }
        }
    }
    return events;
}
const eventIxTag: BN = new BN("1d9acb512ea545e4", "hex");

function parseAsTransactionCpiData(log: string): string | null {
    let encodedLog: Buffer;
    try {
        // verification if log is transaction cpi data encoded with base58
        encodedLog = bs58.decode(log);
    } catch (e) {
        return null;
    }
    const disc = encodedLog.slice(0, 8);
    if (disc.equals(eventIxTag.toBuffer("le"))) {
        console.log('disc.equals(eventIxTag.toBuffer("le"))')
        // after CPI tag data follows in format of standard event
        return base64.encode(encodedLog.slice(8));
    } else {
        return null;
    }
}

function decode(
    program: Program<any>,
    log: string
): {
    name: string;
    data: any;
} | null {
    const transactionCpiData = parseAsTransactionCpiData(log);
    if (transactionCpiData !== null) {
        // log parsed to be CPI data, recursive call stripped event data
        return decode(program, transactionCpiData);
    }

    let logArr: Buffer;
    // This will throw if log length is not a multiple of 4.
    try {
        logArr = base64.decode(log);
    } catch (e) {
        return null;
    }

    // Only deserialize if the discriminator implies a proper event.
    const disc = base64.encode(logArr.slice(0, 8));

    // incorrect types on anchor lib
    // @ts-ignore
    const eventName = program.coder.events.discriminators.get(disc);
    if (!eventName) {
        return null;
    }

    // incorrect types on anchor lib
    // @ts-ignore
    const layout = program.coder.events.layouts.get(eventName);
    if (!layout) {
        throw new Error(`Unknown event: ${eventName}`);
    }
    const data = layout.decode(logArr.slice(8));
    return { data, name: eventName };
}
