import { useEffect, useReducer, useState, useRef } from 'react'
import { FontAwesomeIcon, FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import { faCloudArrowDown, faFolderOpen, faPause, faPlay, faRotate, faUpRightFromSquare, faXmark, faTrashCan, faSearch } from '@fortawesome/free-solid-svg-icons';

type DownloadItem = chrome.downloads.DownloadItem;
type DownloadDelta = chrome.downloads.DownloadDelta;
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
    return <>
      {item.canResume ? <IconButton
      icon={faPlay}
      onClick={() => {
      download_api.resume(item.id);
      }}
    /> : <IconButton
      icon={faRotate}
      onClick={() => {
      retry(item);
      }}
      />}
      <IconButton
        icon={faXmark}
        onClick={() => {
          download_api.erase({
            id: item.id,
          });
        }}
      />
    </>;
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
    </> : <>
      <IconButton
      icon={faCloudArrowDown}
      onClick={() => {
      retry(item);
      }}
      />
      <IconButton
        icon={faXmark}
        onClick={() => {
          download_api.erase({
            id: item.id,
          });
        }}
      />
    </>;
  },
};

const placeholder_gif = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
function Item({ item: _item, onChange }: { item: DownloadItem, onChange: (cb: (delta: DownloadDelta) => void) => void }) {
  const [item, setItem] = useState(_item);
  onChange((delta) => {
    setItem({
      ...item,
      ...Object.fromEntries(
        Object.entries(delta)
          .filter(([k]) => k !== 'id')
          .map(([k, { current }]) => [k, current])
      ),
    });
  });
  const render = useRender();
  const [icon, setIcon] = useState(placeholder_gif);
  useEffect(() => {
    download_api.getFileIcon(item.id, {
      size: 32,
    }).then((icon) => {
      setIcon(icon);
    });
  }, []);
  useEffect(() => {
    add_tick(item);
    function add_tick(item: DownloadItem) {
      if (item.state === 'in_progress' && !item.paused) {
        setTimeout(update, 100);
      }
    }
    async function update() {
      const items = await download_api.search({
        id: item.id,
      });
      setItem(items[0]);
      add_tick(items[0]);
    }
  }, [item.state, item.paused]);
  const available = item.state === 'complete' && item.exists;
  const errored = item.state === 'interrupted' || item.state === 'complete' && !item.exists;
  const basename = item.filename.split('/').pop();
  const maskImage = 'linear-gradient(to right, #000 80%, transparent 98%)';
  return <div className={`
    flex flex-row flex-nowrap hover:bg-slate-100 p-2
    ${errored ? 'text-black/50' : ''}
    ${available ? 'cursor-pointer' : ''}
  `} onClick={() => {
    if (available) {
      download_api.open(item.id);
    }
  }}>
    <img src={icon} className={`w-6 h-6 mr-2 ${errored ? 'grayscale opacity-50' : ''}`} />
    <div className='grow relative overflow-x-hidden mr-2'>
      <div className='relative' style={{
        maskImage, WebkitMaskImage: maskImage,
        whiteSpace: 'nowrap',
      }}>
        <span className={available ? 'text-blue-500' : ''}>
          {errored ? <del>{basename}</del> : basename}
        </span>
      </div>
      {item.state === 'in_progress'
        ? <progress
          className='h-1 w-full'
          value={item.bytesReceived}
          max={item.totalBytes}
        />
        : <div className='h-1' />
      }
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
      onClick={() => download_api.acceptDanger(item.id)}
    >
      accept danger
    </button> : actions[item.state](item, render)}
  </div>;
}

function App() {
  const items = useRef<DownloadItem[]>([]);
  const handleChange = useRef<Map<number, (delta: DownloadDelta) => void>>();
  if (handleChange.current === undefined) {
    handleChange.current = new Map;
  }
  const render = useRender();
  function setItems(new_items: DownloadItem[]) {
    items.current = new_items.filter((item) => item.filename !== '');
    render();
  }
  useEffect(() => {
    download_api.search({
    }).then((items) => {
      setItems(items);
    });
    download_api.onCreated.addListener((item) => {
      if (items.current.map((item) => item.id).includes(item.id)) {
        return;
      }
      setItems([item, ...items.current]);
    });
    download_api.onChanged.addListener((delta) => {
      handleChange.current!.get(delta.id)?.(delta);
    });
    download_api.onErased.addListener((id) => {
      setItems(items.current.filter((item) => item.id !== id));
    });
  }, []);
  return <div className='w-72 font-sans'>
    <div className='flex flex-row flex-nowrap p-2'>
      <div className='mr-2'>
        <FontAwesomeIcon icon={faSearch} className='w-6' />
      </div>
      <input
        type='search'
        placeholder='search'
        className='grow mr-2 outline-none'
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
        onClick={() => chrome.tabs.create({
          url: 'chrome://downloads/',
        })}
      />
    </div>
    <ul className='list-none'>
      {Array.from(items.current.values(), (item) => <li key={item.id}>
        <Item item={item} onChange={(cb) => {
          handleChange.current!.set(item.id, cb);
        }}/>
      </li>)}
    </ul>
  </div>
}

export default App
