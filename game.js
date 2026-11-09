import createKof97 from './kof97app.js';

const canvas = document.querySelector('#canvas');
const status = document.querySelector('#status');
const buttons = Object.fromEntries([...document.querySelectorAll('button')].map(button => [button.id, button]));
const actions = ['pause', 'reset', 'save', 'load', 'quit'];
let game;
let paused = false;
let ready = false;
let busy = false;
let stateResult;

function message(text, error = false) {
  status.textContent = text;
  status.toggleAttribute('data-error', error);
}
function controls() {
  for (const name of actions) buttons[name].disabled = !ready || busy;
  buttons.load.disabled ||= !game?.FS.analyzePath('/save/quick.sta').exists;
}
function sync(populate) {
  return new Promise((resolve, reject) => game.FS.syncfs(populate, error => error ? reject(error) : resolve()));
}
async function stateOperation(load) {
  paused = false; // MAME resumes execution to drain pending device timers.
  buttons.pause.textContent = '暂停';
  await new Promise((resolve, reject) => {
    stateResult = success => {
      stateResult = undefined;
      if (success) resolve(); else reject(new Error(status.textContent));
    };
    if (load) game._kof97_load(); else game._kof97_save();
  });
  message(load ? '进度已读取。' : '正在保存到浏览器…');
  if (!load) {
    await sync(false);
    message('进度已保存到当前浏览器。');
  }
}
async function perform(action) {
  busy = true;
  controls();
  try { await action(); } catch (error) { message(String(error), true); }
  finally { busy = false; controls(); canvas.focus(); }
}

async function prepare() {
  try {
    game = await createKof97({
      canvas,
      noInitialRun: true,
      print: text => console.info(text),
      printErr: text => { console.error(text); message(text, true); },
      onAbort: reason => {
        ready = false;
        controls();
        message(String(reason), true);
        stateResult?.(false);
      },
      onGameMessage: text => message(text),
      onGameStateResult: success => stateResult(success),
      onGameReady: () => {
        ready = true;
        controls();
        message('游戏已启动。5 / 6 投币，1 / 2 开始。');
        canvas.focus();
      },
      onGameExit: async () => {
        ready = false;
        controls();
        try { await sync(false); location.reload(); }
        catch (error) { message(`浏览器保存失败：${error}`, true); }
      },
      monitorRunDependencies: remaining => {
        if (remaining) message('正在准备游戏资源…');
      },
    });
    game.FS.mkdir('/save');
    game.FS.mount(game.IDBFS, {}, '/save');
    await sync(true);
    buttons.start.disabled = false;
    buttons.start.onclick = () => {
      buttons.start.disabled = true;
      game.resumeAudio().catch(error => message(String(error), true));
      game.callMain([]);
    };
    message('资源已就绪，点击开始游戏。');
  } catch (error) {
    message(`启动失败：${error}`, true);
    buttons.start.textContent = '重新加载';
    buttons.start.disabled = false;
    buttons.start.onclick = () => location.reload();
  }
}
buttons.pause.addEventListener('click', () => {
  paused = !paused;
  game._kof97_pause(Number(paused));
  buttons.pause.textContent = paused ? '继续' : '暂停';
  if (!paused) game.resumeAudio().catch(error => message(String(error), true));
  canvas.focus();
});
buttons.reset.addEventListener('click', () => {
  paused = false;
  buttons.pause.textContent = '暂停';
  game._kof97_pause(0);
  game._kof97_reset();
  canvas.focus();
});
buttons.save.addEventListener('click', () => perform(() => stateOperation(false)));
buttons.load.addEventListener('click', () => perform(() => stateOperation(true)));
buttons.quit.addEventListener('click', () => perform(async () => {
  await stateOperation(false);
  ready = false;
  game._kof97_quit();
}));
buttons.fullscreen.addEventListener('click', () => {
  canvas.parentElement.requestFullscreen().then(() => canvas.focus(), error => message(String(error), true));
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ready && !busy) {
    paused = true;
    game._kof97_pause(1);
    buttons.pause.textContent = '继续';
  }
});
canvas.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
});
window.addEventListener('error', event => message(event.message, true));
window.addEventListener('unhandledrejection', event => message(String(event.reason), true));
prepare();
