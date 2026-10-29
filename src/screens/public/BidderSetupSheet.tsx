import { useEffect, useState } from "react";
import { CheckCircle2, Mail, ShieldCheck, UserRoundPlus, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { bidderRegistrationReady, bidderSetupStage, validBidderEmail } from "@/data/bidderOnboarding";
import type { PublicBidderProfile } from "@/data/entities";
import type { AuctionPaymentMode } from "@/data/auctionPayments";

interface BidderSetupSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  bidderToken: string;
  bidderProfile: PublicBidderProfile | null | undefined;
  bidderProfileLoading: boolean;
  paymentMode: AuctionPaymentMode;
  name: string;
  email: string;
  phone: string;
  onNameChange(value: string): void;
  onEmailChange(value: string): void;
  onPhoneChange(value: string): void;
  onRegister(): void;
  registering: boolean;
  onSetupWallet(): void;
  settingUpWallet: boolean;
  onRecover(email: string): Promise<void>;
  recovering: boolean;
  onReady(): void;
}

export default function BidderSetupSheet(props: BidderSetupSheetProps) {
  const [recoveringAccess, setRecoveringAccess] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const stage = bidderSetupStage({
    bidderToken: props.bidderToken,
    profileLoading: props.bidderProfileLoading,
    hasPaymentMethod: props.bidderProfile?.hasPaymentMethod === true,
    paymentMode: props.paymentMode,
  });
  const registrationReady = bidderRegistrationReady({ name: props.name, email: props.email, phone: props.phone });

  useEffect(() => {
    if (props.open) return;
    setRecoveringAccess(false);
    setRecoveryEmail("");
    setRecoverySent(false);
    setRecoveryError("");
  }, [props.open]);

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="bottom" className={`left-1/2 right-auto max-h-[92vh] w-full max-w-lg -translate-x-1/2 rounded-t-3xl border-x px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-7 ${stage === "registration" && !recoveringAccess ? "flex h-[min(72vh,38rem)] flex-col overflow-hidden" : "overflow-y-auto"}`}>
        {stage === "registration" && !recoveringAccess ? (
          <>
            <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-hairline" />
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-muted text-primary"><UserRoundPlus className="size-5" /></span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Takes about 30 seconds</p>
                  <SheetTitle className="mt-1 text-2xl font-bold">Get your bidder number</SheetTitle>
                </div>
              </div>
              <SheetDescription className="pt-2 text-sm leading-6">Enter three details once, then bid on any item in this auction.</SheetDescription>
            </SheetHeader>
            <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); if (registrationReady) props.onRegister(); }}>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-5 pr-1">
                <div className="space-y-1.5"><Label htmlFor="bidder-name">Full name <span className="text-danger-text">*</span></Label><Input id="bidder-name" autoComplete="name" value={props.name} onChange={(event) => props.onNameChange(event.target.value)} placeholder="Jamie Smith" required /></div>
                <div className="space-y-1.5"><Label htmlFor="bidder-phone">Mobile number <span className="text-danger-text">*</span></Label><Input id="bidder-phone" type="tel" inputMode="tel" autoComplete="tel" value={props.phone} onChange={(event) => props.onPhoneChange(event.target.value)} placeholder="(415) 555-0123" required /></div>
                <div className="space-y-1.5"><Label htmlFor="bidder-email">Email <span className="text-danger-text">*</span></Label><Input id="bidder-email" type="email" autoComplete="email" value={props.email} onChange={(event) => props.onEmailChange(event.target.value)} placeholder="jamie@example.com" required /></div>
                <div className="flex items-start gap-3 rounded-xl bg-primary-muted/40 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><span>We’ll email your private link. Payment is added securely only when you’re ready to bid.</span></div>
              </div>
              <div className="shrink-0 space-y-2 border-t border-hairline bg-background pt-3">
                <Button type="submit" size="lg" className="w-full text-base font-bold" disabled={!registrationReady || props.registering}>{props.registering ? "Getting your number…" : "Get my bidder number"}</Button>
                <button type="button" className="w-full text-center text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setRecoveringAccess(true)}>Already registered? Email my private link</button>
              </div>
            </form>
          </>
        ) : stage === "registration" ? (
          <>
            <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-hairline" />
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary-muted text-primary"><Mail className="size-5" /></span><SheetTitle className="text-2xl font-bold">Open your private paddle</SheetTitle></div>
              <SheetDescription className="pt-2 text-sm leading-6">Enter the email you used before. For privacy, we’ll always show the same confirmation.</SheetDescription>
            </SheetHeader>
            {recoverySent ? (
              <div className="mt-7 rounded-2xl bg-success-tint p-5 text-center text-success-text"><CheckCircle2 className="mx-auto size-8" /><p className="mt-3 font-bold">Check your email</p><p className="mt-1 text-sm leading-6">If that email is registered, your private bidder link is on its way.</p></div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); setRecoveryError(""); void props.onRecover(recoveryEmail).then(() => setRecoverySent(true)).catch(() => setRecoveryError("We couldn’t send the link. Check your connection and try again.")); }}>
                <div className="space-y-1.5"><Label htmlFor="bidder-recovery-email">Email</Label><Input id="bidder-recovery-email" type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => { setRecoveryEmail(event.target.value); setRecoveryError(""); }} placeholder="jamie@example.com" required /></div>
                {recoveryError ? <p role="alert" className="rounded-lg bg-danger-tint p-3 text-sm text-danger-text">{recoveryError}</p> : null}
                <Button type="submit" size="lg" className="w-full" disabled={!validBidderEmail(recoveryEmail) || props.recovering}>{props.recovering ? "Sending…" : "Email my private link"}</Button>
              </form>
            )}
            <button type="button" className="mt-4 w-full text-center text-sm font-semibold text-primary underline-offset-4 hover:underline" onClick={() => { setRecoveringAccess(false); setRecoverySent(false); setRecoveryError(""); }}>I need a new bidder number</button>
          </>
        ) : stage === "loading" ? (
          <div className="space-y-4 py-8"><Skeleton className="mx-auto size-12 rounded-full" /><Skeleton className="mx-auto h-7 w-52" /><Skeleton className="mx-auto h-4 w-64" /></div>
        ) : stage === "wallet" ? (
          <>
            <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-hairline" />
            <SheetHeader className="text-left">
              <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary-muted text-primary"><WalletCards className="size-5" /></span><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-success-text">Paddle {props.bidderProfile?.paddleNumber ?? "assigned"}</p><SheetTitle className="mt-1 text-2xl font-bold">Secure your bids</SheetTitle></div></div>
              <SheetDescription className="pt-2 text-sm leading-6">Add a card or wallet once. You will not be charged unless you win or choose to give.</SheetDescription>
            </SheetHeader>
            <Button type="button" size="lg" className="mt-7 w-full text-base font-bold" disabled={props.settingUpWallet} onClick={props.onSetupWallet}>{props.settingUpWallet ? "Opening secure setup…" : "Add card or wallet"}</Button>
            <button type="button" className="mt-4 w-full text-center text-sm font-semibold text-muted-foreground" onClick={() => props.onOpenChange(false)}>Browse for now</button>
          </>
        ) : stage === "unavailable" ? (
          <div className="py-6 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-warning-tint text-warning-text"><WalletCards className="size-7" /></span><SheetTitle className="mt-4 text-2xl font-bold">Bidding setup is not ready</SheetTitle><SheetDescription className="mx-auto mt-2 max-w-sm leading-6">The organizer is still connecting auction payments. You can keep browsing and try again later.</SheetDescription><Button type="button" variant="outline" size="lg" className="mt-7 w-full" onClick={() => props.onOpenChange(false)}>Keep browsing</Button></div>
        ) : (
          <div className="py-6 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-success-tint text-success-text"><CheckCircle2 className="size-7" /></span><SheetTitle className="mt-4 text-2xl font-bold">You’re ready to bid</SheetTitle><SheetDescription className="mx-auto mt-2 max-w-sm leading-6">{props.paymentMode === "pay_later" ? "Your paddle is ready. The organizer will collect payment after the auction." : "Your bidder paddle and secure payment are connected."}</SheetDescription><Button type="button" size="lg" className="mt-7 w-full text-base font-bold" onClick={props.onReady}>Return to the item</Button></div>
        )}
      </SheetContent>
    </Sheet>
  );
}
