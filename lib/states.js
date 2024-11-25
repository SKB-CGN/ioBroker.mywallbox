'use strict';

const folder = {
    charging: {
        _id: "charging",
        common: {
            desc: "Details about charging",
            name: "Charging Details"
        }
    },
    chargingData: {
        _id: "chargingData",
        common: {
            desc: "Details about charging history",
            name: "Charging History"
        }
    },
    "chargingData.last_session": {
        _id: "chargingData.last_session",
        common: {
            name: "Last Session"
        }
    },
    "chargingData.monthly": {
        _id: "chargingData.last_session",
        common: {
            name: "Monthly"
        }
    },
    connection: {
        _id: "connection",
        common: {
            desc: "Details about the connection",
            name: "Connection"
        }
    },
    "connection.mid": {
        _id: "connection.mid",
        common: {
            name: "MID"
        }
    },
    control: {
        _id: "control",
        common: {
            desc: "States for controlling your Wallbox",
            name: "Control"
        }
    },
    info: {
        _id: "info",
        common: {
            desc: "General Information States",
            name: "Info"
        }
    },
    "info.lock": {
        _id: "info.lock",
        common: {
            name: "Lock"
        }
    },
    "info.software": {
        _id: "info.software",
        common: {
            name: "Software"
        }
    },
}

const states = {
    info: {
        serialNumber: {
            common: {
                name: 'Serialnumber of the Wallbox',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        uid: {
            common: {
                name: 'UID',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        name: {
            common: {
                name: 'Name of the Wallbox',
                type: 'string',
                role: 'state',
                read: true,
                write: true,
            }
        },
        chargerType: {
            common: {
                name: 'Type of the Wallbox',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        lastConnection: {
            common: {
                name: 'Last Synchronisation with Portal',
                type: 'number',
                role: 'date',
                read: true,
                write: false,
            }
        },
        lastSyncDT: {
            common: {
                name: 'Last Synchronisation with Portal (Date&Time)',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        powerSharingStatus: {
            common: {
                name: 'Status of Power-Sharing',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            }
        },
        car_connected: {
            common: {
                name: 'Car connected to the Wallbox',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            }
        },
        status: {
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
            }
        },
        'software.currentVersion': {
            common: {
                name: 'Current Version of the Wallbox',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        'software.latestVersion': {
            common: {
                name: 'Latest available Software of the Wallbox',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        'software.updateAvailable': {
            common: {
                name: 'Software-Update available',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            }
        },
        'lock.auto_lock': {
            common: {
                name: 'Auto-Lock',
                type: 'number',
                states: {
                    0: "Disabled",
                    1: "Enabled"
                },
                role: 'indicator',
                read: true,
                write: false,
            }
        },
        'lock.auto_lock_time': {
            common: {
                name: 'Auto-Lock after x seconds',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                unit: 's',
            }
        },
        '_rawData': {
            common: {
                name: 'RAW Data of the Wallbox',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
            }
        },
        '_rawDataExtended': {
            common: {
                name: 'RAW Data (Extended) of the Wallbox',
                type: 'string',
                role: 'json',
                read: true,
                write: false,
            }
        }
    },
    charging: {
        stateOfCharge: {
            common: {
                name: 'State of Charging',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            }
        },
        finished: {
            common: {
                name: 'Charging finished',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            }
        },
        maxChgCurrent: {
            common: {
                name: 'Max. charging Current (Control State)',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                unit: 'A',
            }
        },
        maxAvailableCurrent: {
            common: {
                name: 'maximum Available Current from Wallbox',
                type: 'number',
                role: 'value.current',
                read: true,
                write: false,
                unit: 'A',
            }
        },
        maxChargingCurrent: {
            common: {
                name: 'Max. charging Current',
                type: 'number',
                role: 'value.current',
                read: true,
                write: false,
                unit: 'A',
            }
        },
        chargerLoadName: {
            common: {
                name: 'Charger Load Name',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        chargerLoadId: {
            common: {
                name: 'Charger Load ID',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        },
        chargingType: {
            common: {
                name: 'Voltage Type',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        connectorType: {
            common: {
                name: 'Connector Type',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        'charging_speed': {
            common: {
                name: 'Charging Speed',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        },
        'charging_power': {
            common: {
                name: 'Charging Power',
                type: 'number',
                role: 'value.power.active',
                unit: "W",
                read: true,
                write: false,
            }
        },
        'charging_time': {
            common: {
                name: 'Time charger connected to the car',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        }
    },
    chargingData: {
        'monthly.totalUsers': {
            common: {
                name: 'Monthly Users',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        },
        'monthly.totalSessions': {
            common: {
                name: 'Monthly Sessions',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        },
        'monthly.chargingTime': {
            common: {
                name: 'Monthly Charging Time in seconds',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        },
        'monthly.totalEnergy': {
            common: {
                name: 'Monthly Energy Charged in Watts',
                type: 'number',
                role: 'value.energy.consumed',
                read: true,
                write: false,
                unit: 'Wh',
            }
        },
        'monthly.totalMidEnergy': {
            common: {
                name: 'Monthly MID Energy Charged in Watts',
                type: 'number',
                role: 'value.energy.consumed',
                read: true,
                write: false,
                unit: 'Wh',
            }
        },
        'monthly.energyUnit': {
            common: {
                name: 'Energy Unit of Portal',
                type: 'string',
                role: 'value',
                read: true,
                write: false,
            }
        },
        'monthly.cost': {
            common: {
                name: 'Cost of Charging for current month',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        },
        'last_session.added_energy': {
            common: {
                name: 'Session addded Energy in Watt-hours',
                type: 'number',
                role: 'value.energy.consumed',
                read: true,
                write: false,
                unit: 'Wh',
            }
        },
        'last_session.added_range': {
            common: {
                name: 'Session addded Range in km',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                unit: 'km',
            }
        },
    },
    control: {
        reboot: {
            common: {
                name: 'Reboot Wallbox',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
            }
        },
        pause: {
            common: {
                name: 'Pause charging',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
            }
        },
        resume: {
            common: {
                name: 'Resume charging',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
            }
        },
        locked: {
            common: {
                name: 'Wallbox locked status',
                type: 'boolean',
                role: "switch",
                read: true,
                write: true,
            }
        },
        update: {
            common: {
                name: 'Update Wallbox to new Software',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
            }
        },
        maxChargingCurrent: {
            common: {
                name: 'Max. charging Current',
                type: 'number',
                role: 'level.current',
                read: false,
                write: true,
                unit: 'A',
            }
        }
    },
    connection: {
        ocppConnectionStatus: {
            common: {
                name: 'OCPP Connection Status',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            }
        },
        ocppReady: {
            common: {
                name: 'OCPP Ready Status',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        connectionType: {
            common: {
                name: 'Type of connection',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        wifiSignal: {
            common: {
                name: 'Strength of Wifi-Signal',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
                unit: '%',
            }
        },
        protocolCommunication: {
            common: {
                name: 'Connection Communication Protocl',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        'mid.midEnabled': {
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
            }
        },
        'mid.midMargin': {
            common: {
                name: 'MID Margin',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        },
        'mid.midMarginUnit': {
            common: {
                name: 'MID Margin Unit',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        },
        'mid.midSerialNumber': {
            common: {
                name: 'MID Serial Number',
                type: 'string',
                role: 'state',
                read: true,
                write: false,
            }
        },
        'mid.midStatus': {
            common: {
                name: 'MID Status',
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            }
        }
    }
}

module.exports = {
    states,
    folder
};