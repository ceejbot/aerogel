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

	this.driver       = driver;
	this.total        = 0;
	this.variables    = {};
	this.idToName     = {};
	this.CRC          = null;
	this.getDeferreds = {};
	this.setDeferreds = {};
}
util.inherits(Parameters, events.EventEmitter);

Parameters.prototype.all = function()
{
	// TODO: return a hash of all params & values
	return this.variables;
};

Parameters.prototype.get = function(name)
{
	if (this.variables[name])
		return this.variables[name].value;
};

Parameters.prototype.update = function(name)
{
	var deferred = P.defer();

	if (!this.variables[name])
	{
		deferred.reject(new Error('unknown parameter: ' + name));
		return deferred.promise;
	}

	if (!this.getDeferreds[name])
		this.getDeferreds[name] = [];
	this.getDeferreds[name].push(deferred);

	var parameter = this.variables[name];
	this.driver.getParameter(parameter.id);

	return deferred.promise;
};

Parameters.prototype.set = function(name, value)
{
	var deferred = P.defer();

	if (!this.variables[name])
	{
		deferred.reject(new Error('unknown parameter: ' + name));
		return deferred.promise;
	}

	if (!this.setDeferreds[name])
		this.setDeferreds[name] = [];
	this.setDeferreds[name].push(deferred);

	var parameter = this.variables[name];
	this.driver.setParameter(parameter, value);

	return deferred.promise;
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

Parameters.prototype.handleRead = function(payload)
{
	var id = payload[0];
	var name = this.idToName[id];
	if (!name)
	{
		console.log('cannot find param for id ' + id);
		return;
	}

	var param = this.variables[name];
	param.value = Crazypacket.readType(payload, param.type, 1);

	var deferreds = this.setDeferreds[name];
	for (var i = 0; i < deferreds.length; i++)
		deferreds[i].resolve(param.value);
	this.setDeferreds[name] = [];
};

Parameters.prototype.handleWrite = function(payload)
{
	var id = payload[0];
	var name = this.idToName[id];
	var param = this.variables[name];

	var deferreds = this.setDeferreds[name];
	for (var i = 0; i < deferreds.length; i++)
		deferreds[i].resolve(param.value);
	this.setDeferreds[name] = [];
};

// Refactoring opportunity: this is exactly parallel to the telemetry pattern.

Parameters.prototype.handleTOCElement = function(payload)
{
	if (payload.length < 2)
		return;

	var ptr = 1;
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
	this.variables[item.name] = item;
	this.nameToID[item.id] = item.name;

	if (item.id < this.total)
		this.driver.requestParameter(item.id + 1);
};

Parameters.prototype.handleTOCInfo = function(payload)
{
	this.total = payload[1];
	this.CRC   = payload.slice(2);
	this.driver.requestParameter(0);
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

