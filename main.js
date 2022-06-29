'use strict';

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const request = require('request');
let password;
let email;
let poll_time;
let charger_id;
let token;
let logged_in = false;
let charger_data;
const adapterIntervals = {};

const BASEURL = "https://api.wall-box.com/";
const URL_AUTHENTICATION = 'auth/token/user';
const URL_CHARGER = 'v2/charger/';

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

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);

		// Load Config Variables
		email = this.config.email;
		password = this.config.password;
		poll_time = this.config.poll_time;
		charger_id = this.config.charger_id;

		if (email == '' || password == '') {
			this.log.error('No Email and/or password set');
		} else {
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
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			this.setState('info.connection', false, true);
			clearTimeout(adapterIntervals.readAllStates);
			this.log.info('Adapter Wallbox cleaned up everything...');
			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

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
						this.log.info('Changing name for Wallbox');
						response = await this.changeChargerData('name', state.val);
						this.log.info(response);
						break;
					case 'locked':
						if (state.val === 1) {
							this.log.info('Locking Wallbox');
						} else {
							this.log.info('Unlocking Wallbox');
						}
						response = await this.changeChargerData('locked', state.val);
						this.log.info(response);
						break;
					case 'maxChargingCurrent':
						this.log.info('Changing Charge current for Wallbox to ' + state.val + ' A');
						response = await this.changeChargerData('maxChargingCurrent', state.val);
						this.log.info(response);
						break;
				}
			}
		}
	}

	async getWallboxToken() {
		return new Promise((resolve, reject) => {
			let result;
			this.log.debug("Email: " + email + " | Password: " + password);
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
					result = JSON.parse(body);
					/* Catch errors */
					if (result.error === true) {
						this.log.warn('Error while getting Token from Wallbox-API. Error: ' + result.msg);
					}
					if (result.jwt === undefined) {
						this.log.warn('Error while getting Token from Wallbox-API. Error: ' + result.msg);
					} else {
						resolve(result.jwt);
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
						this.log.info('Successfully polled Data with the Interval of ' + poll_time + ' seconds!');
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
					if (result.msg === undefined) {
						// No Message Text found -> JSON received
						charger_data = result;
						this.setNewStates(charger_data);

						if (charger_data.data.chargerData[key] == value) {
							this.log.debug('JSON: ' + charger_data.data.chargerData[key] + ' | Value: ' + value + ' Value changed!');
							resolve('Success!');
						} else {
							resolve('Failed!');
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
				reject(error);
			}
		});
	}



	async init() {
		// Log into Wallbox Account
		this.log.info('Trying to login to Wallbox-API');
		// Create the states
		await this.createInfoObjects(charger_id);
		// Get the data
		this.requestPolling();
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
		await this.setStateAsync(charger_id + '.info.software', {
			val: states.data.chargerData.softwareVersion,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.lastConnection', {
			val: states.data.chargerData.lastConnection,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.lastConnectionDT', {
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
		await this.setStateAsync(charger_id + '.charging.locked', {
			val: states.data.chargerData.locked,
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

		await this.setStateAsync(charger_id + '.sessions.totalUsers', {
			val: states.data.chargerData.resume.totalUsers,
			ack: true
		});

		await this.setStateAsync(charger_id + '.sessions.totalSessions', {
			val: states.data.chargerData.resume.totalSessions,
			ack: true
		});

		await this.setStateAsync(charger_id + '.sessions.chargingTime', {
			val: parseInt(states.data.chargerData.resume.chargingTime),
			ack: true
		});

		await this.setStateAsync(charger_id + '.sessions.totalEnergy', {
			val: parseInt(states.data.chargerData.resume.totalEnergy),
			ack: true
		});

		await this.setStateAsync(charger_id + '.sessions.totalMidEnergy', {
			val: parseInt(states.data.chargerData.resume.totalMidEnergy),
			ack: true
		});

		await this.setStateAsync(charger_id + '.sessions.energyUnit', {
			val: states.data.chargerData.resume.energyUnit,
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

		await this.setObjectNotExistsAsync(charger + '.info.software', {
			type: 'state',
			common: {
				name: 'Software of the Wallbox',
				type: 'string',
				role: 'text',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.lastConnection', {
			type: 'state',
			common: {
				name: 'Last connection command to Wallbox (Unix)',
				type: 'number',
				role: 'indicator',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.info.lastConnectionDT', {
			type: 'state',
			common: {
				name: 'Last connection command to Wallbox (human)',
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
					161: "Prepared for Charging",
					209: "Locked"
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
				write: true,
				unit: 'A',
			},
			native: {},
		});
		this.subscribeStates(charger + '.charging.maxChargingCurrent');

		await this.setObjectNotExistsAsync(charger + '.charging.locked', {
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
		this.subscribeStates(charger + '.charging.locked');

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

		await this.setObjectNotExistsAsync(charger + '.sessions.totalUsers', {
			type: 'state',
			common: {
				name: 'Total Users',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.sessions.totalSessions', {
			type: 'state',
			common: {
				name: 'Total Sessions',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.sessions.chargingTime', {
			type: 'state',
			common: {
				name: 'Total Charging Time in Minutes',
				type: 'number',
				role: 'value',
				read: true,
				write: false,
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.sessions.totalEnergy', {
			type: 'state',
			common: {
				name: 'Total Energy Charged in Watts',
				type: 'number',
				role: 'value.power',
				read: true,
				write: false,
				unit: 'W',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.sessions.totalMidEnergy', {
			type: 'state',
			common: {
				name: 'Total Energy Charged in Watts',
				type: 'number',
				role: 'value.power',
				read: true,
				write: false,
				unit: 'W',
			},
			native: {},
		});

		await this.setObjectNotExistsAsync(charger + '.sessions.energyUnit', {
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
	}

	async setControlObjects(vin) {
		await this.setObjectNotExistsAsync(vin + '.control.charge_stop', {
			type: 'state',
			common: {
				name: 'Stop charging',
				type: 'boolean',
				role: 'button',
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates(vin + '.control.charge_stop');
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

	async createUserStates(id) {
		/*
		await this.setObjectNotExistsAsync(charger vin + '.control.charge_stop', {
			type: 'state',
			common: {
				name: 'Stop charging',
				type: 'boolean',
				role: 'button',
				read: true,
				write: true,
			},
			native: {},
		});
		*/
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