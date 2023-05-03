import { useEffect, useReducer, useState } from 'react'
import './App.css'

type DownloadItem = chrome.downloads.DownloadItem;
const download_api = chrome.downloads;

function useRender() {
  return useReducer((x) => x + 1, 0)[1];
}

function retry(item: DownloadItem) {
  download_api.download({
    url: item.url,
    filename: item.filename,
  });
}

const actions = {
  in_progress(item: DownloadItem) {
    return <>
      {item.paused ? <button onClick={() => {
        download_api.resume(item.id);
      }}>
        continue
      </button> : <button onClick={() => {
        download_api.pause(item.id);
      }}>
        pause
      </button>}
      <button onClick={() => {
        download_api.cancel(item.id);
      }}>
        cancel
      </button>
    </>;
  },
  interrupted(item: DownloadItem) {
    return item.canResume ? <button onClick={() => {
      download_api.resume(item.id);
    }}>
      resume
    </button> : <button onClick={() => {
      retry(item);
    }}>
      retry
    </button>;
  },
  complete(item: DownloadItem, render: () => void) {
    return item.exists ? <>
      <button onClick={() => {
        download_api.show(item.id);
      }}>
        open folder
      </button>
      <button onClick={() => {
        download_api.removeFile(item.id);
        render();
      }}>
        delete file
      </button>
    </> : <button onClick={() => {
      retry(item);
    }}>
      re-download
    </button>;
  },
};

function Item({ item }: { item: DownloadItem }) {
  const render = useRender();
  return <div>
    {item.filename}
    {item.state === 'in_progress' && <progress value={item.bytesReceived} max={item.totalBytes} />}
    {item.danger !== 'safe' && item.danger !== 'accepted' ? <button
      onClick={() => {
        download_api.acceptDanger(item.id);
      }}
    >
      accept danger
    </button> : actions[item.state](item, render)}
  </div>;
}

function App() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const render = useRender();
  useEffect(() => {
    download_api.search({
      limit: 10,
    }).then((items) => {
      setItems(items);
    });
    download_api.onChanged.addListener((delta) => {
      for (const [i, item] of items.entries()) {
        if (delta.id === item.id) {
          items[i] = {
            ...item,
            ...Object.fromEntries(
              Object.entries(delta)
                .filter(([k]) => k !== 'id')
                .map(([k, { current }]) => [k, current])
            ),
          };
          render();
        }
      }
    });
  }, []);
  return <div>
    <div>
      <div>
        Download
      </div>
      <button onClick={() => {
        chrome.tabs.create({
          url: 'chrome://downloads/',
        });
      }}>
        open download page
      </button>
    </div>
    <ul>
      {Array.from(items.values(), (item) => <li key={item.id}>
        <Item item={item} />
      </li>)}
    </ul>
  </div>
}

export default App
