// Parameters, aka Crazyflie copter settings.

var
	_           = require('lodash'),
	events      = require('events'),
	util        = require('util'),
	P           = require('p-promise'),
	Crazypacket = require('./crazypacket'),
	Protocol    = require('./protocol')
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

var Parameters = module.exports = function Parameters(driver)
{
	events.EventEmitter.call(this);

	this.driver       = driver;
	this.total        = 0;
	this.variables    = {};
	this.idToName     = {};
	this.CRC          = null;
	this.getDeferreds = {};
	this.setDeferreds = {};
};
util.inherits(Parameters, events.EventEmitter);

Parameters.prototype.all = function()
{
	// TODO: return a hash of all params & values
	return this.variables;
};

Parameters.prototype.get = function(name)
{
	if (!this.variables[name])
		return P('unknown');

	var param = this.variables[name];
	if (!_.isUndefined(param.value))
		return P(param.value);

	return this.update(name);
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

	console.log('requesting value for param', name);
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
	case Protocol.Channels.PARAM_TOC:
		if (packet.payload[0] === Protocol.Commands.GET_ELEMENT)
			this.handleTOCElement(packet.payload);
		else
			this.handleTOCInfo(packet.payload);
		break;

	case Protocol.Channels.PARAM_READ:
		this.handleRead(packet.payload);
		break;

	case Protocol.Channels.PARAM_WRITE:
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
		return;

	var param = this.variables[name];
	if (!param)
		return;

	param.value = Crazypacket.readType(payload, DataTypes[param.type], 1);

	var deferreds = this.getDeferreds[name];
	if (!deferreds)
		return;

	for (var i = 0; i < deferreds.length; i++)
		deferreds[i].resolve(param.value);
	this.getDeferreds[name] = [];
};

Parameters.prototype.handleWrite = function(payload)
{
	var id = payload[0];
	var name = this.idToName[id];
	var param = this.variables[name];

	var deferreds = this.setDeferreds[name];
	if (!deferreds)
		return;

	for (var i = 0; i < deferreds.length; i++)
		deferreds[i].resolve(param.value);
	this.setDeferreds[name] = [];
};

Parameters.prototype.handleTOCElement = function(payload)
{
	if (payload.length < 2)
		return;

	var item = new Parameter();
	item.read(payload);

	this.variables[item.fullname] = item;
	this.idToName[item.id] = item.fullname;

	if (item.id < this.total)
		this.driver.requestParameter(item.id + 1);
	else
		this.driver.parametersDone();
};

Parameters.prototype.handleTOCInfo = function(payload)
{
	this.total = payload[1] - 1;
	this.CRC = payload.readUInt16LE(2);
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

Parameter.prototype.read = function(payload)
{
	var ptr = 1;
	this.id = payload[ptr++];
	this.type = payload[ptr++];

	var start = ptr;
	while (payload[ptr] !== 0x00)
		ptr++;
	this.group = payload.slice(start, ptr).toString();

	start = ++ptr;
	while (payload[ptr] !== 0x00)
		ptr++;
	this.name = payload.slice(start, ptr).toString();

	this.fullname = this.group + '.' + this.name;
};

