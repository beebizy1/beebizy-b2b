import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/*
 * Recover from a chunk that can no longer be fetched.
 *
 * Asset filenames are content-hashed, so a tab holding an older `index.html` asks for a
 * bundle that the current deployment does not contain, and gets a 404. Nothing is thrown
 * into the page and nothing is logged: the import simply never resolves, React never
 * mounts, and the visitor sits in front of a blank screen that reloading may not clear.
 *
 * One reload against the live `index.html` picks up the current filenames. The flag keeps
 * that to a single attempt, so a genuinely missing asset fails visibly rather than
 * refreshing forever.
 */
const RELOAD_FLAG = "beebizy:chunk-reload";

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (sessionStorage.getItem(RELOAD_FLAG)) return;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  window.location.reload();
});

window.addEventListener("load", () => sessionStorage.removeItem(RELOAD_FLAG));

createRoot(document.getElementById("root")!).render(<App />);
