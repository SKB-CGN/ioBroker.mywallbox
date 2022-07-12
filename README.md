![Logo](admin/wallbox.png)

# ioBroker.wallbox


[![NPM version](https://img.shields.io/npm/v/iobroker.wallbox?style=flat-square)](https://www.npmjs.com/package/iobroker.wallbox)
[![Downloads](https://img.shields.io/npm/dm/iobroker.wallbox.svg)](https://www.npmjs.com/package/iobroker.wallbox)
![Number of Installations](https://iobroker.live/badges/wallbox-installed.svg)

![GitHub](https://img.shields.io/github/license/SKB-CGN/iobroker.wallbox?style=flat-square)
![GitHub repo size](https://img.shields.io/github/repo-size/SKB-CGN/iobroker.wallbox?logo=github&style=flat-square)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/SKB-CGN/iobroker.wallbox?logo=github&style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/SKB-CGN/iobroker.wallbox?logo=github&style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/SKB-CGN/iobroker.wallbox?logo=github&style=flat-square)

[![NPM](https://nodei.co/npm/iobroker.wallbox.png?downloads=true)](https://nodei.co/npm/iobroker.wallbox/)

**Tests:** ![Test and Release](https://github.com/SKB-CGN/ioBroker.wallbox/workflows/Test%20and%20Release/badge.svg)

## wallbox adapter for ioBroker

Connect your Wallbox (e.g. Pulsar Plus) with ioBroker

## Installation
Installation ueber die Github Katze in ioBroker moeglich
## Control
All states under "wallbox.[instance].SerialNumber.control" are writeable and can be used to control the Wallbox
## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 0.0.10 (2022-07-12)
- fixed crash, if token has different format

### 0.0.8 (2022-07-06)
- redefined password store (now password is saved securely)

### 0.0.6 (2022-07-04)
- added new states including price-calculation

### 0.0.5 (2022-07-01)
- Added extended Wallbox informations (like lock-status, charging-power and charging-time)

### 0.0.4 (2022-06-29)
- Login corrected

### 0.0.3 (2022-06-29)
- added some files

### 0.0.2 (2022-06-29)
* initial release

## License
MIT License

Copyright (c) 2022 SKB <info@skb-web.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
