// 潮汐信笺's page: start the runtime, draw the reader's window, hand over.
(async function startTidalReader() {
  "use strict";
  await window.TidalRuntime.start({ appId: "aaronBlog", window: "aaronBlog" });
  translateWithin(document);
  const reader = window.TidalReader;
  window.TidalRuntime.lifecycle(reader.lifecycle());
  window.TidalRuntime.menu(reader.menu);
  window.TidalRuntime.intents(reader.handleIntent);
  window.TidalRuntime.onLanguage(() => reader.renderLanguage());
  reader.attach();
  window.TidalRuntime.snapshots(document.getElementById("app"));
  window.TidalRuntime.ready();
  // The welcome link (a post, a block, SideAsk) is read once; else a plain open.
  await reader.openFromLaunch();
})();
