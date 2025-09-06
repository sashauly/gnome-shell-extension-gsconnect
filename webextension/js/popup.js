// SPDX-FileCopyrightText: GSConnect Developers https://github.com/GSConnect
//
// SPDX-License-Identifier: GPL-2.0-or-later

'use strict';

import browser from 'webextension-polyfill';

const popupContent = document.getElementById('popup-content');

const SPECIAL_PROTOCOLS = [
    'about:',
    'chrome:',
    'chrome-extension:',
    'edge:',
    'file:',
    'moz-extension:',
];

/**
 * Checks if a given URL is a browser-specific special protocol.
 * @param {string} url - The URL to check.
 * @returns {boolean} True if the URL is a special protocol, false otherwise.
 */
function isSpecialUrl(url) {
    if (!url) return true;
    return SPECIAL_PROTOCOLS.some((protocol) => url.startsWith(protocol));
}
/**
 * Renders the popup UI based on the current connection and device status.
 * Fetches device and connection data from local storage and updates the DOM.
 */
async function renderPopupUI() {
    popupContent.innerHTML = '';

    const currentTab = await getCurrentTab();
    if (!currentTab || isSpecialUrl(currentTab.url)) {
        showStatusMessage('Sharing is not available on this page.');
        return;
    }

    const { devices, connected } = await browser.storage.local.get([
        'devices',
        'connected',
    ]);

    if (connected === false) {
        showStatusMessage('GSConnect is not connected.');
        return;
    }

    if (!Array.isArray(devices) || devices.length === 0) {
        showStatusMessage('No devices found.');
        return;
    }

    renderDeviceList(devices);
}

/**
 * Renders a list of devices with action buttons.
 * @param {object[]} devices - An array of device objects.
 */
function renderDeviceList(devices) {
    const deviceList = document.createElement('ul');
    deviceList.className = 'device-list';

    devices.forEach((device) => {
        const deviceItem = createDeviceItem(device);
        deviceList.appendChild(deviceItem);
    });

    popupContent.appendChild(deviceList);
}

/**
 * Creates a single list item element for a device.
 * @param {object} device - The device object.
 * @returns {HTMLLIElement} The created list item element.
 */
function createDeviceItem(device) {
    const deviceItem = document.createElement('li');
    deviceItem.className = 'device';

    const mainLine = document.createElement('div');
    mainLine.className = 'device-main-line';

    const deviceIcon = document.createElement('img');
    deviceIcon.className = 'device-icon';
    deviceIcon.src = `images/${device.type}.svg`;
    deviceIcon.alt = browser.i18n.getMessage('deviceIconAlt', device.type);
    mainLine.appendChild(deviceIcon);

    const deviceName = document.createElement('span');
    deviceName.className = 'device-name';
    deviceName.textContent = device.name;
    mainLine.appendChild(deviceName);
    deviceItem.appendChild(mainLine);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'plugin-buttons';

    if (device.share) {
        buttonsContainer.appendChild(
            createActionButton(
                device.id,
                'share',
                browser.i18n.getMessage('shareMessage'),
                'images/open-in-browser.svg'
            )
        );
    }
    if (device.telephony) {
        buttonsContainer.appendChild(
            createActionButton(
                device.id,
                'telephony',
                browser.i18n.getMessage('smsMessage'),
                'images/message.svg'
            )
        );
    }

    deviceItem.appendChild(buttonsContainer);
    return deviceItem;
}

/**
 * Creates a single action button for a device.
 * @param {string} deviceId - The ID of the device.
 * @param {string} action - The action type (e.g., 'share').
 * @param {string} title - The button's tooltip text.
 * @param {string} iconPath - The path to the button's icon image.
 * @returns {HTMLButtonElement} The created button element.
 */
function createActionButton(deviceId, action, title, iconPath) {
    const button = document.createElement('button');
    button.className = 'plugin-button';
    button.innerHTML = `<img src="${iconPath}" alt="${title}">`;
    button.title = title;
    button.addEventListener('click', () => handleActionClick(deviceId, action));
    return button;
}

/**
 * Displays a status message in the popup.
 * @param {string} message - The message to display.
 */
function showStatusMessage(message) {
    const messageContainer = document.createElement('div');
    messageContainer.className = 'message-container';
    messageContainer.textContent = message;
    popupContent.appendChild(messageContainer);
}

/**
 * Handles the click event for an action button.
 * Validates the current tab URL and sends an action message to the background script.
 * @param {string} deviceId - The ID of the device.
 * @param {string} action - The action type.
 */
async function handleActionClick(deviceId, action) {
    const currentTab = await getCurrentTab();
    if (!currentTab) {
        console.warn('Popup: No active tab found.', 'handleActionClick');
        // TODO add i18n
        showStatusMessage('Cannot determine the current page.');
        return;
    }

    const currentTabUrl = currentTab.url;
    if (isSpecialUrl(currentTabUrl)) {
        console.warn(
            `Popup: Cannot share from a special page: ${currentTabUrl}`,
            'handleActionClick'
        );
        // TODO add i18n
        showStatusMessage('Sharing is not available on this page.');
        return;
    }

    sendMessageToBackground(deviceId, action, currentTabUrl);
}

/**
 * Sends a message to the background service worker.
 * @param {string} deviceId - The device ID.
 * @param {string} action - The action type.
 * @param {string} url - The URL to share.
 */
async function sendMessageToBackground(deviceId, action, url) {
    try {
        await browser.runtime.sendMessage({
            type: 'share',
            data: {
                device: deviceId,
                url: url,
                action: action,
            },
        });
    } catch (error) {
        console.error(
            'Popup: Error sending message to background.',
            error,
            'sendMessageToBackground'
        );
        alert(
            'Failed to send message to the background service. Please try again.'
        );
    }
    window.close();
}

/**
 * Queries for the active tab in the current window.
 * @returns {Promise<browser.Tabs.Tab|null>} The active tab or null if not found.
 */
async function getCurrentTab() {
    try {
        const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
        });
        return tabs[0] || null;
    } catch (error) {
        console.error(
            'Popup: Failed to query active tab.',
            error,
            'getCurrentTab'
        );
        return null;
    }
}

browser.runtime.onMessage.addListener(() => {
    renderPopupUI();
});

document.addEventListener('DOMContentLoaded', renderPopupUI);
