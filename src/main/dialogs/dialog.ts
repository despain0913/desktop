import { BrowserView, app, ipcMain } from 'electron';
import { join } from 'path';
import { AppWindow } from '../windows';

interface IOptions {
  name: string;
  devtools?: boolean;
  bounds?: IRectangle;
  hideTimeout?: number;
  customHide?: boolean;
  webPreferences?: Electron.WebPreferences;
}

interface IRectangle {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class Dialog {
  public appWindow: AppWindow;
  public browserView: BrowserView;

  public visible = false;

  public bounds: IRectangle = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };

  private timeout: any;
  private hideTimeout: number;
  private name: string;

  public tabIds: number[] = [];

  private loaded = false;
  private showCallback: any = null;

  public constructor(
    appWindow: AppWindow,
    { bounds, name, devtools, hideTimeout, webPreferences }: IOptions,
  ) {
    this.browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
        ...webPreferences,
      },
    });

    this.appWindow = appWindow;
    this.bounds = { ...this.bounds, ...bounds };
    this.hideTimeout = hideTimeout;
    this.name = name;

    const { webContents } = this.browserView;

    ipcMain.on(`hide-${webContents.id}`, () => {
      this.hide(false, false);
      this.tabIds = this.tabIds.filter(
        (x) => x !== appWindow.viewManager.selectedId,
      );
    });

    webContents.once('dom-ready', () => {
      this.loaded = true;

      if (this.showCallback) {
        this.showCallback();
        this.showCallback = null;
      }
    });

    if (process.env.NODE_ENV === 'development') {
      webContents.loadURL(`http://localhost:4444/${name}.html`);
      if (devtools) {
        webContents.openDevTools({ mode: 'detach' });
      }
    } else {
      webContents.loadURL(
        join('file://', app.getAppPath(), `build/${name}.html`),
      );
    }
  }

  public get webContents() {
    return this.browserView.webContents;
  }

  public get id() {
    return this.webContents.id;
  }

  public rearrange(rect: IRectangle = {}) {
    this.bounds = {
      height: rect.height || this.bounds.height,
      width: rect.width || this.bounds.width,
      x: rect.x || this.bounds.x,
      y: rect.y || this.bounds.y,
    };

    if (this.visible) {
      this.browserView.setBounds(this.bounds as any);
    }
  }

  public toggle() {
    if (!this.visible) this.show();
  }

  public show(focus = true, waitForLoad = true) {
    return new Promise((resolve) => {
      clearTimeout(this.timeout);

      this.appWindow.webContents.send(
        'dialog-visibility-change',
        this.name,
        true,
      );

      const callback = () => {
        if (this.visible) {
          if (focus) this.webContents.focus();
          return;
        }

        this.visible = true;

        this.appWindow.win.addBrowserView(this.browserView);
        this.rearrange();

        if (focus) this.webContents.focus();

        resolve();
      };

      if (!this.loaded && waitForLoad) {
        this.showCallback = callback;
        return;
      }

      callback();
    });
  }

  public hideVisually() {
    this.send('visible', false);
  }

  public send(channel: string, ...args: any[]) {
    this.webContents.send(channel, ...args);
  }

  public hide(bringToTop = false, hideVisually = true) {
    if (hideVisually) this.hideVisually();

    if (!this.visible) return;

    this.appWindow.webContents.send(
      'dialog-visibility-change',
      this.name,
      false,
    );

    if (bringToTop) {
      this.bringToTop();
    }

    clearTimeout(this.timeout);

    if (this.hideTimeout) {
      this.timeout = setTimeout(() => {
        this.appWindow.win.removeBrowserView(this.browserView);
      }, this.hideTimeout);
    } else {
      this.appWindow.win.removeBrowserView(this.browserView);
    }

    this.visible = false;

    // this.appWindow.fixDragging();
  }

  public bringToTop() {
    this.appWindow.win.removeBrowserView(this.browserView);
    this.appWindow.win.addBrowserView(this.browserView);
  }

  public destroy() {
    this.browserView.destroy();
    this.browserView = null;
  }
}
