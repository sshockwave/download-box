import { useEffect, useReducer, useState, useRef } from 'react'
import { FontAwesomeIcon, FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faPause, faPlay, faLink, faUpRightFromSquare, faXmark, faTrashCan, faSearch, faCircleCheck, faStop } from '@fortawesome/free-solid-svg-icons';
import classes from './App.module.css';

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

function IconButton({ icon, onClick, buttonClass, hoverIcon, tag, buttonRest, ...rest }: FontAwesomeIconProps & {
  onClick?: () => void,
  buttonClass?: string,
  hoverIcon?: FontAwesomeIconProps['icon'],
  buttonRest?: {},
  tag?: keyof JSX.IntrinsicElements,
}) {
  const [hover, setHover] = useState(false);
  const Tag = tag ?? 'button';
  return <Tag onClick={(ev) => {
    ev.stopPropagation();
    onClick?.();
  }}
    className={`hover:text-black dark:hover:text-white ${classes['hover-bg']} ${buttonClass ?? ''}`}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
    {...(buttonRest ?? {})}
  >
    <FontAwesomeIcon icon={hover ? hoverIcon ?? icon : icon} fixedWidth {...rest} />
  </Tag>;
}

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
  function open_file() {
    if (available) {
      download_api.open(item.id);
    }
  }
  return <div className={`
    flex flex-row flex-nowrap my-3 items-center justify-evenly
    ${errored ? 'text-black/30 dark:text-white/30' : ''}
  `}>
    <img src={icon} className={`w-8 h-8 cursor-pointer ${errored ? 'grayscale opacity-30' : ''}`} onClick={open_file}/>
    <div className='relative'>
      <div className='w-60 overflow-x-hidden' style={{
        maskImage, WebkitMaskImage: maskImage,
        whiteSpace: 'nowrap',
      }}>
        <span
          className={available ? 'text-blue-500 cursor-pointer hover:underline' : ''}
          onClick={open_file}
        >
          {errored ? <del>{basename}</del> : basename}
        </span>
      </div>
      {item.state === 'in_progress'
        ? <div className='w-full relative bg-gray-300 rounded-full'>
          <div className='h-0.5 bg-sky-500 rounded-full transition-all duration-300' style={{
            width: `${item.bytesReceived / item.totalBytes * 100}%`,
          }}/>
        </div>
        : <div className='h-0.5' />
      }
      <div className='flex flex-row flex-nowrap text-xs items-center'>
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
        <div className='mr-1'>
          {item.state == 'in_progress' && !item.paused ? <IconButton
            icon={faPause}
            onClick={() => download_api.pause(item.id)}
          /> : item.canResume ? <IconButton
            icon={faPlay}
            onClick={() => download_api.resume(item.id)}
          /> : item.danger !== 'safe' && item.danger !== 'accepted' ? <IconButton
            icon={faCircleCheck}
      onClick={() => download_api.acceptDanger(item.id)}
          /> : available ? <IconButton
            icon={faFolderOpen}
            onClick={() => download_api.show(item.id)}
          /> : <IconButton
            tag='a'
            icon={faLink}
            buttonRest={{
              href: item.url,
              target: '_blank',
            }}
            className='hover:text-black dark:hover:text-white'
          />}
        </div>
        <div>
          {available ? <IconButton
            icon={faTrashCan}
            onClick={() => download_api.removeFile(item.id)}
          /> : item.state == 'in_progress' ? <IconButton
            icon={faStop}
            onClick={() => download_api.cancel(item.id)}
          /> : <IconButton
            icon={faXmark}
            onClick={() => download_api.erase({ id: item.id })}
          />}
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
      chrome.action.setBadgeText({ text: '' });
      handleChange.current!.get(delta.id)?.(delta);
    });
    download_api.onErased.addListener((id) => {
      setItems(items.current.filter((item) => item.id !== id));
    });
  }, []);
  return <div className='w-72 font-sans text-sm'>
    <div className='flex flex-row flex-nowrap m-3 items-center'>
      <div className='grow mr-3 relative'>
        <FontAwesomeIcon icon={faSearch} className='h-4 absolute left-2 top-2' fixedWidth />
      <input
        type='search'
        placeholder='Search'
        className={`w-full outline-none pl-8 pr-2 h-8 rounded-full
          bg-gray-100 hover:bg-gray-200 focus:bg-gray-300
          dark:bg-gray-900 dark:hover:bg-gray-800 dark:focus:bg-gray-700
        `}
        onChange={(e) => {
          const query = e.target.value === '' ? {} : {
            query: [e.target.value],
          };
          download_api.search(query).then(setItems);
        }}
      />
      </div>
      <IconButton
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
