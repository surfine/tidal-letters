import { render } from "preact";
import { connect, onLanguage, onLifecycle, onMenuCommand } from "./bridge/bridge.ts";
import { Reader } from "./reader/reader.ts";
import { App } from "./ui/App.tsx";
import "./styles/base.css";
import "./styles/aaron-blog.css";

// 潮汐信笺's page: connect to the host, read the saved selection, draw the
// reader, then hand the page over. The window the desk draws the frame for is
// this page's only window.
async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  const client = await connect();
  const reader = new Reader(client);
  reader.setLanguage(client.welcome.language);
  await reader.start();

  onMenuCommand(client, (action) => reader.runMenuCommand(action));
  onLifecycle(client, {
    suspend: (cause) => reader.suspend(cause),
    resume: () => reader.resume(),
    dispose: () => reader.dispose(),
  });
  client.handle("intent.deliver", (params) => reader.handleIntent(params));
  onLanguage(client, (language) => reader.setLanguage(language));

  render(<App reader={reader} />, root);
  reader.attachToHost();
  client.ready();
  // The welcome link (a post, a block, SideAsk) is read once; else a plain open.
  await reader.openFromLaunch();
}

void main();
