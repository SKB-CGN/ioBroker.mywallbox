'use strict';

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios');

// States
const adapterStates = require('./lib/states.js');

// Variables
let password;
let email;
let poll_time;
let charger_id;
let charger_data;
let conn_timeout;
const adapterIntervals = {
	readAllStates: undefined,
	controlCharger: undefined,
	changeChargerData: undefined
};

const BASEURL = 'https://api.wall-box.com/';
const URL_AUTHENTICATION = 'auth/token/user';
const URL_CHARGER = 'v2/charger/';
const URL_CHARGER_CONTROL = 'v3/chargers/';
const URL_CHARGER_ACTION = '/remote-action';
const URL_STATUS = 'chargers/status/';

class MyWallbox extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'mywallbox',
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
		poll_time = this.config.poll_time || 30;
		// Min Poll 30 Sec.
		poll_time = poll_time < 30 ? 30 : poll_time;
		// Max Poll 600 Sec.
		poll_time = poll_time > 600 ? 600 : poll_time;
		charger_id = this.config.charger_id;
		password = this.config.password;
		conn_timeout = (poll_time * 1000) - 5000;

		if (email == '' || this.config.password == '') {
			this.log.error('No Email and/or password set. Please review adapter config!');
		} else {
			// Log into Wallbox Account
			this.log.info('Logging into My-Wallbox-API');

			// Login and create the states after confirm
			this.getWallboxToken().then(async (response) => {
				await this.createStates(charger_id);

				// Activate Polling Timer
				adapterIntervals.readAllStates = this.setInterval(() => {
					this.requestPolling();
				}, poll_time * 1000);
				this.log.info(`Polling activated with an interval of ${poll_time} seconds! Timeout for connection to API is set to ${conn_timeout}ms!`);

				// Request Poll
				await this.requestPolling();
			}).catch((error) => {
				this.log.debug(`Error on first Poll. Error: ${JSON.stringify(error)}`);
			});
		}
		await this.subscribeStatesAsync('*');
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.setState('info.connection', false, true);
			clearInterval(adapterIntervals.readAllStates);
			clearTimeout(adapterIntervals.controlCharger);
			clearTimeout(adapterIntervals.changeChargerData)
			this.log.info('Adapter My-Wallbox cleaned up everything...');
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
		if (id && state) {
			// The state was changed
			if (!state.ack) {
				this.log.debug('New Event for state: ' + JSON.stringify(state));
				this.log.debug('ID: ' + JSON.stringify(id));
				const tmpControl = id.split('.')[4];
				this.getWallboxToken().then(async (token) => {
					switch (tmpControl) {
						case 'name':
							this.log.info('Requesting to change the name of the Wallbox');
							this.changeChargerData(token, JSON.stringify({ name: state.val }))
								.then(async (response) => {
									this.log.info(JSON.stringify(response));
								})
								.catch((error) => {
									this.log.warn(`Error on changing the name of the Wallbox: ${JSON.stringify(error.message)}`);
								});
							break;

						case 'locked':
							if (state.val === 1 || state.val === 0) {
								if (state.val === 1) {
									this.log.info('Requesting to lock the Wallbox');
								}
								if (state.val === 0) {
									this.log.info('Requesting to unlock the Wallbox');
								}
								this.changeChargerData(token, JSON.stringify({ locked: state.val }))
									.then(async (response) => {
										this.log.info(response);
									})
									.catch((error) => {
										this.log.warn(`Error on (un)locking the Wallbox: ${JSON.stringify(error.message)}`);
									});
							} else {
								this.log.warn('Invalid Value for locking/unlocking. States should be: Lock:1 | Unlock: 0!');
							}
							break;

						case 'maxChargingCurrent':
							this.log.info('Requesting to change the Charge current for Wallbox to ' + state.val + ' A');
							this.changeChargerData(token, JSON.stringify({ maxChargingCurrent: state.val }))
								.then(async (response) => {
									this.log.info(response);
								})
								.catch((error) => {
									this.log.warn(`Error on Charging current: ${JSON.stringify(error.message)}`);
								});
							break;

						case 'pause':
							if (state.val === true) {
								this.log.info('Requesting to set the Wallbox into Pause-Mode!');
								this.controlCharger(token, JSON.stringify({ action: 2 }))
									.then(async (response) => {
										this.log.info(response);
									})
									.catch((error) => {
										this.log.warn(`Error on controling the Wallbox: ${JSON.stringify(error.message)}`);
									});
							}
							break;

						case 'resume':
							if (state.val === true) {
								this.log.info('Requesting to set the Wallbox into Resume-Mode!');
								this.controlCharger(token, JSON.stringify({ action: 1 }))
									.then(async (response) => {
										this.log.info(response);
									})
									.catch((error) => {
										this.log.warn(`Error on controling the Wallbox: ${JSON.stringify(error.message)}`);
									});
							}
							break;

						case 'reboot':
							if (state.val === true) {
								this.log.info('Requesting to reboot the Wallbox!');
								this.controlCharger(token, JSON.stringify({ action: 3 }))
									.then(async (response) => {
										this.log.info(response);
									})
									.catch((error) => {
										this.log.warn(`Error on controling the Wallbox: ${JSON.stringify(error.message)}`);
									});
							}
							break;

						case 'factory':
							if (state.val === true) {
								this.log.info('Requesting to factory-reset the Wallbox!');
								this.controlCharger(token, JSON.stringify({ action: 4 }))
									.then(async (response) => {
										this.log.info(response);
									})
									.catch((error) => {
										this.log.warn(`Error on controling the Wallbox: ${JSON.stringify(error.message)}`);
									});
							}
							break;

						case 'update':
							if (state.val === true) {
								this.log.info('Requesting to Update the software of the Wallbox!');
								this.controlCharger(token, JSON.stringify({ action: 5 }))
									.then(async (response) => {
										this.log.info(response);
									})
									.catch((error) => {
										this.log.warn(`Error on controling the Wallbox: ${JSON.stringify(error.message)}`);
									});
							}
							break;
					}
				}).catch((error) => {
					this.log.warn(`Error on Wallbox Control. Error: ${JSON.stringify(error.message)}`);
				});

			}
		}
	}

	async getWallboxToken() {
		return new Promise((resolve, reject) => {
			this.log.silly("Email: " + email + " | Password: " + password);
			axios({
				url: BASEURL + URL_AUTHENTICATION,
				timeout: conn_timeout,
				method: 'POST',
				headers: {
					'Authorization': 'Basic ' + Buffer.from(email + ":" + password).toString('base64'),
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				}
			})
				.then((response) => {
					this.log.debug(`Got token: ${JSON.stringify(response.data.jwt)}`);
					this.setApiConnected(true);
					resolve(response.data.jwt);
				})
				.catch((error) => {
					this.log.warn(`Error while getting Token from My-Wallbox-API. Error: ${JSON.stringify(error.message)}`);
					this.setApiConnected(false);
					reject(error);
				});
		});
	}

	async getChargerData(token) {
		return new Promise((resolve, reject) => {
			axios({
				url: BASEURL + URL_CHARGER + charger_id,
				timeout: conn_timeout,
				method: 'PUT',
				headers: {
					'Authorization': 'Bearer ' + token,
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				}
			})
				.then((response) => {
					charger_data = response.data.data.chargerData;
					this.log.debug(`New Data: ${JSON.stringify(response.data.data.chargerData)}`);
					this.setNewStates(response.data.data.chargerData);
					resolve(response.data.data.chargerData);
				})
				.catch((error) => {
					this.log.warn(`Error while receiving new Data from My-Wallbox-API. Error: ${JSON.stringify(error.message)}`);
					reject(error);
				});
		});
	}

	async getExtendedChargerData(token) {
		return new Promise((resolve, reject) => {
			axios({
				url: BASEURL + URL_STATUS + charger_id,
				timeout: conn_timeout,
				method: 'GET',
				headers: {
					'Authorization': 'Bearer ' + token,
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				}
			})
				.then((response) => {
					this.log.debug(`Extended Data: ${JSON.stringify(response.data)}`);
					this.setNewExtendedStates(response.data);
					resolve(response.data);
				})
				.catch((error) => {
					this.log.warn(`Error while receiving new extended-Data from My-Wallbox-API. Error: ${JSON.stringify(error.message)}`);
					reject(error);
				});
		});
	}

	async changeChargerData(token, data) {
		return new Promise((resolve, reject) => {
			axios({
				url: BASEURL + URL_CHARGER + charger_id,
				timeout: conn_timeout,
				method: 'PUT',
				headers: {
					'Authorization': 'Bearer ' + token,
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				},
				data: data
			})
				.then((response) => {
					this.log.debug(`Changed Data: ${JSON.stringify(response.data.data.chargerData)}`);
					this.setNewStates(response.data.data.chargerData);
					resolve('Success');
				})
				.catch((error => {
					reject(error);
				}));
		});
	}

	async controlCharger(token, data) {
		return new Promise((resolve, reject) => {
			axios({
				url: BASEURL + URL_CHARGER_CONTROL + charger_id + URL_CHARGER_ACTION,
				timeout: conn_timeout,
				method: 'POST',
				headers: {
					'Authorization': 'Bearer ' + token,
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				},
				data: data
			})
				.then((response) => {
					this.log.debug(`Changed Data: ${JSON.stringify(response.data)}`);
					resolve('Success');
				})
				.catch((error => {
					reject(error);
				}));
		});
	}

	async requestPolling() {
		this.getWallboxToken().then(async (response) => {
			await this.getChargerData(response);
			await this.getExtendedChargerData(response);
		}).catch((error) => {
			this.log.debug(`Error on Polling Interval. Error: ${JSON.stringify(error.message)}`);
		});
	}

	async setApiConnected(status) {
		this.setStateAsync('info.connection', status, true);
	}

	async setNewStates(states) {
		// RAW Data
		await this.setStateAsync(charger_id + '.info._rawData', {
			val: JSON.stringify(states),
			ack: true
		});

		// Info States
		await this.setStateAsync(charger_id + '.info.serialNumber', {
			val: states.serialNumber,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.uid', {
			val: states.uid,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.name', {
			val: states.name,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.type', {
			val: states.chargerType,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.lastSync', {
			val: states.lastConnection,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.lastSyncDT', {
			val: this.getDateTime(states.lastConnection * 1000),
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.powerSharingStatus', {
			val: states.powerSharingStatus,
			ack: true
		});
		await this.setStateAsync(charger_id + '.info.status', {
			val: states.status,
			ack: true
		});

		// Charging States
		await this.setStateAsync(charger_id + '.charging.stateOfCharge', {
			val: states.stateOfCharge,
			ack: true
		});
		await this.setStateAsync(charger_id + '.charging.maxChgCurrent', {
			val: states.maxChgCurrent,
			ack: true
		});
		await this.setStateAsync(charger_id + '.charging.maxAvailableCurrent', {
			val: states.maxAvailableCurrent,
			ack: true
		});
		await this.setStateAsync(charger_id + '.charging.maxChargingCurrent', {
			val: states.maxChargingCurrent,
			ack: true
		});
		await this.setStateAsync(charger_id + '.control.maxChargingCurrent', {
			val: states.maxChargingCurrent,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.chargerLoadName', {
			val: states.chargerLoadName,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.chargerLoadId', {
			val: states.chargerLoadId,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.chargingType', {
			val: states.chargingType,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.connectorType', {
			val: states.connectorType,
			ack: true
		});

		// Connection States

		await this.setStateAsync(charger_id + '.connection.ocppConnectionStatus', {
			val: states.ocppConnectionStatus,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.ocppReady', {
			val: states.ocppReady,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.wifiSignal', {
			val: states.wifiSignal,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.connectionType', {
			val: states.connectionType,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.protocolCommunication', {
			val: states.protocolCommunication,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.mid.midEnabled', {
			val: states.midEnabled,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.mid.midMargin', {
			val: states.midMargin,
			ack: true
		});

		await this.setStateAsync(charger_id + '.connection.mid.midMarginUnit', {
			val: states.midMarginUnit,
			ack: true
		});
		await this.setStateAsync(charger_id + '.connection.mid.midSerialNumber', {
			val: states.midSerialNumber,
			ack: true
		});
		await this.setStateAsync(charger_id + '.connection.mid.midStatus', {
			val: states.midStatus,
			ack: true
		});

		// Sessions

		await this.setStateAsync(charger_id + '.chargingData.monthly.totalUsers', {
			val: states.resume.totalUsers,
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.totalSessions', {
			val: states.resume.totalSessions,
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.chargingTime', {
			val: parseInt(states.resume.chargingTime),
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.totalEnergy', {
			val: parseInt(states.resume.totalEnergy),
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.totalMidEnergy', {
			val: parseInt(states.resume.totalMidEnergy),
			ack: true
		});

		await this.setStateAsync(charger_id + '.chargingData.monthly.energyUnit', {
			val: states.resume.energyUnit,
			ack: true
		});

		// Control

		await this.setStateAsync(charger_id + '.control.locked', {
			val: states.locked,
			ack: true
		});
	}

	async setNewExtendedStates(states) {
		// RAW Data
		await this.setStateAsync(charger_id + '.info._rawDataExtended', {
			val: JSON.stringify(states),
			ack: true
		});

		// Charging Details

		await this.setStateAsync(charger_id + '.charging.charging_speed', {
			val: states.charging_speed,
			ack: true
		});

		await this.setStateAsync(charger_id + '.charging.charging_power', {
			val: states.charging_power,
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

		// Somtimes chargerData is not delivered - prevent crash with checking of existence
		if (charger_data !== undefined) {
			if (charger_data.hasOwnProperty('resume')) {
				await this.setStateAsync(charger_id + '.chargingData.monthly.cost', {
					val: parseFloat(((charger_data.resume.totalEnergy * states.depot_price) / 1000).toFixed(2)),
					ack: true
				});
			}
		}

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

	async createStates(charger) {
		// Info States
		for (var key of Object.keys(adapterStates.states)) {
			for (var _key of Object.keys(adapterStates.states[key])) {
				this.log.debug(`Creating Object '${_key}' and common: ${JSON.stringify(adapterStates.states[key][_key].common)}`);
				await this.setObjectNotExistsAsync(`${charger}.${key}.${_key}`, {
					type: 'state',
					common: adapterStates.states[key][_key].common,
					native: {},
				});
			}
		}
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
	module.exports = (options) => new MyWallbox(options);
} else {
	// otherwise start the instance directly
	new MyWallbox();
}