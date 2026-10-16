import { sql } from "drizzle-orm";
import { db } from "./db.ts";
import { HttpError } from "./auth.ts";
import { databaseErrorMessage } from "./errorMessage.ts";

export interface AuctionBidderAllocationInput {
  workspaceId: string;
  eventId: string;
  name: string;
  email: string;
  phone: string | null;
  householdId: string | null;
  attendeeId: string | null;
  paymentMethodId: string | null;
  stripeCustomerId: string | null;
  autoChargeOptIn: boolean;
  checkedInAt: Date | null;
  participantType: "gala" | "remote";
  publicToken: string;
  updateExisting: boolean;
}

/** Allocates paddle numbers under an event-scoped advisory lock in PostgreSQL. */
export async function allocateAuctionBidder(input: AuctionBidderAllocationInput): Promise<{ id: string; paddleNumber: number; publicToken: string }> {
  try {
    const result = await db.execute<{ id: string; paddle_number: number; public_token: string }>(sql`
      select * from allocate_auction_bidder(
        ${input.workspaceId}, ${input.eventId}, ${input.name}, ${input.email}, ${input.phone},
        ${input.householdId}, ${input.attendeeId}, ${input.paymentMethodId}, ${input.stripeCustomerId},
        ${input.autoChargeOptIn}, ${input.checkedInAt}, ${input.participantType}, ${input.publicToken}, ${input.updateExisting}
      )
    `);
    const row = result.rows[0];
    if (!row) throw new Error("The bidder allocation returned no row.");
    return { id: row.id, paddleNumber: Number(row.paddle_number), publicToken: row.public_token };
  } catch (error) {
    if (/already registered/i.test(databaseErrorMessage(error))) {
      throw new HttpError(409, "This email is already registered. Use the private access link in the original email or ask the organizer for help.");
    }
    throw error;
  }
}
