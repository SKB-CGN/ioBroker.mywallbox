'use strict';

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const request = require('request');

// Variables
let password;
let email;
let poll_time;
let charger_id;
let token;
let logged_in = false;
let charger_data;
let charger_data_extended;
const adapterIntervals = {};

const BASEURL = 'https://api.wall-box.com/';
const URL_AUTHENTICATION = 'auth/token/user';
const URL_CHARGER = 'v2/charger/';
const URL_CHARGER_CONTROL = 'v3/chargers/';
const URL_CHARGER_ACTION = '/remote-action';
const URL_STATUS = 'chargers/status/';

class Wallbox extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'wallbox',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	// Function to decrypt the provided user password
	decrypt(key, value) {
		let result = "";
		for (let i = 0; i < value.length; ++i) {
			result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
		}
		return result;
	}


	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);

		// Load Config Variables
		email = this.config.email;
		poll_time = this.config.poll_time;
		charger_id = this.config.charger_id;

		if (email == '' || this.config.password == '') {
			this.log.error('No Email and/or password set');
		} else {
			// Password Handling
			this.getForeignObject("system.config", (err, obj) => {
				if (obj && obj.native && obj.native.secret) {
					//noinspection JSUnresolvedVariable
					password = this.decrypt(obj.native.secret, this.config.password);
				} else {
					//noinspection JSUnresolvedVariable
					password = this.decrypt("Zgfr56gFe87jJOM", this.config.password);
				}
			});
			//Start logic with Initialization
			this.init();
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.setState('info.connection', false, true);
			clearTimeout(adapterIntervals.readAllStates);
			this.log.info('Adapter Wallbox cleaned up everything...');
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (state) {
			// The state was changed
			if (!state.ack || !state.from.includes('wallbox')) {
				this.log.debug('New Event for state: ' + JSON.stringify(state));
				this.log.debug('ID: ' + JSON.stringify(id));
				const tmpControl = id.split('.')[4];
				let response;
				switch (tmpControl) {
					case 'name':
						this.log.info('Requesting to change the name of the Wallbox');
						response = await this.changeChargerData('name', state.val);
						this.log.info(response);
						break;

					case 'locked':
						if (state.val === 1 || state.val === 0) {
							if (state.val === 1) {
								this.log.info('Requesting to lock the Wallbox');
							}
							if (state.val === 0) {
								this.log.info('Requesting to unlock the Wallbox');
							}
							response = await this.changeChargerData('locked', state.val);
							this.log.info(response);
						} else {
							this.log.warn('Invalid Value for locking/unlocking. States should be: Lock:1 | Unlock: 0!');
						}
						break;

					case 'maxChargingCurrent':
						this.log.info('Requesting to change the Charge current for Wallbox to ' + state.val + ' A');
						response = await this.changeChargerData('maxChargingCurrent', state.val);
						this.log.info(response);
						break;

					case 'pause':
						if (state.val === true) {
							this.log.info('Requesting to set the Wallbox into Pause-Mode!');
							response = await this.controlCharger('action', 2);
							this.log.info(response);
						}
						break;

					case 'resume':
						if (state.val === true) {
							this.log.info('Requesting to set the Wallbox into Resume-Mode!');
							response = await this.controlCharger('action', 1);
							this.log.info(response);
						}
						break;

					case 'reboot':
						if (state.val === true) {
							this.log.info('Requesting to reboot the Wallbox!');
							response = await this.controlCharger('action', 3);
							this.log.info(response);
						}
						break;

					case 'factory':
						if (state.val === true) {
							this.log.info('Requesting to factory-reset the Wallbox!');
							response = await this.controlCharger('action', 4);
							this.log.info(response);
						}
						break;

					case 'update':
						if (state.val === true) {
							this.log.info('Requesting to Update the software of the Wallbox!');
							response = await this.controlCharger('action', 5);
							this.log.info(response);
						}
						break;
				}
			}
		}
	}

	async getWallboxToken() {
		return new Promise((resolve, reject) => {
			let result;
			this.log.silly("Email: " + email + " | Password: " + password);
			try {
				const options = {
					url: BASEURL + URL_AUTHENTICATION,
					method: 'POST',
					headers: {
						'Authorization': 'Basic ' + Buffer.from(email + ":" + password).toString('base64'),
						'Accept': 'application/json, text/plain, */*',
						'Content-Type': 'application/json;charset=utf-8',
					}
				};
				request(options, (err, response, body) => {
					if (response) {
						try {
							result = JSON.parse(body);
							/* Catch errors */
							if (result.error === true || result.jwt === undefined) {
								this.log.warn('Error while getting Token from Wallbox-API. Error: ' + result.msg);
							} else {
								resolve(result.jwt);
							}
						} catch (error) {
							reject(error);
						}
					}

				});
			} catch (error) {
				reject(error);
			}
		});
	}

	async getChargerData(token) {
		let result;
		try {
			const options = {
				url: BASEURL + URL_CHARGER + charger_id,
				method: 'PUT',
				headers: {
					'Authorization': 'Bearer ' + token,
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				}
			}
			request(options, (err, response, body) => {
				result = JSON.parse(body);
				this.log.debug("RAW Data of the charger: " + body);
				/* Catch errors */
				if (result.msg === undefined) {
					// No Message Text found -> JSON received
					charger_data = result;
					this.setNewStates(charger_data);
					if (adapterIntervals.readAllStates != null) {
						this.log.debug('Successfully polled Data!');
					}
				} else {
					this.log.warn('The following error occurred while fetching data: ' + result.msg);
				}
			});
		} catch (error) {
			this.log.error('Error on API-Request Status');
			if (typeof error === 'string') {
				this.log.error(error);
			} else if (error instanceof Error) {
				this.log.error(error.message);
			}
		}
		// Extended Charger Details
		try {
			const options = {
				url: BASEURL + URL_STATUS + charger_id,
				method: 'GET',
				headers: {
					'Authorization': 'Bearer ' + token,
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				}
			}
			request(options, (err, response, body) => {
				result = JSON.parse(body);
				this.log.debug("RAW Data extended of the charger: " + body);
				/* Catch errors */
				if (result.msg === undefined) {
					// No Message Text found -> JSON received
					charger_data_extended = result;
					this.setNewExtendedStates(charger_data_extended);
					if (adapterIntervals.readAllStates != null) {
						this.log.debug('Successfully polled extended Data!');
					}
				} else {
					this.log.warn('The following error occurred while fetching extended data: ' + result.msg);
				}
			});
		} catch (error) {
			this.log.error('Error on extended API-Request Status');
			if (typeof error === 'string') {
				this.log.error(error);
			} else if (error instanceof Error) {
				this.log.error(error.message);
			}
		}
	}

	async changeChargerData(key, value) {
		return new Promise((resolve, reject) => {
			// Login
			this.login();
			let result;
			try {
				const options = {
					url: BASEURL + URL_CHARGER + charger_id,
					method: 'PUT',
					headers: {
						'Authorization': 'Bearer ' + token,
						'Accept': 'application/json, text/plain, */*',
						'Content-Type': 'application/json;charset=utf-8',
					},
					body: JSON.stringify({
						[key]: value
					})
				}
				request(options, (err, response, body) => {
					this.log.debug(body);
					result = JSON.parse(body);
					if (result.message === undefined) {
						// No Message Text found -> JSON received
						charger_data = result;
						this.setNewStates(charger_data);

						if (charger_data.data.chargerData[key] == value) {
							this.log.debug('JSON Value: ' + charger_data.data.chargerData[key] + ' | Requested Value: ' + value + ' | Value changed!');
							resolve('Success!');
						} else {
							resolve('Failed!');
						}
					} else {
						this.log.warn('The following error occurred while setting data: ' + result.message);
					}
				});
			} catch (error) {
				this.log.error('Error on API-Request Status');
				if (typeof error === 'string') {
					this.log.error(error);
				} else if (error instanceof Error) {
					this.log.error(error.message);
				}
				reject(error);
			}
		});
	}

	async controlCharger(key, value) {
		return new Promise((resolve, reject) => {
			// Login
			this.login();
			let result;
			try {
				const options = {
					url: BASEURL + URL_CHARGER_CONTROL + charger_id + URL_CHARGER_ACTION,
					method: 'POST',
					headers: {
						'Authorization': 'Bearer ' + token,
						'Accept': 'application/json, text/plain, */*',
						'Content-Type': 'application/json;charset=utf-8',
					},
					body: JSON.stringify({
						[key]: value
					})
				}
				request(options, (err, response, body) => {
					this.log.debug(body);
					result = JSON.parse(body);
					if (result.msg === undefined) {
						// No Message Text found -> JSON received
						charger_data = result;
						//this.setNewStates(charger_data);

						if (charger_data[key] == value) {
							this.log.debug('JSON: ' + charger_data[key] + ' | Value: ' + value + ' Value changed!');
							resolve('Success!');
						} else {
							resolve('Failed!');
						}
					} else {
						this.log.warn('The following error occurred while setting Wallbox Mode: ' + result.msg);
					}
				});
			} catch (error) {
				this.log.error('Error on API-Request Status');
				if (typeof error === 'string') {
					this.log.error(error);
				} else if (error instanceof Error) {
					this.log.error(error.message);
				}
				reject(error);
			}
		});
	}

	async init() {
		// Log into Wallbox Account
		this.log.info('Trying to login to Wallbox-API');
		// Create the states
		await this.createInfoObjects(charger_id);
		await this.setControlObjects(charger_id);
		// Get the data
		this.requestPolling();
		this.log.info("Polling activated with an interval of " + poll_time + " seconds!");
	}

	async login() {
		// Get API Token		
		token = await this.getWallboxToken();
		// Got Token - proceed
		if (token !== undefined || token !== '') {
			this.changeAdapterStatusOnline(true);
		} else {
			this.setState('info.connection', false, true);
			this.changeAdapterStatusOnline(false);
		}
	}

	changeAdapterStatusOnline(status) {
		this.setState('info.connection', status, true);
		logged_in = status;
		if (status === false) {
			this.log.error('Error with Wallbox Token. Empty or not set.');
		}

	}

	async requestPolling() {
		// Login
		await this.login();
		// Get Data
		await this.getChargerData(token);
		// Activate Polling Timer
		adapterIntervals.readAllStates = setTimeout(this.requestPolling.bind(this), poll_time * 1000);
	}

	async setNewStates(states) {
		// RAW Data
		await this.setStateAsync(charger_id + '._rawData', {
			val: JSON.stringify(states),
			ack: true
		});

		// Info States

		await this.setStateAsync(charger_id + '.info.serialNumber', {
			val: states.data.chargerData.serialNumber,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.uid', {
			val: states.data.chargerData.uid,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.name', {
			val: states.data.chargerData.name,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.type', {
			val: states.data.chargerData.chargerType,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.lastSync', {
			val: states.data.chargerData.lastConnection,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.lastSyncDT', {
			val: this.getDateTime(states.data.chargerData.lastConnection * 1000),
			ack: true
		});

		await this.setStateAsync(charger_id + '.info.powerSharingStatus', {
			val: states.data.chargerData.powerSharingStatus,
			ack: true
		});

		await this.setStateAsync(charger_id + '.info.status', {
			val: states.data.chargerData.status,
			ack: true
		});

		// Charging States

		await this.setStateAsync(charger_id + '.charging.stateOfCharge', {
			val: states.data.chargerData.stateOfCharge,
			ack: true
		});
		await this.setStateAsync(charger_id + '.charging.maxChgCurrent', {
			val: states.data.chargerData.maxChgCurrent,
			ack: true
		});
		await this.setStateAsync(charger_id + '.charging.maxAvailableCurrent', {
			val: states.data.chargerData.maxAvailableCurrent,
			ack: true
		});
		await this.setStateAsync(charger_id + '.charging.maxChargingCurrent', {
			val: states.data.chargerData.maxChargingCurrent,
			ack: true
		});
		await this.setStateAsync(charger_id + '.control.maxChargingCurrent', {
			val: states.data.chargerData.maxChargingCurrent,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.chargerLoadName', {
			val: states.data.chargerData.chargerLoadName,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.chargerLoadId', {
			val: states.data.chargerData.chargerLoadId,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.chargingType', {
			val: states.data.chargerData.chargingType,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.connectorType', {
			val: states.data.chargerData.connectorType,
			ack: true
		});

		// Connection States

		await this.setStateAsync(charger_id + '.connection.ocppConnectionStatus', {
			val: states.data.chargerData.ocppConnectionStatus,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.ocppReady', {
			val: states.data.chargerData.ocppReady,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.wifiSignal', {
			val: states.data.chargerData.wifiSignal,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.connectionType', {
			val: states.data.chargerData.connectionType,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.protocolCommunication', {
			val: states.data.chargerData.protocolCommunication,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.mid.midEnabled', {
			val: states.data.chargerData.midEnabled,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.mid.midMargin', {
			val: states.data.chargerData.midMargin,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.mid.midMarginUnit', {
			val: states.data.chargerData.midMarginUnit,
			ack: true
		});
		await this.setStateAsync(charger_id + '.connection.mid.midSerialNumber', {
			val: states.data.chargerData.midSerialNumber,
			ack: true
		});
		await this.setStateAsync(charger_id + '.connection.mid.midStatus', {
			val: states.data.chargerData.midStatus,
			ack: true
		});

		// Sessions

		await this.setStateAsync(charger_id + '.chargingData.monthly.totalUsers', {
			val: states.data.chargerData.resume.totalUsers,
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.totalSessions', {
			val: states.data.chargerData.resume.totalSessions,
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.chargingTime', {
			val: parseInt(states.data.chargerData.resume.chargingTime),
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.totalEnergy', {
			val: parseInt(states.data.chargerData.resume.totalEnergy),
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.totalMidEnergy', {
			val: parseInt(states.data.chargerData.resume.totalMidEnergy),
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.energyUnit', {
			val: states.data.chargerData.resume.energyUnit,
			ack: true
		});

		// Control

		await this.setStateAsync(charger_id + '.control.locked', {
			val: states.data.chargerData.locked,
			ack: true
		});
	}

	async setNewExtendedStates(states) {
		// RAW Data
		await this.setStateAsync(charger_id + '._rawDataExtended', {
			val: JSON.stringify(states),
			ack: true
		});

		// Charging Details

		await this.setStateAsync(charger_id + '.charging.charging_speed', {
			val: states.charging_speed,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.charging_power', {
			val: (states.charging_power * 1000),
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.finished', {
			val: states.finished,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.charging_time', {
			val: states.charging_time,
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.last_session.added_energy', {
			val: states.added_energy * 1000,
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.last_session.added_range', {
			val: states.added_range,
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.cost', {
			val: parseFloat(((charger_data.data.chargerData.resume.totalEnergy * states.depot_price) / 1000).toFixed(2)),
			ack: true
		});

		await this.setStateAsync(charger_id + '.info.software.currentVersion', {
			val: states.config_data.software.currentVersion,
			ack: true
		});

		await this.setStateAsync(charger_id + '.info.software.latestVersion', {
			val: states.config_data.software.latestVersion,
			ack: true
		});

		await this.setStateAsync(charger_id + '.info.software.updateAvailable', {
			val: states.config_data.software.updateAvailable,
			ack: true
		});

		await this.setStateAsync(charger_id + '.info.lock.auto_lock', {
			val: states.config_data.auto_lock,
			ack: true
		});

		await this.setStateAsync(charger_id + '.info.lock.auto_lock_time', {
			val: states.config_data.auto_lock_time,
			ack: true
		});
	}

	async createInfoObjects(charger) {
		// Info States
		await this.setObjectNotExistsAsync(charger + '.info.serialNumber', {
			type: 'state',
			common: {
				name: 'Serialnumber of the Wallbox',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.uid', {
			type: 'state',
			common: {
				name: 'UID',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.name', {
			type: 'state',
			common: {
				name: 'Name of the Wallbox',
				type: 'string',
				role: 'text',
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates(charger + '.info.name');

		await this.setObjectNotExistsAsync(charger + '.info.type', {
			type: 'state',
			common: {
				name: 'Type of the Wallbox',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.lastSync', {
			type: 'state',
			common: {
				name: 'Last Synchronisation with Portal',
				type: 'number',
				role: 'indicator',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.lastSyncDT', {
			type: 'state',
			common: {
				name: 'Last Synchronisation with Portal (Date&Time)',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.powerSharingStatus', {
			type: 'state',
			common: {
				name: 'Status of Power-Sharing',
				type: 'number',
				role: 'indicator',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.status', {
			type: 'state',
			common: {
				name: 'Status of the Charger',
				type: 'number',
				states: {
					0: "Disconnected",
					14: "Error",
					15: "Error",
					161: "Ready",
					162: "Ready",
					163: "Disconnected",
					164: "Waiting",
					165: "Locked",
					166: "Updating",
					177: "Scheduled",
					178: "Paused",
					179: "Scheduled",
					180: "Waiting for car demand",
					181: "Waiting for car demand",
					182: "Paused",
					183: "Waiting in queue by Power Sharing",
					184: "Waiting in queue by Power Sharing",
					185: "Waiting in queue by Power Boost",
					186: "Waiting in queue by Power Boost",
					187: "Waiting MID failed",
					188: "Waiting MID safety margin exceeded",
					189: "Waiting in queue by Eco-Smart",
					193: "Charging",
					194: "Charging",
					195: "Charging",
					196: "Discharging",
					209: "Locked",
					210: "Locked - Car connected"
				},
				role: 'value.lock',
				read: true,
				write: false,
			},
			native: {},
		});

		// Charging States

		await this.setObjectNotExistsAsync(charger + '.charging.stateOfCharge', {
			type: 'state',
			common: {
				name: 'State of Charging',
				type: 'boolean',
				role: 'indicator.charging',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.finished', {
			type: 'state',
			common: {
				name: 'Charging finished',
				type: 'boolean',
				role: 'indicator.charging',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.maxChgCurrent', {
			type: 'state',
			common: {
				name: 'Max. charging Current (Control State)',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: 'A',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.maxAvailableCurrent', {
			type: 'state',
			common: {
				name: 'maximum Available Current from Wallbox',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: 'A',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.maxChargingCurrent', {
			type: 'state',
			common: {
				name: 'Max. charging Current',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: 'A',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.chargerLoadName', {
			type: 'state',
			common: {
				name: 'Charger Load Name',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.chargerLoadId', {
			type: 'state',
			common: {
				name: 'Charger Load ID',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.chargingType', {
			type: 'state',
			common: {
				name: 'Voltage Type',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.connectorType', {
			type: 'state',
			common: {
				name: 'Connector Type',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		// Connection States

		await this.setObjectNotExistsAsync(charger + '.connection.ocppConnectionStatus', {
			type: 'state',
			common: {
				name: 'OCPP Connection Status',
				type: 'number',
				role: 'indicator',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.ocppReady', {
			type: 'state',
			common: {
				name: 'OCPP Ready Status',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.connectionType', {
			type: 'state',
			common: {
				name: 'Type of connection',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.wifiSignal', {
			type: 'state',
			common: {
				name: 'Strength of Wifi-Signal',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: '%',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.protocolCommunication', {
			type: 'state',
			common: {
				name: 'Connection Communication Protocl',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.mid.midEnabled', {
			type: 'state',
			common: {
				name: 'MID enabled',
				type: 'number',
				states: {
					0: "Disabled",
					1: "Enabled"
				},
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.mid.midMargin', {
			type: 'state',
			common: {
				name: 'MID Margin',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.mid.midMarginUnit', {
			type: 'state',
			common: {
				name: 'MID Margin Unit',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.mid.midSerialNumber', {
			type: 'state',
			common: {
				name: 'MID Serial Number',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.connection.mid.midStatus', {
			type: 'state',
			common: {
				name: 'MID Status',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		// Sessions

		await this.setObjectNotExistsAsync(charger + '.chargingData.monthly.totalUsers', {
			type: 'state',
			common: {
				name: 'Monthly Users',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.chargingData.monthly.totalSessions', {
			type: 'state',
			common: {
				name: 'Monthly Sessions',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.chargingData.monthly.chargingTime', {
			type: 'state',
			common: {
				name: 'Monthly Charging Time in seconds',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.chargingData.monthly.totalEnergy', {
			type: 'state',
			common: {
				name: 'Monthly Energy Charged in Watts',
				type: 'number',
				role: 'value.power',
				read: true,
				write: false,
				unit: 'W',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.chargingData.monthly.totalMidEnergy', {
			type: 'state',
			common: {
				name: 'Monthly MID Energy Charged in Watts',
				type: 'number',
				role: 'value.power',
				read: true,
				write: false,
				unit: 'W',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.chargingData.monthly.energyUnit', {
			type: 'state',
			common: {
				name: 'Energy Unit of Portal',
				type: 'string',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		// RAW Data

		await this.setObjectNotExistsAsync(charger + '._rawData', {
			type: 'state',
			common: {
				name: 'RAW Data of the Wallbox',
				type: 'string',
				role: 'json',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '._rawDataExtended', {
			type: 'state',
			common: {
				name: 'RAW Data (Extended) of the Wallbox',
				type: 'string',
				role: 'json',
				read: true,
				write: false,
			},
			native: {},
		});

		// Extended Objects
		await this.setObjectNotExistsAsync(charger + '.charging.charging_speed', {
			type: 'state',
			common: {
				name: 'Charging Speed',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.charging_power', {
			type: 'state',
			common: {
				name: 'Charging Power',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.charging.charging_time', {
			type: 'state',
			common: {
				name: 'Time charger connected to the car',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.chargingData.last_session.added_energy', {
			type: 'state',
			common: {
				name: 'Session addded Energy in Watt-hours',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: 'Wh',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.chargingData.last_session.added_range', {
			type: 'state',
			common: {
				name: 'Session addded Range in km',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: 'km',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.chargingData.monthly.cost', {
			type: 'state',
			common: {
				name: 'Cost of Charging for current month',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.software.currentVersion', {
			type: 'state',
			common: {
				name: 'Current Version of the Wallbox',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.software.latestVersion', {
			type: 'state',
			common: {
				name: 'Latest available Software of the Wallbox',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.software.updateAvailable', {
			type: 'state',
			common: {
				name: 'Software-Update available',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.lock.auto_lock', {
			type: 'state',
			common: {
				name: 'Auto-Lock',
				type: 'number',
				states: {
					0: "Disabled",
					1: "Enabled"
				},
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});
		await this.setObjectNotExistsAsync(charger + '.info.lock.auto_lock_time', {
			type: 'state',
			common: {
				name: 'Auto-Lock after x seconds',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
				unit: 's',
			},
			native: {},
		});
	}

	async setControlObjects(charger) {
		await this.setObjectNotExistsAsync(charger + '.control.pause', {
			type: 'state',
			common: {
				name: 'Pause charging',
				type: 'boolean',
				role: 'button',
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates(charger + '.control.pause');

		await this.setObjectNotExistsAsync(charger + '.control.resume', {
			type: 'state',
			common: {
				name: 'Resume charging',
				type: 'boolean',
				role: 'button',
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates(charger + '.control.resume');

		await this.setObjectNotExistsAsync(charger + '.control.locked', {
			type: 'state',
			common: {
				name: 'Wallbox locked status',
				type: 'number',
				states: {
					0: "Unlocked",
					1: "Locked"
				},
				role: 'value.lock',
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates(charger + '.control.locked');

		await this.setObjectNotExistsAsync(charger + '.control.update', {
			type: 'state',
			common: {
				name: 'Update Wallbox to new Software',
				type: 'boolean',
				role: 'button',
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates(charger + '.control.update');

		await this.setObjectNotExistsAsync(charger + '.control.maxChargingCurrent', {
			type: 'state',
			common: {
				name: 'Max. charging Current',
				type: 'number',
				role: 'value',
				read: true,
				write: true,
				unit: 'A',
			},
			native: {},
		});
		this.subscribeStates(charger + '.control.maxChargingCurrent');
	}
	/**
	 * Convert a timestamp to datetime.
	 *
	 * @param	{integer}	ts			Timestamp to be converted to date-time format (in ms)
	 * @return	{string}				Timestamp in date-time format
	 *
	 */
	getDateTime(ts) {
		if (ts === undefined || ts <= 0 || ts == '')
			return '';

		let date = new Date(ts);
		let day = '0' + date.getDate();
		let month = '0' + (date.getMonth() + 1);
		let year = date.getFullYear();
		let hours = '0' + date.getHours();
		let minutes = '0' + date.getMinutes();
		let seconds = '0' + date.getSeconds();
		return day.substr(-2) + '.' + month.substr(-2) + '.' + year + ' ' + hours.substr(-2) + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }



}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Wallbox(options);
} else {
	// otherwise start the instance directly
	new Wallbox();
}