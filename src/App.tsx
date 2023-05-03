import { useEffect, useReducer, useState } from 'react'
import { FontAwesomeIcon, FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import { faCloudArrowDown, faFolderOpen, faPause, faPlay, faRotate, faUpRightFromSquare, faXmark, faTrashCan, faSearch } from '@fortawesome/free-solid-svg-icons';

type DownloadItem = chrome.downloads.DownloadItem;
const download_api = chrome.downloads;

function useRender() {
  return useReducer((x) => x + 1, 0)[1];
}

function humanSize(bytes: number) {
  const step = 1024;
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  for (; bytes >= step; i++) {
    bytes /= step;
  }
  return `${i === 0 ? bytes : bytes.toFixed(2)} ${units[i]}`;
}

function retry(item: DownloadItem) {
  download_api.download({
    url: item.url,
    filename: item.filename,
  });
}

function IconButton({ icon, onClick, buttonClass, ...rest }: FontAwesomeIconProps & { onClick?: () => void, buttonClass?: string }) {
  return <button onClick={onClick} className={buttonClass}>
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

const placeholder_gif = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
function Item({ item }: { item: DownloadItem }) {
  const render = useRender();
  const [icon, setIcon] = useState(placeholder_gif);
  useEffect(() => {
    chrome.downloads.getFileIcon(item.id, {
      size: 32,
    }).then((icon) => {
      setIcon(icon);
    });
  }, []);
  return <div className='flex flex-row flex-nowrap hover:bg-slate-100 p-2'>
    <img src={icon} className='w-6 h-6 mr-2' />
    <div className='grow'>
      {item.filename.split('/').pop()}
    {item.state === 'in_progress' && <progress value={item.bytesReceived} max={item.totalBytes} />}
      <div className='flex flex-row flex-nowrap'>
        {item.state === 'in_progress' && !item.paused && <div className='mr-1'>
          {/*speed*/}
        </div>}
        <div className='ml-auto'>
          {humanSize(item.fileSize)}
        </div>
      </div>
    </div>
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
    download_api.onErased.addListener((id) => {
      setItems(items.filter((item) => item.id !== id));
    });
  }, []);
  return <div className='w-72 font-sans'>
    <div className='flex flex-row flex-nowrap p-2'>
      <div className='mr-2'>
        <FontAwesomeIcon icon={faSearch}/>
      </div>
      <input
        type='search'
        placeholder='search'
        className='grow mr-2'
        onChange={(e) => {
          const query = e.target.value === '' ? {} : {
            query: [e.target.value],
          };
          download_api.search(query).then(setItems);
        }}
      />
      <IconButton
        buttonClass='ml-auto'
        icon={faUpRightFromSquare}
        onClick={() => {
        chrome.tabs.create({
          url: 'chrome://downloads/',
        });
        }}
      />
    </div>
    <ul className='list-none'>
      {Array.from(items.values(), (item) => <li key={item.id}>
        <Item item={item} />
      </li>)}
    </ul>
  </div>
}

export default App
