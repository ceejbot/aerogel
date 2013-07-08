// Parameters, aka Crazyflie copter settings.

var
	_           = require('lodash'),
	events      = require('events'),
	util        = require('util'),
	P           = require('p-promise'),
	Crazypacket = require('./crazypacket')
	;

var DataTypes =
{
	1: 'uint8_t',
	2: 'uint16_t',
	3: 'uint32_t',
	4: 'int8_t',
	5: 'int16_t',
	6: 'int32_t',
	7: 'float32',
	8: 'float16'
};

function Parameters(driver)
{
	events.EventEmitter.call(this);

	this.driver    = driver;
	this.total     = 0;
	this.variables = {};
	this.CRC       = null;
	this.deferreds = [];
}
util.inherits(Parameters, events.EventEmitter);

Parameters.prototype.all = function()
{
	// TODO: return a hash of all params & values
};

Parameters.prototype.get = function(name)
{
	if (this.variables[name])
		return P(this.variables[name].value);

	/* TODO fetch it from the copter
		sketch:
		make a deferred array for this name if one doesn't exist
		add a new deferred to the array
		fire off a parameter request
		when that parameter comes back in, resolve all the deferreds in its list
		with the new value
	*/
};

Parameters.prototype.set = function(name, value)
{
	// TODO: set the value of a single parameter
	// resolve the promise when the ack has returned
};

Parameters.prototype.handlePacket = function(packet)
{
	switch (packet.channel)
	{
	case Crazypacket.Channels.PARAM_TOC:
		if (packet.payload[0] === Crazypacket.Commands.GET_ELEMENT)
			this.handleTOCElement(packet.payload);
		else
			this.handleTOCInfo(packet.payload);
		break;

	case Crazypacket.Channels.PARAM_READ:
		this.handleRead(packet.payload);
		break;

	case Crazypacket.Channels.PARAM_WRITE:
		this.handleWrite(packet.payload);
		break;

	default:
		console.log('unhandled packet', packet.header, packet.payload);
		break;
	}
};

// Refactoring opportunity: this is exactly parallel to the telemetry pattern.

Parameters.prototype.handleTOCElement = function(payload)
{
	if (payload.length < 2)
		return;

	var ptr = 1;
	// var next = payload[1];
	var item = new Parameter();
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
	// console.log('telemetry variable: ' + item.fullname, item.id, item.type);
	this.variables[item.fullname] = item;

	if (item.id < this.total)
		this.driver.requestParameter(item.id + 1);
};

Parameters.prototype.handleTOCInfo = function(payload)
{
	this.total = payload[1];
	this.CRC   = payload.slice(2);
	this.driver.requestTelemetryElement(0);
};


function Parameter()
{
	this.id       = null;
	this.type     = null;
	this.group    = '';
	this.name     = '';
	this.fullname = '';
	this.readonly = false;
}

