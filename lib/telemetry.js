// See the logging section here:
// http://wiki.bitcraze.se/projects:crazyflie:pc_utils:pylib

var
	_           = require('lodash'),
	events      = require('events'),
	util        = require('util'),
	P           = require('p-promise'),
	Crazypacket = require('./crazypacket')
	;

function Telemetry(driver)
{
	events.EventEmitter.call(this);

	this.total = 0;
	this.tableOfContents = {};
	this.CRC = null;
	this.driver = driver;
}
util.inherits(Telemetry, events.EventEmitter);

Telemetry.prototype.handlePacket = function(packet)
{
	switch (packet.channel)
	{
	case Crazypacket.Channels.TOC:
		if (packet.payload[0] === Crazypacket.Commands.GET_ELEMENT)
			this.handleTOCElement(packet.payload);
		else
			this.handleTOCInfo(packet.payload);
		break;

	case Crazypacket.Channels.SETTINGS:
		this.handleSettings(packet.payload);
		break;

	case Crazypacket.Channels.LOGDATA:
		this.handleData(packet.payload);
		break;

	default:
		// log it
		break;
	}
};

Telemetry.prototype.handleTOCElement = function(payload)
{
	if (payload.length < 2)
		return;
/*
0	 0x00 to identify the command
1	 The ID of the next variable to fetch. If ID == 0xFF no more items are available.
2	 Variable ID
3	 Type (ref to variable type?)
4-n	 Null terminated string containing group name
n-m	 Null terminated string containing variable name
*/

	var ptr = 1;
	// var next = payload[1];
	var item = new TelemetryDatum();
	item.id = payload[ptr++];
	item.type = payload[ptr++];

	var start = ptr;
	while (payload[ptr] !== 0x00)
		ptr++;
	item.group = payload.slice(start, ptr).toString();

	start = ++ptr;
	while (payload[ptr] !== 0x00)
		ptr++;
	item.name = payload.slice(start, ptr).toString();

	item.fullname = item.group + '.' + item.name;
	console.log(item);
	this.tableOfContents[item.fullname] = item;

	if (item.id < this.total)
		this.driver.requestTelemetryElement(item.id + 1);
};

Telemetry.prototype.handleTOCInfo = function(payload)
{
	this.total = payload[1];
	this.CRC = payload.slice(2);
	console.log('we think there are ' + this.total + ' telemetry items; requesting the first');
	this.driver.requestTelemetryElement(0);
};

Telemetry.prototype.handleSettings = function(payload)
{
	console.log('handleSettings', payload);

};

Telemetry.prototype.handleData = function(payload)
{
	console.log('handleData', payload);

};

function TelemetryDatum()
{
	this.id = null;
	this.type = null;
	this.group = '';
	this.name = '';
	this.fullname = '';
}


module.exports = Telemetry;
