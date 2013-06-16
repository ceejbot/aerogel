// Crazy Real Time Protocol Driver
// This module knows how to format messages for the crazy radio and the copter.

var
	_           = require('lodash'),
	events      = require('events'),
	url         = require('url'),
	util        = require('util'),
	P           = require('p-promise'),
	Crazyradio  = require('./crazyradio'),
	Crazypacket = require('./crazypacket'),
	Telemetry   = require('./telemetry')
	;

function CrazyDriver(name)
{
	events.EventEmitter.call(this);

	this.uri      = '';
	this.channel  = 2;
	this.datarate = 2;
	this.queue    = [];
	this.telemetry = new Telemetry(this);
}
util.inherits(CrazyDriver, events.EventEmitter);

CrazyDriver.prototype.findCopters = function()
{
	var self = this;
	self.radio = new Crazyradio();

	var results;

	return self.radio.setupRadio()
	.then(self.radio.setAckRetryCount(1))
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
	// prefered usb device is at parsed.hostname

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

	this.channel = parseInt(pieces[1], 10);
	return self.radio.setupRadio(null, self.channel, self.datarate);
};

CrazyDriver.prototype.status = function()
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
	packet.port = Crazypacket.Ports.COMMANDER;

	// first byte is for the header data
	packet.writeFloat(roll)
		.writeFloat(-pitch)
		.writeFloat(yaw)
		.writeUnsignedShort(thrust)
		.endPacket();

	return this.radio.sendPacket(packet)
	.then(function(item)
	{
		// console.log(item);
		return item;
	})
	.fail(function(err)
	{
		console.log('failure in setpoint');
		console.log(err);
	});
};

// parameter functions: get list, set, get
// telemetry aka logging functions

CrazyDriver.prototype.startTelemetry = function()
{
	this.telemetryDeferred = P.defer();

	this.radio.addListener('logging', this.telemetry.handlePacket.bind(this.telemetry));
	this.requestTOC();

	return this.telemetryDeferred.promise;
};

CrazyDriver.prototype.telemetryReady = function()
{
	this.telemetryDeferred.resolve('OK');
};

CrazyDriver.prototype.onStabilizerTelemetry = function(subfunc)
{
	this.telemetry.addSubscriber(subfunc, 'stabilizer');
};

CrazyDriver.prototype.onMotorTelemetry = function(subfunc)
{
	this.telemetry.addSubscriber(subfunc, 'motor');
};

CrazyDriver.prototype.requestTOC = function()
{
	var self = this;

	var packet = new Crazypacket();
	packet.port = Crazypacket.Ports.LOGGING;
	packet.channel = Crazypacket.Channels.SETTINGS;
	packet.writeByte(Crazypacket.Commands.RESET_LOGGING);
	packet.endPacket();
	console.log('toc logging reset', packet.data);

	return self.radio.sendPacket(packet)
	.then(function()
	{
		packet = new Crazypacket();
		packet.port = Crazypacket.Ports.LOGGING;
		packet.channel = Crazypacket.Channels.TOC;
		packet.writeByte(Crazypacket.Commands.GET_INFO);
		packet.endPacket();
		console.log('toc fetch start', packet.data);

		return self.radio.sendPacket(packet);
	});
};

CrazyDriver.prototype.requestTelemetryElement = function(id)
{
	var packet = new Crazypacket();
	packet.port = Crazypacket.Ports.LOGGING;
	packet.channel = Crazypacket.Channels.TOC;
	packet.writeByte(Crazypacket.Commands.GET_ELEMENT);
	if (id)
		packet.writeByte(id);
	packet.endPacket();

	return this.radio.sendPacket(packet);
};

CrazyDriver.prototype.createTelemetryBlock = function(block)
{
	var packet = new Crazypacket();
	packet.port = Crazypacket.Ports.LOGGING;
	packet.channel = Crazypacket.Channels.SETTINGS;
	packet.writeByte(Crazypacket.Commands.CREATE_BLOCK)
		.writeByte(block.id);

	for (var i = 0; i < block.variables.length; i++)
	{
		var item = block.variables[i];
		packet.writeByte(item.type << 4 | item.storage)
			.writeByte(item.id);
	}

	packet.endPacket();
	return this.radio.sendPacket(packet);
};

CrazyDriver.prototype.enableTelemetryBlock = function(block)
{
	var packet = new Crazypacket();
	packet.port = Crazypacket.Ports.LOGGING;
	packet.channel = Crazypacket.Channels.SETTINGS;
	packet.writeByte(Crazypacket.Commands.START_LOGGING)
		.writeByte(block)
		.writeByte(10) // period
		.endPacket();

	return this.radio.sendPacket(packet);
};

CrazyDriver.prototype.handleAck = function(buf)
{
	// TODO record ack stats
	var ack = new Crazypacket.RadioAck(buf);
	return P(ack);
};

module.exports = CrazyDriver;
