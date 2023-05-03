import { useEffect, useReducer, useState } from 'react'
import './App.css'
import { FontAwesomeIcon, FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import { faCloudArrowDown, faFolderOpen, faPause, faPlay, faRotate, faUpRightFromSquare, faXmark, faTrashCan } from '@fortawesome/free-solid-svg-icons';

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

function IconButton({ icon, onClick, ...rest }: FontAwesomeIconProps & { onClick?: () => void }) {
  return <button onClick={onClick}>
    <FontAwesomeIcon icon={icon} fixedWidth {...rest} />
  </button>;
}

const actions = {
  in_progress(item: DownloadItem) {
    return <>
      {item.paused ? <IconButton
        icon={faPlay}
        onClick={() => {
          download_api.resume(item.id);
        }}
      /> : <IconButton
        icon={faPause}
        onClick={() => {
        download_api.pause(item.id);
      }}
      />}
      <IconButton icon={faXmark} onClick={() => {
        download_api.cancel(item.id);
      }}/>
    </>;
  },
  interrupted(item: DownloadItem) {
    return item.canResume ? <IconButton
      icon={faPlay}
      onClick={() => {
      download_api.resume(item.id);
      }}
    /> : <IconButton
      icon={faRotate}
      onClick={() => {
      retry(item);
      }}
    />;
  },
  complete(item: DownloadItem, render: () => void) {
    return item.exists ? <>
      <IconButton
        icon={faFolderOpen}
        onClick={() => {
        download_api.show(item.id);
        }}
      />
      <IconButton
        icon={faTrashCan}
        onClick={() => {
        download_api.removeFile(item.id);
        render();
        }}
      />
    </> : <IconButton
      icon={faCloudArrowDown}
      onClick={() => {
      retry(item);
      }}
    />;
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
      <IconButton
        icon={faUpRightFromSquare}
        onClick={() => {
        chrome.tabs.create({
          url: 'chrome://downloads/',
        });
        }}
      />
    </div>
    <ul>
      {Array.from(items.values(), (item) => <li key={item.id}>
        <Item item={item} />
      </li>)}
    </ul>
  </div>
}

export default App
