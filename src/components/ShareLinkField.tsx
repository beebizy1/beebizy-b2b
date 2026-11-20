import { useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ShareLinkField({ value, label, copyLabel = "Copy link" }: { value: string; label: string; copyLabel?: string }) {
  const id = useId(); const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(""); const [error, setError] = useState(false);
  async function copy() {
    setError(false);
    try { await navigator.clipboard.writeText(value); setCopied(value); }
    catch { input.current?.focus(); input.current?.select(); setError(true); }
  }
  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-semibold">{label}</label>
    <div className="flex flex-wrap gap-2"><Input ref={input} id={id} readOnly value={value} onFocus={e => e.target.select()} className="min-w-0 flex-1 basis-52" /><Button type="button" variant="outline" onClick={() => void copy()}>{copied === value ? <Check className="size-4" /> : <Copy className="size-4" />}{copyLabel}</Button></div>
    <p role="status" className="text-xs text-muted-foreground">{error ? "The link is selected. Copy it from the box above." : copied === value ? "Link copied. You can paste it into a text or email." : ""}</p>
  </div>;
}
