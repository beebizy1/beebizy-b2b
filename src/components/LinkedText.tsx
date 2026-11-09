import { Fragment } from "react";
import { textLinks } from "@/lib/textLinks";

export function LinkedText({ text }: { text: string }) {
  return <>{textLinks(text).map((part, index) => part.href
    ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="underline decoration-current underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80">{part.text}</a>
    : <Fragment key={index}>{part.text}</Fragment>)}</>;
}
