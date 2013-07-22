// Crazy Real Time Protocol Driver
// This module knows how to format messages for the crazy radio and the copter.
// There's some repetition because the emphasis is on provding a clear, readable
// API to higher levels.

var
	_           = require('lodash'),
	events      = require('events'),
	url         = require('url'),
	util        = require('util'),
	P           = require('p-promise'),
	Crazyradio  = require('./crazyradio'),
	Crazypacket = require('./crazypacket'),
	Parameters  = require('./parameters'),
	Protocol    = require('./protocol'),
	Telemetry   = require('./telemetry')
	;

var CrazyDriver = module.exports = function CrazyDriver(name)
{
	events.EventEmitter.call(this);

	this.uri      = '';
	this.channel  = 2;
	this.datarate = 2;
	this.telemetry = new Telemetry(this);
	this.parameters = new Parameters(this);
};
util.inherits(CrazyDriver, events.EventEmitter);

CrazyDriver.prototype.findCopters = function()
{
	var self = this;
	self.radio = new Crazyradio();

	var results;

	return self.radio.setupRadio()
	.then(function() { return self.radio.setAckRetryCount(1); })
	.then(function() { return self.scanAtRate(0); })
	.then(function(res1)
	{
		results = res1;
	})
	.then(function() { return self.scanAtRate(1); })
	.then(function(res2)
	{
		results = results.concat(res2);
	})
	.then(function() { return self.scanAtRate(2); })
	.then(function(res3)
	{
		results = results.concat(res3);
		return results;
	})
	.then(function(finalr)
	{
		self.radio.on('console', self.handleConsole);
		return finalr;
	})
	.fail(function(err)
	{
		console.log('failure while finding copters');
		console.log(err);
	});
};

CrazyDriver.DATARATE =
{
	0: '250KPS',
	1: '1MPS',
	2: '2MPS'
};

CrazyDriver.prototype.handleConsole = function(packet)
{
	console.log('CONSOLE:', packet.data.toString());
};

CrazyDriver.prototype.scanAtRate = function(datarate)
{
	var self = this;

	return self.radio.setDataRate(datarate)
	.then(function()
	{
		var buf = new Buffer(1);
		buf[0] = 0xFF;
		return self.radio.scanChannels(0, 127, buf);
	})
	.then(function(result)
	{
		var copters = [];
		for (var i = 0; i < result.length; i++)
		{
			copters.push(util.format('radio://1/%d/%s', result[i], CrazyDriver.DATARATE[datarate]));
			console.log(copters[i]);
		}

		return copters;
	});
};


CrazyDriver.prototype.connect = function(uri)
{
	var self = this;

	this.uri = uri;
	var parsed = url.parse(uri);
	var pieces = parsed.pathname.split('/');
	// preferred usb device is at parsed.hostname

	if (pieces.length === 3)
	{
		switch (pieces[2])
		{
		case '250KPS':
			this.datarate = Crazyradio.DATARATE['250KPS'];
			break;

		case '1MPS':
			this.datarate = Crazyradio.DATARATE['1MPS'];
			break;

		case '2MPS':
			this.datarate = Crazyradio.DATARATE['2MPS'];
			break;
		}
	}

	this.radio.addListener('logging', this.telemetry.handlePacket.bind(this.telemetry));
	this.radio.addListener('param', this.parameters.handlePacket.bind(this.parameters));

	this.channel = parseInt(pieces[1], 10);
	return self.radio.setupRadio(null, self.channel, self.datarate)
	.then(function()
	{
		return self.startTelemetry(); // completion required for flight
	})
	.then(function()
	{
		return self.fetchParameters();
	});
};

CrazyDriver.prototype.version = function()
{
	if (!this.radio)
		return 'not connected to radio';

	return 'Crazyradio version ' + this.radio.version;
};

CrazyDriver.prototype.close = function()
{
	if (!this.radio)
		return P('OK');

	return this.radio.close();
};

CrazyDriver.prototype.setpoint = function(roll, pitch, yaw, thrust)
{
	var self = this,
		deferred = P.defer();

	var packet = new Crazypacket();
	packet.port = Protocol.Ports.COMMANDER;

	packet.writeFloat(roll)
		.writeFloat(-pitch)
		.writeFloat(yaw)
		.writeUnsignedShort(thrust)
		.endPacket();

	return this.radio.sendPacket(packet)
	.then(function(item)
	{
		return item;
	})
	.fail(function(err)
	{
		console.log('failure in setpoint');
		console.log(err);
	});
};

// parameter functions: get list, set, get

CrazyDriver.prototype.fetchParameters = function()
{
	var self = this;
	this.parametersDeferred = P.defer();
	this.requestTOC(Protocol.Ports.PARAM);
	return this.parametersDeferred.promise;
};

CrazyDriver.prototype.parametersDone = function()
{
	if (!this.parametersDeferred) return;
	this.parametersDeferred.resolve('OK');
	this.parametersDeferred = undefined;
};

CrazyDriver.prototype.getParameter = function(param)
{
	var packet = new Crazypacket();
	packet.port = Protocol.Ports.PARAM;
	packet.channel = Protocol.Channels.PARAM_READ;
	packet.writeByte(param);
	packet.endPacket();

	return this.radio.sendPacket(packet);
};

CrazyDriver.prototype.setParameter = function(param, value)
{
	var packet = new Crazypacket();
	packet.port = Protocol.Ports.PARAM;
	packet.channel = Protocol.Channels.PARAM_WRITE;

	packet.writeByte(param.id)
	.writeType(param.type, value)
	.endPacket();

	return this.radio.sendPacket(packet);
};

// telemetry, which the Crazy protocol calls "logging"
var ttime;

CrazyDriver.prototype.startTelemetry = function()
{
	console.log('starting telemetry');
	ttime = Date.now();
	var self = this;
	this.telemetryDeferred = P.defer();

	var packet = new Crazypacket();
	packet.port = Protocol.Ports.LOGGING;
	packet.channel = Protocol.Channels.SETTINGS;
	packet.writeByte(Protocol.Commands.RESET_LOGGING);
	packet.endPacket();

	this.radio.sendPacket(packet)
	.then(function()
	{
		self.requestTOC(Protocol.Ports.LOGGING);
	});

	return this.telemetryDeferred.promise;
};

CrazyDriver.prototype.telemetryReady = function()
{
	console.log('telemetry ready; elapsed=', (Date.now() - ttime));
	if (!this.telemetryDeferred) return;
	this.telemetryDeferred.resolve('OK');
	this.telemetryDeferred = undefined;
};

// ---------------------
// now the heavy lifting

CrazyDriver.prototype.requestTOC = function(which)
{
	var packet = new Crazypacket();
	packet.port = which;
	packet.channel = Protocol.Channels.TOC;
	packet.writeByte(Protocol.Commands.GET_INFO);
	packet.endPacket();

	return this.radio.sendPacket(packet);
};

// request details about a specific parameter or telemetry item

CrazyDriver.prototype.requestTelemetryElement = function(id)
{
	return this.requestTOCItem(Protocol.Ports.LOGGING, id);
};

CrazyDriver.prototype.requestParameter = function(id)
{
	return this.requestTOCItem(Protocol.Ports.PARAM, id);
};

CrazyDriver.prototype.requestTOCItem = function(port, id)
{
	var packet = new Crazypacket();
	packet.port = port;
	packet.channel = Protocol.Channels.TOC;
	packet.writeByte(Protocol.Commands.GET_ELEMENT);
	if (id)
		packet.writeByte(id);
	packet.endPacket();

	return this.radio.sendPacket(packet);
};

// Create a telemetry block, aka a group of sensor readings that
// get emitted by the copter periodically.

CrazyDriver.prototype.createTelemetryBlock = function(block)
{
	var packet = new Crazypacket();
	packet.port = Protocol.Ports.LOGGING;
	packet.channel = Protocol.Channels.SETTINGS;
	packet.writeByte(Protocol.Commands.CREATE_BLOCK)
		.writeByte(block.id);

	for (var i = 0; i < block.variables.length; i++)
	{
		var item = block.variables[i];
		packet.writeByte(item.type << 4 | item.fetchAs)
			.writeByte(item.id);
	}

	packet.endPacket();
	return this.radio.sendPacket(packet);
};

CrazyDriver.prototype.enableTelemetryBlock = function(block)
{
	var packet = new Crazypacket();
	packet.port = Protocol.Ports.LOGGING;
	packet.channel = Protocol.Channels.SETTINGS;
	packet.writeByte(Protocol.Commands.START_LOGGING)
		.writeByte(block)
		.writeByte(10) // period
		.endPacket();

	return this.radio.sendPacket(packet);
};

CrazyDriver.prototype.handleAck = function(buf)
{
	// TODO record ack stats-- dropped packets etc
	var ack = new Crazypacket.RadioAck(buf);
	return P(ack);
};
