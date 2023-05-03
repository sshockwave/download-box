const download_api = chrome.downloads;

download_api.setShelfEnabled(false);
download_api.onCreated.addListener((_item) => {
  // update ui
});
