// Copyright (c) 2016-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'fs';

import path from 'path';

import {BrowserWindow, screen, app, globalShortcut} from 'electron';

import {SELECT_NEXT_TAB, SELECT_PREVIOUS_TAB} from 'common/communication';
import {DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH} from 'common/utils/constants';

import ContextMenu from '../contextMenu';
import * as Validator from '../Validator';

import createMainWindow from './mainWindow';

jest.mock('path', () => ({
    join: jest.fn(),
}));

jest.mock('electron', () => ({
    app: {
        getPath: jest.fn(),
        hide: jest.fn(),
    },
    BrowserWindow: jest.fn(),
    ipcMain: {
        handle: jest.fn(),
    },
    screen: {
        getDisplayMatching: jest.fn(),
    },
    globalShortcut: {
        register: jest.fn(),
        registerAll: jest.fn(),
    },
}));

jest.mock('electron-log', () => ({}));

jest.mock('global', () => ({
    willAppQuit: false,
}));

jest.mock('fs', () => ({
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

jest.mock('../Validator', () => ({
    validateBoundsInfo: jest.fn(),
}));

jest.mock('../contextMenu', () => jest.fn());

jest.mock('../utils', () => ({
    getLocalPreload: jest.fn(),
    getLocalURLString: jest.fn(),
}));

'use strict';

describe('main/windows/mainWindow', () => {
    describe('createMainWindow', () => {
        const baseWindow = {
            setMenuBarVisibility: jest.fn(),
            loadURL: jest.fn(),
            once: jest.fn(),
            on: jest.fn(),
            maximize: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            blur: jest.fn(),
            minimize: jest.fn(),
            webContents: {
                on: jest.fn(),
                send: jest.fn(),
            },
            isMaximized: jest.fn(),
            isFullScreen: jest.fn(),
            getBounds: jest.fn(),
        };

        beforeEach(() => {
            baseWindow.loadURL.mockImplementation(() => ({
                catch: jest.fn(),
            }));
            BrowserWindow.mockImplementation(() => baseWindow);
            fs.readFileSync.mockImplementation(() => '{"x":400,"y":300,"width":1280,"height":700,"maximized":false,"fullscreen":false}');
            path.join.mockImplementation(() => 'anyfile.txt');
            screen.getDisplayMatching.mockImplementation(() => ({bounds: {x: 0, y: 0, width: 1920, height: 1080}}));
            Validator.validateBoundsInfo.mockImplementation((data) => data);
            ContextMenu.mockImplementation(() => ({
                reload: jest.fn(),
            }));
        });

        afterEach(() => {
            jest.resetAllMocks();
        });

        it('should set window size using bounds read from file', () => {
            createMainWindow({}, {});
            expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
                x: 400,
                y: 300,
                width: 1280,
                height: 700,
                maximized: false,
                fullscreen: false,
            }));
        });

        it('should set default window size when failing to read bounds from file', () => {
            fs.readFileSync.mockImplementation(() => 'just a bunch of garbage');
            createMainWindow({}, {});
            expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
                width: DEFAULT_WINDOW_WIDTH,
                height: DEFAULT_WINDOW_HEIGHT,
            }));
        });

        it('should set default window size when bounds are outside the normal screen', () => {
            fs.readFileSync.mockImplementation(() => '{"x":-400,"y":-300,"width":1280,"height":700,"maximized":false,"fullscreen":false}');
            screen.getDisplayMatching.mockImplementation(() => ({bounds: {x: 0, y: 0, width: 1920, height: 1080}}));
            createMainWindow({}, {});
            expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
                width: DEFAULT_WINDOW_WIDTH,
                height: DEFAULT_WINDOW_HEIGHT,
            }));
        });

        it('should set linux app icon', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });
            createMainWindow({}, {linuxAppIcon: 'linux-icon.png'});
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            });
            expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
                icon: 'linux-icon.png',
            }));
        });

        it('should reset zoom level and maximize if applicable on ready-to-show', () => {
            const window = {
                ...baseWindow,
                once: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'ready-to-show') {
                        cb();
                    }
                }),
            };
            BrowserWindow.mockImplementation(() => window);
            fs.readFileSync.mockImplementation(() => '{"x":400,"y":300,"width":1280,"height":700,"maximized":true,"fullscreen":false}');
            createMainWindow({}, {});
            expect(window.webContents.zoomLevel).toStrictEqual(0);
            expect(window.maximize).toBeCalled();
        });

        it('should save window state on close if the app will quit', () => {
            global.willAppQuit = true;
            const window = {
                ...baseWindow,
                on: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'close') {
                        cb({preventDefault: jest.fn()});
                    }
                }),
            };
            BrowserWindow.mockImplementation(() => window);
            createMainWindow({}, {});
            global.willAppQuit = false;
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should hide window on close for Windows if app wont quit', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'win32',
            });
            const window = {
                ...baseWindow,
                on: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'close') {
                        cb({preventDefault: jest.fn()});
                    }
                }),
            };
            BrowserWindow.mockImplementation(() => window);
            createMainWindow({}, {});
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            });
            expect(window.hide).toHaveBeenCalled();
        });

        it('should hide window on close for Linux if app wont quit and config item is set', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });
            const window = {
                ...baseWindow,
                on: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'close') {
                        cb({preventDefault: jest.fn()});
                    }
                }),
            };
            BrowserWindow.mockImplementation(() => window);
            createMainWindow({minimizeToTray: true}, {});
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            });
            expect(window.hide).toHaveBeenCalled();
        });

        it('should minimize window on close for Linux if app wont quit and config item is not set', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });
            const window = {
                ...baseWindow,
                on: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'close') {
                        cb({preventDefault: jest.fn()});
                    }
                }),
            };
            BrowserWindow.mockImplementation(() => window);
            createMainWindow({}, {});
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            });
            expect(window.minimize).toHaveBeenCalled();
        });

        it('should hide window on close for Mac if app wont quit and window is not full screen', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });
            const window = {
                ...baseWindow,
                on: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'close') {
                        cb({preventDefault: jest.fn()});
                    }
                }),
            };
            BrowserWindow.mockImplementation(() => window);
            createMainWindow({}, {});
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            });
            expect(app.hide).toHaveBeenCalled();
        });

        it('should leave full screen and then hide window on close for Mac if app wont quit and window is full screen', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });
            const window = {
                ...baseWindow,
                isFullScreen: jest.fn().mockImplementation(() => true),
                setFullScreen: jest.fn(),
                once: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'leave-full-screen') {
                        cb();
                    }
                }),
                on: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'close') {
                        cb({preventDefault: jest.fn()});
                    }
                }),
            };
            BrowserWindow.mockImplementation(() => window);
            createMainWindow({}, {});
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            });
            expect(window.once).toHaveBeenCalledWith('leave-full-screen', expect.any(Function));
            expect(app.hide).toHaveBeenCalled();
            expect(window.setFullScreen).toHaveBeenCalledWith(false);
        });

        it('should select tabs using alt+cmd+arrow keys on Mac', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'darwin',
            });
            const window = {
                ...baseWindow,
                webContents: {
                    ...baseWindow.webContents,
                    on: jest.fn().mockImplementation((event, cb) => {
                        if (event === 'before-input-event') {
                            cb(null, {alt: true, meta: true, key: 'ArrowRight'});
                            cb(null, {alt: true, meta: true, key: 'ArrowLeft'});
                        }
                    }),
                },
            };
            BrowserWindow.mockImplementation(() => window);
            createMainWindow({}, {});
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            });
            expect(window.webContents.send).toHaveBeenCalledWith(SELECT_NEXT_TAB);
            expect(window.webContents.send).toHaveBeenCalledWith(SELECT_PREVIOUS_TAB);
        });

        it('should add override shortcuts for the top menu on Linux to stop it showing up', () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', {
                value: 'linux',
            });
            const window = {
                ...baseWindow,
                on: jest.fn().mockImplementation((event, cb) => {
                    if (event === 'focus') {
                        cb();
                    }
                }),
            };
            BrowserWindow.mockImplementation(() => window);
            createMainWindow({}, {});
            Object.defineProperty(process, 'platform', {
                value: originalPlatform,
            });
            expect(globalShortcut.registerAll).toHaveBeenCalledWith(['Alt+F', 'Alt+E', 'Alt+V', 'Alt+H', 'Alt+W', 'Alt+P'], expect.any(Function));
        });
    });
});
