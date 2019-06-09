import * as fs from "fs";
import * as electron from "electron";

import fetch from "../../shared/fetch";
import * as i18n from "../../shared/i18n";

import { tabStrip, panesElt, clearActiveTab } from "./index";

const { ValjangEngine: { appApiVersion: appApiVersion } } = JSON.parse(fs.readFileSync(`${__dirname}/../../package.json`, { encoding: "utf8" }));

export default function openServer(serverEntry: ServerEntry) {
  clearActiveTab();

  let tabElt = tabStrip.tabsRoot.querySelector(`li[data-server-id="${serverEntry.id}"]`) as HTMLLIElement;
  let paneElt = panesElt.querySelector(`div[data-server-id="${serverEntry.id}"]`) as HTMLDivElement;

  if (tabElt == null) {
    tabElt = makeServerTab(serverEntry);
    tabStrip.tabsRoot.appendChild(tabElt);

    paneElt = makeServerPane(serverEntry);
    panesElt.appendChild(paneElt);
  }

  tabElt.classList.add("active");
  paneElt.hidden = false;
}

function makeServerTab(serverEntry: ServerEntry) {
  const tabElt = document.createElement("li");
  tabElt.dataset["serverId"] = serverEntry.id;

  const iconElt = document.createElement("img");
  iconElt.className = "icon";
  iconElt.src = "images/tabs/server.svg";
  tabElt.appendChild(iconElt);

  const labelElt = document.createElement("div");
  labelElt.className = "label";
  tabElt.appendChild(labelElt);

  const locationElt = document.createElement("div");
  locationElt.className = "location";
  locationElt.textContent = serverEntry.hostname + (serverEntry.port != null ? `:${serverEntry.port}` : "");
  labelElt.appendChild(locationElt);

  const nameElt = document.createElement("div");
  nameElt.className = "name";
  nameElt.textContent = serverEntry.label;
  labelElt.appendChild(nameElt);

  const closeButton = document.createElement("button");
  closeButton.className = "close";
  tabElt.appendChild(closeButton);

  return tabElt;
}

function makeServerPane(serverEntry: ServerEntry) {
  const paneElt = document.createElement("div");
  paneElt.dataset["serverId"] = serverEntry.id;

  const connectingElt = document.createElement("div");
  connectingElt.className = "connecting";
  paneElt.appendChild(connectingElt);

  const statusElt = document.createElement("div");
  connectingElt.appendChild(statusElt);

  const retryButton = document.createElement("button");
  retryButton.textContent = i18n.t("common:server.tryAgain");
  connectingElt.appendChild(retryButton);

  function onRetryButtonClick(event: MouseEvent) {
    event.preventDefault();
    tryConnecting();
  }
  retryButton.addEventListener("click", onRetryButtonClick);

  // Automatically add insecure protocol if none is already provided in the hostname
  const protocol = serverEntry.hostname.startsWith("http") ? "" : "http://";
  const host = protocol + serverEntry.hostname + (serverEntry.port != null ? `:${serverEntry.port}` : "");

  function tryConnecting() {
    statusElt.textContent = i18n.t("common:server.connecting", { host });
    retryButton.hidden = true;

    let httpAuth = null;

    if (serverEntry.httpUsername.length > 0 || serverEntry.httpPassword.length > 0) {
      httpAuth = { username: serverEntry.httpUsername, password: serverEntry.httpPassword };
    }

    fetch(`${host}/ValjangEngine.json`, { type: "json", httpAuth }, onFetchJSON);
  }

  function onFetchJSON(err: Error, serverInfo: { version: string; appApiVersion: number; }) {
    if (err != null) {
      statusElt.textContent = i18n.t("common:server.errors.ValjangEngineJSON", { host });
      retryButton.hidden = false;
      return;
    }

    if (serverInfo == null || typeof serverInfo !== "object") {
      statusElt.textContent = i18n.t("common:server.errors.notValjangEngine", { host });
      retryButton.hidden = false;
      return;
    }

    if (serverInfo.appApiVersion !== appApiVersion) {
      statusElt.textContent = i18n.t("common:server.errors.incompatibleVersion", { host, serverVersion: serverInfo.appApiVersion, appVersion: appApiVersion });
      retryButton.hidden = false;
      return;
    }

    const webviewElt = document.createElement("webview");
    webviewElt.preload = `${__dirname}/../../SupApp/index.js`;

    function clearEventListeners() {
      webviewElt.removeEventListener("did-finish-load", onLoad);
      webviewElt.removeEventListener("did-fail-load", onError);
    }

    function onLoad() {
      clearEventListeners();
      paneElt.removeChild(connectingElt);
    }

    function onError() {
      clearEventListeners();
      paneElt.removeChild(webviewElt);
      statusElt.textContent = "Failed to load iframe";
    }

    webviewElt.addEventListener("did-finish-load", onLoad);
    webviewElt.addEventListener("did-fail-load", onError);

    webviewElt.src = host;
    paneElt.appendChild(webviewElt);
    webviewElt.focus();

    function setupHttpAuth() {
      // This won't return a valid value until the <webview> has been initialized
      // so if it fails, we wait a bit and try again
      const webContents = webviewElt.getWebContents();

      if (webContents == null) {
        setTimeout(setupHttpAuth, 100);
        return;
      }

      electron.ipcRenderer.send("set-web-contents-http-auth", webContents.id, {
        username: serverEntry.httpUsername,
        password: serverEntry.httpPassword
      });
    }

    setTimeout(setupHttpAuth, 0);
  }

  tryConnecting();
  return paneElt;
}
