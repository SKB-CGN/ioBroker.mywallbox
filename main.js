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

class MyWallbox extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'mywallbox',
		});
		// Min Poll 30 sec. - Max. 600 sec.
		this.poll_time = 30;
		this.unlock_resume = false;
		this.charger_data = null;
		this.conn_timeout = 25000;
		this.charger_id = undefined;
		this.extended_charger_data = null;
		this.adapterIntervals = {
			readAllStates: undefined
		};

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

		if (this.config.email == '' || this.config.password == '') {
			this.log.error('No Email and/or password set. Please review adapter config!');
		} else {
			// Min Poll 30 sec. - Max. 600 sec.
			this.poll_time = Math.max(30, Math.min(600, this.config.poll_time || 30));
			this.conn_timeout = (this.poll_time * 1000) - 5000;
			this.unlock_resume = this.config.unlock_before_resume || false;
			this.charger_id = this.config.charger_id;
			this.BASEURL = 'https://api.wall-box.com/';
			this.URL_AUTHENTICATION = `${this.BASEURL}auth/token/user`;
			this.URL_CHARGER = `${this.BASEURL}v2/charger/${this.charger_id}`;
			this.URL_CHARGER_CONTROL = `${this.BASEURL}v3/chargers/${this.charger_id}/remote-action`;
			this.URL_STATUS = `${this.BASEURL}chargers/status/${this.charger_id}`;

			// Log into Wallbox Account
			this.log.info('Logging into My-Wallbox-API!');

			// Login and create the states after confirm
			this.getWallboxToken().then(async () => {
				await this.createStates(this.charger_id);

				// Activate Polling Timer
				this.adapterIntervals.readAllStates = this.setInterval(() => {
					this.requestPolling();
				}, this.poll_time * 1000);
				this.log.info('Login successfully!');
				this.log.info(`Polling activated with an interval of ${this.poll_time} seconds! Timeout for connection to API is set to ${this.conn_timeout / 1000} seconds!`);

				// Request Poll
				await this.requestPolling();
				await this.subscribeStatesAsync('*');
			}).catch((error) => {
				this.log.debug(`Error on first Poll. Error: ${JSON.stringify(error)}`);
			});
		}

	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.setState('info.connection', false, true);
			clearInterval(this.adapterIntervals.readAllStates);
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
									this.log.info(`Requesting to ${state.val === 1 ? 'lock' : 'unlock'} the Wallbox`);
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
										if (error.status === 403) {
											this.log.info('Wallbox is already in Pause-Mode!');
										} else {
											this.log.warn(`Error on controling the Wallbox: ${JSON.stringify(error.message)}`);
										}
									});
							}
							break;

						case 'resume':
							if (state.val === true) {
								// Check, if the charger is locked!
								if (this.charger_data.locked === 1) {
									if (this.unlock_resume) {
										this.log.info('Automatic unlocking of the wallbox is enabled. Unlocking wallbox first!');
										await this.changeChargerData(token, JSON.stringify({ locked: 0 }));
										this.log.info('Unlocking done!');
									} else {
										this.log.warn('The wallbox is locked and will not resume! If you want to unlock the charger automatically before, please enable this in the adapter settings!');
										return;
									}
								}

								this.log.info('Requesting to set the Wallbox into Resume-Mode!');

								this.controlCharger(token, JSON.stringify({ action: 1 }))
									.then(async (response) => {
										this.log.info(response);
									})
									.catch((error) => {
										if (error.status === 403) {
											this.log.info('Wallbox is already in Resume-Mode!');
										} else {
											this.log.warn(`Error on controling the Wallbox: ${JSON.stringify(error.message)}`);
										}
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


					// Request new poll
					this.setTimeout(() => {
						this.requestSinglePoll(token);
					}, 5000);
				}).catch((error) => {
					this.log.warn(`Error on Wallbox Control. Error: ${JSON.stringify(error.message)}`);
				});

			}
		}
	}

	async getWallboxToken() {
		return new Promise((resolve, reject) => {
			this.log.silly("Email: " + this.config.email + " | Password: " + this.config.password);
			axios({
				url: this.URL_AUTHENTICATION,
				timeout: this.conn_timeout,
				method: 'POST',
				headers: {
					'Authorization': 'Basic ' + Buffer.from(this.config.email + ":" + this.config.password).toString('base64'),
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
				url: this.URL_CHARGER,
				timeout: this.conn_timeout,
				method: 'PUT',
				headers: {
					'Authorization': 'Bearer ' + token,
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				}
			})
				.then((response) => {
					this.charger_data = response.data.data.chargerData;
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
				url: this.URL_STATUS,
				timeout: this.conn_timeout,
				method: 'GET',
				headers: {
					'Authorization': 'Bearer ' + token,
					'Accept': 'application/json, text/plain, */*',
					'Content-Type': 'application/json;charset=utf-8',
				}
			})
				.then((response) => {
					this.extended_charger_data = response.data;
					this.log.debug(`Extended Data: ${JSON.stringify(response.data)}`);
					this.setNewExtendedStates(response.data);
					resolve('');
				})
				.catch((error) => {
					this.log.warn(`Error while receiving new extended-Data from My-Wallbox-API. Error: ${JSON.stringify(error)}`);
					reject(error);
				});
		});
	}

	async changeChargerData(token, data) {
		return new Promise((resolve, reject) => {
			axios({
				url: this.URL_CHARGER,
				timeout: this.conn_timeout,
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
				url: this.URL_CHARGER_CONTROL,
				timeout: this.conn_timeout,
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

	async requestSinglePoll(token) {
		await this.getChargerData(token);
		await this.getExtendedChargerData(token);
	}

	async setApiConnected(status) {
		this.setStateAsync('info.connection', status, true);
	}

	async setNewStates(states) {
		// Folder where to add
		let folder = "";

		// RAW Data
		await this.setStateAsync(this.charger_id + '.info._rawData', {
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
						await this.setStateAsync(`${this.charger_id}.info.lastSyncDT`, {
							val: this.getDateTime(states.lastConnection * 1000),
							ack: true
						});
					}

					// Car Connected
					if (key == 'status') {

						await this.setStateAsync(`${this.charger_id}.info.car_connected`, {
							/*
							"14": "Error",
							"15": "Error",
							"161": "Ready",
							"162": "Ready",
							"163": "Disconnected",
							"166": "Updating",
							"209": "Locked",
							*/
							val: [14, 15, 161, 162, 163, 166, 209].includes(states.status) ? false : true,
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
						await this.setStateAsync(`${this.charger_id}.control.maxChargingCurrent`, {
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
						await this.setStateAsync(`${this.charger_id}.chargingData.monthly.${_key}`, {
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
				this.log.debug(`Setting: ${this.charger_id}.${folder}.${key} with ${states[key]}`);
				await this.setStateAsync(`${this.charger_id}.${folder}.${key}`, {
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
		await this.setStateAsync(`${this.charger_id}.info._rawDataExtended`, {
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
				this.log.debug(`Setting: ${this.charger_id}.${folder}.${key} with ${states[key]}`);
				await this.setStateAsync(`${this.charger_id}.${folder}.${key}`, {
					val: state,
					ack: true
				});
			}

		}

		// Sometimes chargerData is not delivered - prevent crash with checking of existence
		if (this.charger_data !== undefined) {
			if (this.charger_data.hasOwnProperty('resume')) {
				await this.setStateAsync(this.charger_id + '.chargingData.monthly.cost', {
					val: parseFloat(((this.charger_data.resume.totalEnergy * states.depot_price) / 1000).toFixed(2)),
					ack: true
				});
			}
		}

		await this.setStateAsync(this.charger_id + '.info.software.currentVersion', {
			val: states.config_data.software.currentVersion,
			ack: true
		});

		await this.setStateAsync(this.charger_id + '.info.software.latestVersion', {
			val: states.config_data.software.latestVersion,
			ack: true
		});

		await this.setStateAsync(this.charger_id + '.info.software.updateAvailable', {
			val: states.config_data.software.updateAvailable,
			ack: true
		});

		await this.setStateAsync(this.charger_id + '.info.lock.auto_lock', {
			val: states.config_data.auto_lock,
			ack: true
		});

		await this.setStateAsync(this.charger_id + '.info.lock.auto_lock_time', {
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