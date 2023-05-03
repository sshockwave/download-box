import { useEffect, useReducer, useState, useRef } from 'react'
import { FontAwesomeIcon, FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faPause, faPlay, faLink, faUpRightFromSquare, faXmark, faTrashCan, faSearch } from '@fortawesome/free-solid-svg-icons';

type DownloadItem = chrome.downloads.DownloadItem;
type DownloadDelta = chrome.downloads.DownloadDelta;
const download_api = chrome.downloads;

function useRender() {
  return useReducer((x) => x + 1, 0)[1];
}

function humanSize(bytes: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  for (; bytes >= 1000; i++) {
    bytes /= 1024;
  }
  return `${i === 0 ? bytes : bytes.toFixed(2)}${units[i]}`;
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
    /> : <a href={item.url} target='_blank'>
      <FontAwesomeIcon icon={faLink} />
    </a>}
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
      <a href={item.url} target='_blank'>
        <FontAwesomeIcon icon={faLink} />
      </a>
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
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    download_api.getFileIcon(item.id, {
      size: 32,
    }).then((icon) => {
      setIcon(icon);
    });
  }, []);
  useEffect(() => {
    let last_bytes = item.bytesReceived;
    let last_time = Date.now();
    let speed = 0;
    let speed_duration = 0;
    add_tick(item);
    function add_tick(item: DownloadItem) {
      if (item.state === 'in_progress' && !item.paused) {
        setTimeout(update, 100);
      } else {
        speed = 0;
      }
    }
    async function update() {
      const items = await download_api.search({
        id: item.id,
      });
      const chunk_size = items[0].bytesReceived - last_bytes;
      if (chunk_size !== 0) {
        const period = Date.now() - last_time;
        last_time += period;
        speed = (speed * speed_duration + chunk_size) / (speed_duration + period);
        speed_duration = Math.min(speed_duration + period, 5000);
        setSpeed(chunk_size / period * 1000);
        last_bytes = items[0].bytesReceived;
      }
      setItem(items[0]);
      add_tick(items[0]);
    }
  }, [item.state, item.paused]);
  const available = item.state === 'complete' && item.exists;
  const errored = item.state === 'interrupted' || item.state === 'complete' && !item.exists;
  const basename = item.filename.split('/').pop();
  const maskImage = 'linear-gradient(to right, #000 70%, transparent 100%)';
  return <div className={`
    flex flex-row flex-nowrap p-2 space-x-2 items-center
    hover:bg-slate-100
    ${errored ? 'text-black/30' : ''}
    ${available ? 'cursor-pointer' : ''}
  `} onClick={() => {
    if (available) {
      download_api.open(item.id);
    }
  }}>
    <img src={icon} className={`w-8 h-8 ${errored ? 'grayscale opacity-30' : ''}`} />
    <div className='grow relative overflow-x-hidden'>
      <div className='mb-0' style={{
        maskImage, WebkitMaskImage: maskImage,
        whiteSpace: 'nowrap',
      }}>
        <span className={available ? 'text-blue-500' : ''}>
          {errored ? <del>{basename}</del> : basename}
        </span>
      </div>
      {item.state === 'in_progress'
        ? <div className='w-full relative bg-gray-300 rounded-full'>
          <div className='h-1 bg-sky-500 rounded-full transition-all duration-300' style={{
            width: `${item.bytesReceived / item.totalBytes * 100}%`,
          }}/>
        </div>
        : <div className='h-1' />
      }
      <div className='flex flex-row flex-nowrap text-xs'>
        <div className='mr-1'>
          {(item.state === 'in_progress' && !item.paused && `${humanSize(speed)}/s`)
            || (item.state == 'complete' && !item.exists && `Deleted`)
            || (item.state == 'interrupted' && item.error)
          }
        </div>
        <div className='ml-auto mr-1'>
          {`${item.state === 'in_progress'
            ? `${humanSize(item.bytesReceived)}/`
            : ''
            }${humanSize(item.fileSize)}`}
        </div>
        <div>
    {item.danger !== 'safe' && item.danger !== 'accepted' ? <button
      onClick={() => download_api.acceptDanger(item.id)}
    >
      accept danger
    </button> : actions[item.state](item, render)}
        </div>
      </div>
    </div>
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
      orderBy: ['-startTime'],
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
  return <div className='w-72 font-sans text-sm'>
    <div className='flex flex-row flex-nowrap p-2'>
      <div className='mr-2'>
        <FontAwesomeIcon icon={faSearch} className='w-8' />
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
