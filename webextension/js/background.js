// SPDX-FileCopyrightText: GSConnect Developers https://github.com/GSConnect
//
// SPDX-License-Identifier: GPL-2.0-or-later

'use strict';

import browser from 'webextension-polyfill';

const APPLICATION_ID = 'org.gnome.shell.extensions.gsconnect';

/**
 * All browser context types supported by the extension's context menu.
 * @type {browser.Menus.ContextType[]}
 */
const CONTEXT_TYPES = [
    // 'all',
    'audio',
    // 'browser_action',
    // 'editable',
    'frame',
    'image',
    'link',
    'page',
    // 'page_action',
    // 'selection',
    'video',
];

const SPECIAL_PROTOCOLS = [
    'about:',
    'chrome:',
    'chrome-extension:',
    'edge:',
    'file:',
    'moz-extension:',
];

let nmhPort = null;

let updateContextMenuTimeout = null;

/**
 * Establishes a connection to the Native Messaging Host.
 * Disconnects any existing port before connecting.
 */
function connectToNMH() {
    try {
        if (nmhPort) {
            nmhPort.disconnect();
        }

        nmhPort = browser.runtime.connectNative(APPLICATION_ID);

        nmhPort.onDisconnect.addListener(onNMHDisconnect);
        nmhPort.onMessage.addListener(handleNMHMessage);
    } catch (error) {
        console.error('Failed to connect to NMH.', error, 'connectToNMH');
        onNMHDisconnect();
    }
}

/**
 * Sends a message to the Native Messaging Host.
 * @param {object} message - The message to be sent.
 * @returns {boolean} - True if the message was sent, false otherwise.
 */
function sendMessageToNMH(message) {
    if (!nmhPort) {
        console.error(
            'NMH port is not connected. Message not sent.',
            'sendMessageToNMH'
        );
        return false;
    }
    try {
        nmhPort.postMessage(message);

        return true;
    } catch (error) {
        console.error(
            'Failed to post message to NMH.',
            error,
            'sendMessageToNMH'
        );
        return false;
    }
}

/**
 * @typedef {object} NMHMessage
 * @property {string} type - The type of message.
 * @property {object} data - The data of the message.
 */

/**
 * Handles incoming messages from the Native Messaging Host.
 * @param {NMHMessage} message - The message received from the NMH.
 */
async function handleNMHMessage(message) {
    if (!message || typeof message.type !== 'string') {
        console.error('Invalid message received from NMH.', 'handleNMHMessage');
        return;
    }

    switch (message.type) {
        case 'connected':
            if (message.data === true) {
                sendMessageToNMH({ type: 'devices' });
            }
            break;
        case 'devices':
            await browser.storage.local.set({
                devices: message.data,
                connected: true,
            });
            updateContextMenu();
            break;
        default:
            console.warn(
                `Unknown message type received: ${message.type}`,
                'handleNMHMessage'
            );
    }
}

/**
 * Handles disconnection from the Native Messaging Host.
 */
function onNMHDisconnect() {
    nmhPort = null;
    browser.storage.local.set({ devices: [], connected: false });
}

/**
 * Updates the browser's context menu after a short delay to debounce multiple calls.
 * @param {number} delay - The delay in milliseconds before updating the menu.
 */
function updateContextMenu(delay = 250) {
    clearTimeout(updateContextMenuTimeout);
    updateContextMenuTimeout = setTimeout(async () => {
        try {
            await browser.contextMenus.removeAll();
            const tabs = await browser.tabs.query({
                active: true,
                currentWindow: true,
            });
            const currentTabUrl = tabs[0]?.url;

            const isSpecialUrl = SPECIAL_PROTOCOLS.some(
                (p) => currentTabUrl && currentTabUrl.startsWith(p)
            );

            if (!isSpecialUrl) {
                await browser.contextMenus.create({
                    id: 'openPopup',
                    // TODO: add i18n
                    title: 'Send with GSConnect',
                    contexts: CONTEXT_TYPES,
                });
            }
        } catch (error) {
            console.error('Failed to update context menu:', error);
        }
    }, delay);
}

/**
 * Updates the extension icon's enabled/disabled state for a given tab.
 * @param {number} tabId - The ID of the tab.
 * @param {string} url - The URL of the tab.
 */
function updateIconState(tabId, url) {
    const isSpecialUrl = SPECIAL_PROTOCOLS.some(
        (p) => url && url.startsWith(p)
    );

    if (isSpecialUrl) {
        // HACK: Firefox doesn't have an action API yet
        (browser.action ?? browser.browserAction).disable(tabId);
    } else {
        (browser.action ?? browser.browserAction).enable(tabId);
    }
}

/**
 * Handles clicks on the context menu.
 * @param {browser.Menus.OnClickData} info - Information about the clicked menu item.
 */
function handleContextMenuClick(info) {
    if (info.menuItemId === 'openPopup') {
        // HACK: Firefox doesn't have an action API yet
        (browser.action ?? browser.browserAction).openPopup();
    }
}

/**
 * Handles messages received from the extension's popup or other parts.
 * @param {object} message - The message received.
 * @param {browser.Runtime.MessageSender} sender - The sender of the message.
 */
async function handleRuntimeMessage(message, sender) {
    console.log(
        'Received message:',
        message,
        'from:',
        sender,
        'handleRuntimeMessage'
    );

    if (typeof message !== 'object' || message === null) {
        console.warn('Received invalid message.', 'handleRuntimeMessage');
        return;
    }

    switch (message.type) {
        case 'share':
            if (sender.tab) {
                console.warn(
                    "Received a 'share' message from a tab. Ignoring.",
                    'handleRuntimeMessage'
                );
            } else {
                const sent = sendMessageToNMH(message);
                if (!sent) {
                    console.error(
                        "Failed to send 'share' message to NMH.",
                        'handleRuntimeMessage'
                    );
                }
            }
            break;
        default:
            console.warn(
                `Received unknown message type: ${message.type}`,
                'handleRuntimeMessage'
            );
    }
}

/**
 * Initializes the extension's state (icon and context menu) on startup or install.
 */
async function initializeState() {
    connectToNMH();

    const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
    });
    if (tabs[0]) {
        updateIconState(tabs[0].id, tabs[0].url);
    }
}

// Handles extension installation or update and browser startup
browser.runtime.onInstalled.addListener(initializeState);
browser.runtime.onStartup.addListener(initializeState);

// Handles messages from other extension components (e.g., popup)
browser.runtime.onMessage.addListener(handleRuntimeMessage);

// Handles context menu clicks
browser.contextMenus.onClicked.addListener(handleContextMenuClick);

// Handles tab navigation and updates
browser.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await browser.tabs.get(activeInfo.tabId);
    updateIconState(tab.id, tab.url);
    updateContextMenu();
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        updateIconState(tabId, changeInfo.url);
        updateContextMenu();
    }
});
