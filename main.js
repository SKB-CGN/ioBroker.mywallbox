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
		await this.delObjectAsync('*', { recursive: true });

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
					resolve('');
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
					resolve('');
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
		this.getWallboxToken().then(async (token) => {
			await this.getChargerData(token);
			await this.getExtendedChargerData(token);
		}).catch((error) => {
			this.log.debug(`Error on Polling Interval. Error: ${JSON.stringify(error.message)}`);
		});
	}

	async setApiConnected(status) {
		this.setStateAsync('info.connection', status, true);
	}

	async setNewStates(states) {
		// Folder where to add
		let folder = "";

		// RAW Data
		await this.setStateAsync(charger_id + '.info._rawData', {
			val: JSON.stringify(states),
			ack: true
		});

		// Info States
		for (const key of Object.keys(states)) {
			switch (key) {
				// Info States
				case 'serialNumber':
				case 'uid':
				case 'name':
				case 'status':
				case 'chargerType':
				case 'lastConnection':
					folder = "info";

					/* Additional states */
					// lastConnection
					if (key == 'lastConnection') {
						await this.setStateChangedAsync(`${charger_id}.info.lastSyncDT`, {
							val: this.getDateTime(states.lastConnection * 1000),
							ack: true
						});
					}

					// Car Connected
					if (key == 'status') {
						await this.setStateChangedAsync(`${charger_id}.info.car_connected`, {
							val: ![161, 163, 166].includes(states.status) ? true : false,
							ack: true
						});
					}
					break;

				// Charging States
				case 'stateOfCharge':
				case 'maxChgCurrent':
				case 'maxAvailableCurrent':
				case 'maxChargingCurrent':
				case 'chargerLoadName':
				case 'chargerLoadId':
				case 'chargingType':
				case 'connectorType':
					folder = "charging";

					/* Additional states */
					if (key == 'maxChargingCurrent') {
						await this.setStateChangedAsync(`${charger_id}.control.maxChargingCurrent`, {
							val: states.maxChargingCurrent,
							ack: true
						});
					}
					break;

				// Connection States
				case 'ocppConnectionStatus':
				case 'ocppReady':
				case 'wifiSignal':
				case 'connectionType':
				case 'protocolCommunication':
					folder = "connection";
					break;

				// Mid States
				case 'midEnabled':
				case 'midMargin':
				case 'midMarginUnit':
				case 'midSerialNumber':
				case 'midStatus':
					folder = "connection.mid";
					break;

				// Charging Data
				case 'resume':
					folder = "";
					for (const _key of Object.keys(states['resume'])) {
						await this.setStateChangedAsync(`${charger_id}.chargingData.monthly.${_key}`, {
							val: isNaN(states['resume'][_key]) ? states['resume'][_key] : parseInt(states['resume'][_key]),
							ack: true
						});
					}
					break;

				// Locked Details
				case 'locked':
					folder = "control";
					break;

				default:
					folder = "";
					break;
			}

			// Set the proper state
			if (folder != "") {
				this.log.debug(`Setting: ${charger_id}.${folder}.${key} with ${states[key]}`);
				await this.setStateAsync(`${charger_id}.${folder}.${key}`, {
					val: states[key],
					ack: true
				});
			}
		}
	}

	async setNewExtendedStates(states) {
		// Folder where to add
		let folder = "";
		let state = "";

		// RAW Data
		await this.setStateChangedAsync(`${charger_id}.info._rawDataExtended`, {
			val: JSON.stringify(states),
			ack: true
		});

		for (const key of Object.keys(states)) {
			switch (key) {
				// Charging Details
				case 'charging_speed':
				case 'charging_power':
				case 'finished':
				case 'charging_time':
					folder = "charging";
					state = states[key];
					break;

				// Session Details
				case 'added_energy':
				case 'added_range':
					folder = "chargingData.last_session";
					state = key == 'added_energy' ? states.added_energy * 1000 : states[key];
					break;

				// Info Details
				case 'config_data':
					folder = "";
					state = "";
					break;

				default:
					folder = "";
					break;
			}

			// Set the proper state
			if (folder != "" && state != "") {
				this.log.debug(`Setting: ${charger_id}.${folder}.${key} with ${states[key]}`);
				await this.setStateAsync(`${charger_id}.${folder}.${key}`, {
					val: state,
					ack: true
				});
			}

		}

		// Sometimes chargerData is not delivered - prevent crash with checking of existence
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
		for (const key of Object.keys(adapterStates.states)) {
			for (const _key of Object.keys(adapterStates.states[key])) {
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